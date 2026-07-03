import { AiError, LanguageModel, Prompt } from "@effect/ai";
import { Effect, Match, Ref, Schema } from "effect";
import type { SrtData, SrtSubtitle } from "../data/srt.ts";
import { getFullText } from "../data/srt.ts";
import { formatAsEpisodeCode, languageCodeToName, type SubtitleTranslationData } from "../data/translation-mode.ts";

class ChunkExperimentalTranslationError extends Schema.TaggedError<ChunkExperimentalTranslationError>()(
  "ChunkExperimentalTranslationError",
  {
    message: Schema.String,
  },
) {}

type ChunkDescriptor = {
  currentChunk: SrtSubtitle[];
  chunkStart: number;
  contextBefore: SrtSubtitle[];
  contextAfter: SrtSubtitle[];
  chunkIndex: number;
  totalChunks: number;
  splitPath: string;
};

export type TranslateChunkedExperimentalParams = {
  chunkSize: number;
  surroundingContextLength: number;
  maxRetries: number;
  concurrency: number;
};

export function translateChunkedExperimental(
  data: SubtitleTranslationData,
  params: TranslateChunkedExperimentalParams,
): Effect.Effect<SrtData, never, LanguageModel.LanguageModel> {
  return Effect.gen(function* () {
    const systemPrompt = buildSystemPrompt(data);
    const subtitles = data.srtData.subtitles;
    const totalChunks = Math.ceil(subtitles.length / params.chunkSize);

    const completedRef = yield* Ref.make(0);

    yield* Effect.logInfo(`Translating ${subtitles.length} subtitles in ${totalChunks} chunks.`);
    yield* Effect.logDebug(`Parameters`, params);

    const chunkDescriptors: ChunkDescriptor[] = [];
    for (let chunkStart = 0; chunkStart < subtitles.length; chunkStart += params.chunkSize) {
      const chunkEnd = Math.min(chunkStart + params.chunkSize, subtitles.length);
      chunkDescriptors.push({
        currentChunk: subtitles.slice(chunkStart, chunkEnd),
        chunkStart,
        contextBefore: subtitles.slice(Math.max(chunkStart - params.surroundingContextLength, 0), chunkStart),
        contextAfter: subtitles.slice(chunkEnd, Math.min(chunkEnd + params.surroundingContextLength, subtitles.length)),
        chunkIndex: chunkDescriptors.length,
        totalChunks,
        splitPath: `${chunkDescriptors.length + 1}`,
      });
    }

    const result = yield* Effect.forEach(
      chunkDescriptors,
      (chunkDescriptor) =>
        translateChunkWithSplitting(systemPrompt, chunkDescriptor, params.maxRetries).pipe(
          Effect.tap(() =>
            Ref.updateAndGet(completedRef, (n) => n + 1).pipe(
              Effect.flatMap((completed) =>
                Effect.logInfo(`Translated experimental chunk ${chunkDescriptor.splitPath} (${completed}/${totalChunks})`),
              ),
            ),
          ),
        ),
      { concurrency: params.concurrency },
    );

    yield* Effect.logInfo("Experimental translation complete.");

    return { subtitles: result.flat() };
  });
}

function translateChunkWithSplitting(
  systemPrompt: string,
  chunkDescriptor: ChunkDescriptor,
  maxRetries: number,
): Effect.Effect<SrtSubtitle[], never, LanguageModel.LanguageModel> {
  return translateChunkAttempt(systemPrompt, chunkDescriptor, maxRetries).pipe(
    Effect.catchAll((error) => {
      if (chunkDescriptor.currentChunk.length <= 1) {
        const singleSubtitle = chunkDescriptor.currentChunk[0];
        const orderLabel = singleSubtitle?.order ?? "?";
        return Effect.logWarning(
          `Experimental chunk ${chunkDescriptor.splitPath}: failed to translate subtitle ${orderLabel} after ${maxRetries + 1} attempts. Keeping original subtitle.`,
        ).pipe(Effect.as([...chunkDescriptor.currentChunk]));
      }

      const [left, right] = splitChunkDescriptor(chunkDescriptor);

      return Effect.logWarning(
        `Experimental chunk ${chunkDescriptor.splitPath}: ${error.message}. Splitting ${chunkDescriptor.currentChunk.length} subtitles into ${left.currentChunk.length} + ${right.currentChunk.length}.`,
      ).pipe(
        Effect.zipRight(
          Effect.all([
            translateChunkWithSplitting(systemPrompt, left, maxRetries),
            translateChunkWithSplitting(systemPrompt, right, maxRetries),
          ]),
        ),
        Effect.map(([leftResult, rightResult]) => [...leftResult, ...rightResult]),
      );
    }),
  );
}

