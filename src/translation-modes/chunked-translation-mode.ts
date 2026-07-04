import { AiError, LanguageModel, Prompt } from "@effect/ai";
import { Array as Arr, Effect, Either, Match, Ref, Schema } from "effect";
import type { SrtData, SrtSubtitle } from "../data/srt.ts";
import { getFullText } from "../data/srt.ts";
import { formatAsEpisodeCode, languageCodeToName, type SubtitleTranslationData } from "../data/translation-mode.ts";

class ChunkTranslationError extends Schema.TaggedError<ChunkTranslationError>()(
  "ChunkTranslationError",
  {
    message: Schema.String,
  },
) {}

type TranslationError = ChunkTranslationError | AiError.AiError;

type Chunk = {
  subtitles: SrtSubtitle[];
  contextBefore: SrtSubtitle[];
  contextAfter: SrtSubtitle[];
  label: string;
};

export type TranslateChunkedParams = {
  chunkSize: number;
  surroundingContextLength: number;
  maxRetries: number;
  concurrency: number;
};

export function translateChunked(
  data: SubtitleTranslationData,
  params: TranslateChunkedParams,
): Effect.Effect<SrtData, never, LanguageModel.LanguageModel> {
  return Effect.gen(function* () {
    const systemPrompt = buildSystemPrompt(data);
    const chunks = makeChunks(data.srtData.subtitles, params);

    yield* Effect.logInfo(`Translating ${data.srtData.subtitles.length} subtitles in ${chunks.length} chunks.`);
    yield* Effect.logDebug("Parameters", params);

    const completedCount = yield* Ref.make(0);

    const logProgress = (chunk: Chunk): Effect.Effect<void> =>
      Ref.updateAndGet(completedCount, (n) => n + 1).pipe(
        Effect.flatMap((completed) =>
          Effect.logInfo(`Translated chunk ${chunk.label} (${completed}/${chunks.length})`),
        ),
      );

    const translated = yield* Effect.forEach(
      chunks,
      (chunk) => translateChunk(systemPrompt, chunk, params.maxRetries).pipe(Effect.tap(() => logProgress(chunk))),
      { concurrency: params.concurrency },
    );

    yield* Effect.logInfo("Translation complete.");

    return { subtitles: translated.flat() };
  });
}

function makeChunks(subtitles: SrtSubtitle[], params: TranslateChunkedParams): Chunk[] {
  return Arr.chunksOf(subtitles, params.chunkSize).map((chunk, index) => {
    const start = index * params.chunkSize;
    const end = start + chunk.length;

    return {
      subtitles: chunk,
      contextBefore: subtitles.slice(Math.max(start - params.surroundingContextLength, 0), start),
      contextAfter: subtitles.slice(end, end + params.surroundingContextLength),
      label: `${index + 1}`,
    };
  });
}

/**
 * Translates a chunk, retrying with repair prompts. If all attempts fail, the chunk is
 * split in half and each half is translated recursively. Single subtitles that still
 * fail are kept untranslated, so this never fails as a whole.
 */
function translateChunk(
  systemPrompt: string,
  chunk: Chunk,
  maxRetries: number,
): Effect.Effect<SrtSubtitle[], never, LanguageModel.LanguageModel> {
  const initialMessages: Prompt.MessageEncoded[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildUserPrompt(chunk) },
  ];

  return attemptTranslation(chunk, initialMessages, maxRetries)
    .pipe(Effect.catchAll((error) => {
      if (chunk.subtitles.length === 1) {
        const orderLabel = chunk.subtitles[0]?.order;
        return Effect.succeed(chunk.subtitles)
          .pipe(Effect.tap(() =>
            Effect.logWarning(`Chunk ${chunk.label}: failed to translate subtitle ${orderLabel} after ${maxRetries + 1} attempts. Keeping original subtitle.`),
          ));
      }

      const [left, right] = splitChunk(chunk);

      return Effect.logWarning(`Chunk ${chunk.label}: ${error.message}. Splitting ${chunk.subtitles.length} subtitles into ${left.subtitles.length} + ${right.subtitles.length}.`)
        .pipe(
          Effect.zipRight(Effect.all([
            translateChunk(systemPrompt, left, maxRetries),
            translateChunk(systemPrompt, right, maxRetries),
          ])),
          Effect.map(([leftResult, rightResult]) => [...leftResult, ...rightResult]),
        );
    }));
}

/**
 * Requests a translation, retrying up to `retriesLeft` more times. Each failed attempt
 * appends a repair message to the conversation before retrying.
 */
