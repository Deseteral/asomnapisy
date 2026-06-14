import { AiError, LanguageModel, Prompt } from "@effect/ai";
import { Effect, Match, Ref, Schema } from "effect";
import type { SrtData, SrtSubtitle } from "../data/srt.ts";
import { getFullText } from "../data/srt.ts";
import { formatAsEpisodeCode, languageCodeToName, type SubtitleTranslationData } from "../data/translation-mode.ts";

class ChunkTranslationError extends Schema.TaggedError<ChunkTranslationError>()("ChunkTranslationError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
}

type ChunkPrompt = {
  context_before: string;
  translate_this: string[];
  context_after: string;
};

const ChunkResponseSchema = Schema.Struct({
  translations: Schema.Array(Schema.String),
});

type ChunkDescriptor = {
  currentChunk: SrtSubtitle[];
  chunkStart: number;
  contextBefore: SrtSubtitle[];
  contextAfter: SrtSubtitle[];
  chunkIndex: number;
  totalChunks: number;
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
): Effect.Effect<SrtData, AiError.AiError | ChunkTranslationError, LanguageModel.LanguageModel> {
  const systemPrompt = buildSystemPrompt(data);
  const subtitles = data.srtData.subtitles;
  const totalChunks = Math.ceil(subtitles.length / params.chunkSize);

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
    });
  }

  return Effect.forEach(
    chunkDescriptors,
    (chunkDescriptor) =>
      translateChunk(systemPrompt, chunkDescriptor, params.maxRetries).pipe(
        Effect.tap(() => Effect.logInfo(`Translated chunk ${chunkDescriptor.chunkIndex + 1}/${chunkDescriptor.totalChunks}`)),
      ),
    { concurrency: params.concurrency },
  ).pipe(
    Effect.map((chunks) => ({ subtitles: chunks.flat() })),
  );
}

function translateChunk(
  systemPrompt: string,
  chunkDescriptor: ChunkDescriptor,
  maxRetries: number,
): Effect.Effect<SrtSubtitle[], AiError.AiError | ChunkTranslationError, LanguageModel.LanguageModel> {
  return Effect.gen(function* () {
    const payload: ChunkPrompt = {
      context_before: chunkDescriptor.contextBefore.map((s) => getFullText(s)).join("\n"),
      translate_this: chunkDescriptor.currentChunk.map((s) => getFullText(s)),
      context_after: chunkDescriptor.contextAfter.map((s) => getFullText(s)).join("\n"),
    };

    const messagesRef = yield* Ref.make<Array<Prompt.MessageEncoded>>([
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(payload) },
    ]);

    const singleAttempt = Effect.gen(function* () {
      const messages = yield* Ref.get(messagesRef);

      const response = yield* LanguageModel.generateText({ prompt: messages });
      const rawText = response.text;

      const parsed = yield* Schema.decodeUnknown(Schema.parseJson(ChunkResponseSchema))(rawText).pipe(
        Effect.mapError((parseError) => new ChunkTranslationError({ message: `Failed to decode response: ${parseError.message}` })),
      );

      if (parsed.translations.length !== chunkDescriptor.currentChunk.length) {
        return yield* new ChunkTranslationError({
          message: `Expected ${chunkDescriptor.currentChunk.length} translations but got ${parsed.translations.length}.`,
        });
      }

      return parsed.translations.map((text, idx) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const original = chunkDescriptor.currentChunk[idx]!;
        return {
          order: original.order,
          timestamp: original.timestamp,
          content: text.split("\n"),
        };
      }) satisfies SrtSubtitle[];
    }).pipe(
      Effect.tapError((error) =>
        Effect.logError(`Chunk ${chunkDescriptor.chunkStart}: ${error._tag}: ${error.message}`)
          .pipe(Effect.zipRight(Ref.update(messagesRef, (messages) =>
            [...messages, { role: "user" as const, content: `Fix your response: ${error.message}` }],
          ))),
      ),
    );

    return yield* singleAttempt.pipe(
      Effect.retry({ times: maxRetries }),
      Effect.catchAll(() =>
        Effect.logWarning(`Failed to translate chunk at index ${chunkDescriptor.chunkStart} after ${maxRetries + 1} attempts. Keeping original subtitles.`)
          .pipe(Effect.as([...chunkDescriptor.currentChunk])),
      ),
    );
  });
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
- Input is a JSON object with 'context_before', 'translate_this', and 'context_after'.
- Use context for accuracy, but ONLY translate strings in the 'translate_this' array.
- Return a JSON object with a single key 'translations' containing the array of translated strings.
- Parity is mandatory: the output array length MUST match the input 'translate_this' length.
- Preserve the tone and natural spoken style.
- Preserve '\\n' line breaks.
  `.trim();
}