function buildSystemPrompt(data: SubtitleTranslationData): string {
  const contentHeader = Match.value(data).pipe(
    Match.when({ kind: "movie" }, (d) => `
      You are a professional movie translator (${languageCodeToName(d.sourceLanguage)} to ${languageCodeToName(d.targetLanguage)}).
      Movie: ${d.titleMetadata.title} (${d.titleMetadata.releaseYear})
    `),
    Match.when({ kind: "episode" }, (d) => `
      You are a professional TV series translator (${languageCodeToName(d.sourceLanguage)} to ${languageCodeToName(d.targetLanguage)}).
      Series: ${d.episodeMetadata.seriesTitle}, episode ${formatAsEpisodeCode(d.episodeMetadata)} "${d.episodeMetadata.episodeTitle}"
    `),
    Match.exhaustive,
  );

  const descriptionText = `Description: ${data.titleMetadata.description}`;

  return `
${contentHeader}
${descriptionText}

Rules:
- Input will have "Context before", "Translate these subtitles", and "Context after" sections.
- Use context for accuracy, but ONLY translate subtitles in the "Translate these subtitles" section.
- Return each translated subtitle inside a <subtitle id="..."> tag.
- Preserve the tone and natural spoken style.
- Preserve internal line breaks.
- Do NOT include markdown, code fences, or any text outside the subtitle tags.
  `.trim();
}

function formatSubtitleBlock(subtitle: SrtSubtitle): string {
  return `<subtitle id="${subtitle.order}">\n${getFullText(subtitle)}\n</subtitle>`;
}

function buildUserPrompt(chunkDescriptor: ChunkDescriptor): string {
  const parts: string[] = [];

  if (chunkDescriptor.contextBefore.length > 0) {
    parts.push("Context before:");
    parts.push(chunkDescriptor.contextBefore.map(formatSubtitleBlock).join("\n"));
  }

  parts.push("Translate these subtitles:");
  parts.push(chunkDescriptor.currentChunk.map(formatSubtitleBlock).join("\n"));

  if (chunkDescriptor.contextAfter.length > 0) {
    parts.push("Context after:");
    parts.push(chunkDescriptor.contextAfter.map(formatSubtitleBlock).join("\n"));
  }

  return parts.join("\n\n");
}

function parseTaggedSubtitleTranslations(
  rawText: string,
  requestedIds: Set<string>,
): Effect.Effect<Map<string, string[]>, ChunkExperimentalTranslationError> {
  const tagRegex = /<subtitle\s+id=["']?([^"'>\s]+)["']?\s*>([\s\S]*?)<\/subtitle>/gi;
  const parsedMap = new Map<string, string[]>();
  const seenIds = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(rawText)) !== null) {
    const id = match[1];
    const contentRaw = match[2];

    if (id === undefined || contentRaw === undefined) {
      continue;
    }

    const content = contentRaw.replace(/\r\n/g, "\n");

    if (seenIds.has(id)) {
      return Effect.fail(new ChunkExperimentalTranslationError({
        message: `Duplicate subtitle id: ${id}`,
      }));
    }

    if (content.trim().length === 0) {
      return Effect.fail(new ChunkExperimentalTranslationError({
        message: `Empty translation for subtitle id: ${id}`,
      }));
    }

    seenIds.add(id);
    parsedMap.set(id, content.split("\n"));
  }

  if (parsedMap.size === 0) {
    return Effect.fail(new ChunkExperimentalTranslationError({
      message: "No valid <subtitle> tags found in response.",
    }));
  }

  const missingIds: string[] = [];
  for (const id of requestedIds) {
    if (!parsedMap.has(id)) {
      missingIds.push(id);
    }
  }

  if (missingIds.length > 0) {
    return Effect.fail(new ChunkExperimentalTranslationError({
      message: `Missing subtitle ids: ${missingIds.join(", ")}`,
    }));
  }

  return Effect.succeed(parsedMap);
}

