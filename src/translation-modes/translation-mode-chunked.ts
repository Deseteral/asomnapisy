import { Effect } from "effect";
import type { SrtData, SrtSubtitle } from "../data/srt.ts";
import { getFullText } from "../data/srt.ts";
import type { TranslateMovieChunkedParams, TranslateMovieData } from "../data/translation-mode.ts";
import { type ChatMessage, LlmClient, type LlmError } from "../services/llm-client.ts";

type ChunkPrompt = {
  context_before: string;
  translate_this: string[];
  context_after: string;
};

type ChunkResponse = {
  translations: string[];
};

export function translateMovieChunked(
  data: TranslateMovieData,
  params: TranslateMovieChunkedParams,
): Effect.Effect<SrtData, LlmError, LlmClient> {
  return Effect.gen(function* () {
    const systemPrompt = buildSystemPrompt(data);
    const subtitles = data.srtData.subtitles;
    const translatedSubtitles: SrtSubtitle[] = [];

    for (let chunkStart = 0; chunkStart < subtitles.length; chunkStart += params.chunkSize) {
      const chunkEnd = Math.min(chunkStart + params.chunkSize, subtitles.length);

      const currentChunk = subtitles.slice(chunkStart, chunkEnd);
      const contextBefore = subtitles.slice(Math.max(chunkStart - params.surroundingContextLength, 0), chunkStart);
      const contextAfter = subtitles.slice(chunkEnd, Math.min(chunkEnd + params.surroundingContextLength, subtitles.length));

      const chunkResult = yield* translateChunk(
        data,
        params,
        systemPrompt,
        currentChunk,
        chunkStart,
        contextBefore,
        contextAfter,
      );

      translatedSubtitles.push(...chunkResult);

      yield* Effect.logInfo(
        `Translated chunk ${Math.floor(chunkStart / params.chunkSize) + 1}/${Math.ceil(subtitles.length / params.chunkSize)}`,
      );
    }

    return { subtitles: translatedSubtitles };
  });
}

function translateChunk(
  data: TranslateMovieData,
  params: TranslateMovieChunkedParams,
  systemPrompt: string,
  currentChunk: SrtSubtitle[],
  chunkStart: number,
  contextBefore: SrtSubtitle[],
  contextAfter: SrtSubtitle[],
): Effect.Effect<SrtSubtitle[], LlmError, LlmClient> {
  return Effect.gen(function* () {
    const llm = yield* LlmClient;

    const payload: ChunkPrompt = {
      context_before: contextBefore.map((s) => getFullText(s)).join("\n"),
      translate_this: currentChunk.map((s) => getFullText(s)),
      context_after: contextAfter.map((s) => getFullText(s)).join("\n"),
    };

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(payload) },
    ];

    for (let attempt = 0; attempt <= params.maxRetries; attempt += 1) {
      const output = yield* llm.chatCompletion({
        messages,
        model: data.model,
        responseFormat: "json_object",
      });

      try {
        const { translations } = decodeChunkResponse(output, currentChunk.length);

        return translations.map((text, i) => {
          const original = currentChunk[i];
          if (!original) throw new Error(`Missing subtitle at index ${i} in chunk`);
          return {
            order: original.order,
            timestamp: original.timestamp,
            content: text.split("\n"),
          };
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (attempt < params.maxRetries) {
          yield* Effect.logWarning(
            `Chunk at index ${chunkStart} failed (attempt ${attempt + 1}/${params.maxRetries + 1}): ${errorMessage} Retrying...`,
          );
          messages.push({ role: "assistant", content: output });
          messages.push({
            role: "user",
            content: `${errorMessage} Please fix your response.`,
          });
        }
      }
    }

    yield* Effect.logWarning(
      `Failed to translate chunk at index ${chunkStart} after ${params.maxRetries + 1} attempts. Keeping original subtitles.`,
    );
    return [...currentChunk];
  });
}


function decodeChunkResponse(output: string, expectedCount: number): ChunkResponse {
  let response: ChunkResponse;
  try {
    response = JSON.parse(output) as ChunkResponse;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to decode response as JSON: ${reason}`, { cause: e });
  }

  if (!Array.isArray(response.translations)) {
    throw new Error("Response is missing 'translations' array.");
  }

  if (response.translations.length !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} translations but got ${response.translations.length}.`,
    );
  }

  return response;
}

function buildSystemPrompt(data: TranslateMovieData): string {
  const yearText = data.movieDetails.releaseYear ? ` (${data.movieDetails.releaseYear})` : "";
  const descriptionText = data.movieDetails.description
    ? `Description: ${data.movieDetails.description}`
    : "";

  return `
You are a professional movie translator (${data.sourceLanguage} to ${data.targetLanguage}).
Movie: ${data.movieDetails.title}${yearText}
${descriptionText}

Rules:
- Input is a JSON object with 'context_before', 'translate_this', and 'context_after'.
- Use context for accuracy, but ONLY translate strings in the 'translate_this' array.
- Return a JSON object with a single key 'translations' containing the array of translated strings.
- Parity is mandatory: the output array length MUST match the input 'translate_this' length.
- Preserve the tone and natural spoken style.
- Preserve '\\n' line breaks.`.trim();
}