function attemptTranslation(
  chunk: Chunk,
  messages: Prompt.MessageEncoded[],
  retriesLeft: number,
): Effect.Effect<SrtSubtitle[], TranslationError, LanguageModel.LanguageModel> {
  const requestTranslation = (chunk: Chunk, messages: Prompt.MessageEncoded[]): Effect.Effect<SrtSubtitle[], TranslationError, LanguageModel.LanguageModel> => Effect.gen(function* () {
    const response = yield* LanguageModel.generateText({ prompt: messages });

    const requestedIds = new Set(chunk.subtitles.map((s) => s.order));
    const translations = yield* parseTaggedSubtitles(response.text, requestedIds);

    return chunk.subtitles.map((subtitle) => ({
      ...subtitle,
      content: translations.get(subtitle.order) ?? subtitle.content,
    }));
  });

  const repairMessage = (error: TranslationError): Prompt.MessageEncoded => ({
    role: "user",
    content:
      `Your previous response could not be parsed: ${error.message}.\nReturn ONLY valid <subtitle id="...">...</subtitle> blocks for the requested subtitles. Do not include context, explanations, markdown, or code fences.`,
  });


  return requestTranslation(chunk, messages).pipe(
    Effect.tapError((error) =>
      Effect.logWarning(`Chunk ${chunk.label}: attempt failed (${error._tag}: ${error.message}). Retrying with repair prompt.`),
    ),
    Effect.catchAll((error) =>
      retriesLeft > 0
        ? attemptTranslation(chunk, [...messages, repairMessage(error)], retriesLeft - 1)
        : Effect.fail(error),
    ),
  );
}

const SUBTITLE_TAG_REGEX = /<subtitle\s+id=["']?([^"'>\s]+)["']?\s*>([\s\S]*?)<\/subtitle>/gi;

function parseTaggedSubtitles(
  rawText: string,
  requestedIds: ReadonlySet<string>,
): Either.Either<Map<string, string[]>, ChunkTranslationError> {
  const translations = new Map<string, string[]>();

  for (const [, id, rawContent] of rawText.matchAll(SUBTITLE_TAG_REGEX)) {
    if (!id || !rawContent) continue;

    if (translations.has(id)) {
      return Either.left(new ChunkTranslationError({ message: `Duplicate subtitle id: ${id}` }));
    }

    const content = rawContent.replace(/\r\n/g, "\n").trim();
    if (content.length === 0) {
      return Either.left(new ChunkTranslationError({ message: `Empty translation for subtitle id: ${id}` }));
    }

    translations.set(id, content.split("\n"));
  }

  if (translations.size === 0) {
    return Either.left(new ChunkTranslationError({ message: "No valid <subtitle> tags found in response." }));
  }

  const missingIds = [...requestedIds].filter((id) => !translations.has(id));
  if (missingIds.length > 0) {
    return Either.left(new ChunkTranslationError({ message: `Missing subtitle ids: ${missingIds.join(", ")}` }));
  }

  return Either.right(translations);
}

function splitChunk(chunk: Chunk): [Chunk, Chunk] {
  const midpoint = Math.ceil(chunk.subtitles.length / 2);
  const left = chunk.subtitles.slice(0, midpoint);
  const right = chunk.subtitles.slice(midpoint);

  return [
    {
      subtitles: left,
      contextBefore: chunk.contextBefore,
      contextAfter: [...right, ...chunk.contextAfter],
      label: `${chunk.label}-L`,
    },
    {
      subtitles: right,
      contextBefore: [...chunk.contextBefore, ...left],
      contextAfter: chunk.contextAfter,
      label: `${chunk.label}-R`,
    },
  ];
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

  return `
${contentHeader}
Description: ${data.titleMetadata.description}

Rules:
- Input will have "Context before", "Translate these subtitles", and "Context after" sections.
- Use context for accuracy, but ONLY translate subtitles in the "Translate these subtitles" section.
- Return each translated subtitle inside a <subtitle id="..."> tag.
- Preserve the tone and natural spoken style.
- Preserve internal line breaks.
- Do NOT include markdown, code fences, or any text outside the subtitle tags.
  `.trim();
}

function buildUserPrompt(chunk: Chunk): string {
  const formatSubtitleBlock = (subtitle: SrtSubtitle): string =>
    `<subtitle id="${subtitle.order}">\n${getFullText(subtitle)}\n</subtitle>`;

  const section = (header: string, subtitles: SrtSubtitle[]): string[] =>
    subtitles.length > 0 ? [header, subtitles.map(formatSubtitleBlock).join("\n")] : [];

  return [
    ...section("Context before:", chunk.contextBefore),
    ...section("Translate these subtitles:", chunk.subtitles),
    ...section("Context after:", chunk.contextAfter),
  ].join("\n\n");
}