function translateChunkAttempt(
  systemPrompt: string,
  chunkDescriptor: ChunkDescriptor,
  maxRetries: number,
): Effect.Effect<SrtSubtitle[], ChunkExperimentalTranslationError | AiError.AiError, LanguageModel.LanguageModel> {
  return Effect.gen(function* () {
    const userPrompt = buildUserPrompt(chunkDescriptor);

    const messagesRef = yield* Ref.make<Array<Prompt.MessageEncoded>>([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    const singleAttempt = Effect.gen(function* () {
      const messages = yield* Ref.get(messagesRef);

      const response = yield* LanguageModel.generateText({ prompt: messages });
      const rawText = response.text;

      const requestedIds = new Set(chunkDescriptor.currentChunk.map((s) => s.order));
      const parsed = yield* parseTaggedSubtitleTranslations(rawText, requestedIds);

      return chunkDescriptor.currentChunk.map((subtitle) => {
        const translation = parsed.get(subtitle.order);
        return {
          order: subtitle.order,
          timestamp: subtitle.timestamp,
          content: translation ?? subtitle.content,
        } satisfies SrtSubtitle;
      });
    }).pipe(
      Effect.tapError((error) =>
        Effect.logWarning(`Experimental chunk ${chunkDescriptor.splitPath}: attempt failed (${error._tag}: ${error.message}). Retrying with repair prompt.`)
          .pipe(Effect.zipRight(Ref.update(messagesRef, (messages) => [
            ...messages,
            {
              role: "user" as const,
              content:
                `Your previous response could not be parsed: ${error.message}.\nReturn ONLY valid <subtitle id="...">...</subtitle> blocks for the requested subtitles. Do not include context, explanations, markdown, or code fences.`,
            },
          ]))),
      ),
    );

    return yield* singleAttempt.pipe(
      Effect.retry({ times: maxRetries }),
    );
  });
}

function splitChunkDescriptor(chunkDescriptor: ChunkDescriptor): [ChunkDescriptor, ChunkDescriptor] {
  const midpoint = Math.ceil(chunkDescriptor.currentChunk.length / 2);
  const leftHalf = chunkDescriptor.currentChunk.slice(0, midpoint);
  const rightHalf = chunkDescriptor.currentChunk.slice(midpoint);

  const left: ChunkDescriptor = {
    currentChunk: leftHalf,
    chunkStart: chunkDescriptor.chunkStart,
    contextBefore: chunkDescriptor.contextBefore,
    contextAfter: [...rightHalf, ...chunkDescriptor.contextAfter],
    chunkIndex: chunkDescriptor.chunkIndex,
    totalChunks: chunkDescriptor.totalChunks,
    splitPath: `${chunkDescriptor.splitPath}-L`,
  };

  const right: ChunkDescriptor = {
    currentChunk: rightHalf,
    chunkStart: chunkDescriptor.chunkStart + leftHalf.length,
    contextBefore: [...chunkDescriptor.contextBefore, ...leftHalf],
    contextAfter: chunkDescriptor.contextAfter,
    chunkIndex: chunkDescriptor.chunkIndex,
    totalChunks: chunkDescriptor.totalChunks,
    splitPath: `${chunkDescriptor.splitPath}-R`,
  };

  return [left, right];
}

