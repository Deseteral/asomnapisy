import { AiError, LanguageModel } from "@effect/ai";
import { Effect, Match } from "effect";
import type { SrtData, SrtSubtitle } from "../data/srt.ts";
import { formatAsEpisodeCode, languageCodeToName, type SubtitleTranslationData } from "../data/translation-mode.ts";

export type TranslateLineByLineParams = {
  surroundingContextLength: number;
  concurrency: number;
};

export function translateLineByLine(
  data: SubtitleTranslationData,
  params: TranslateLineByLineParams,
): Effect.Effect<SrtData, AiError.AiError, LanguageModel.LanguageModel> {
  return Effect.forEach(
    data.srtData.subtitles,
    (subtitle, idx) => translateSingleSubtitle(data, params, subtitle, idx),
    { concurrency: params.concurrency },
  ).pipe(
    Effect.map((subtitles) => ({ subtitles })),
  );
}

function translateSingleSubtitle(
  data: SubtitleTranslationData,
  params: TranslateLineByLineParams,
  subtitle: SrtSubtitle,
  idx: number,
): Effect.Effect<SrtSubtitle, AiError.AiError, LanguageModel.LanguageModel> {
  return Effect.gen(function* () {
    const systemPrompt = buildSystemPrompt(data, params, idx);
    const textToTranslate = subtitle.content.join("\n");

    const response = yield* LanguageModel.generateText({
      prompt: [
        { role: "system", content: systemPrompt },
        { role: "user", content: textToTranslate },
      ],
    });

    yield* Effect.logInfo(`Translated subtitle ${idx + 1}/${data.srtData.subtitles.length}`);
    yield* Effect.logDebug(response.text.replaceAll("\n", " "));

    console.log(response.text);

    return {
      order: subtitle.order,
      timestamp: subtitle.timestamp,
      content: response.text.split("\n"),
    };
  });
}

function buildSystemPrompt(
  data: SubtitleTranslationData,
  params: TranslateLineByLineParams,
  currentSubtitleIdx: number,
): string {
  const contentHeader = Match.value(data).pipe(
    Match.when({ kind: "movie" }, (d) => `
      You are a professional subtitle translator (${languageCodeToName(d.sourceLanguage)} to ${languageCodeToName(d.targetLanguage)}).
      Movie: ${d.titleMetadata.title} (${d.titleMetadata.releaseYear})
    `),
    Match.when({ kind: "episode" }, (d) => `
      You are a professional subtitle translator (${languageCodeToName(d.sourceLanguage)} to ${languageCodeToName(d.targetLanguage)}).
      Series: ${d.episodeMetadata.seriesTitle}, episode ${formatAsEpisodeCode(d.episodeMetadata)} "${d.episodeMetadata.episodeTitle}"
    `),
    Match.exhaustive,
  );

  const [ogStart, ogEnd] =
    params.surroundingContextLength === 0
      ? [0, data.srtData.subtitles.length]
      : [
        Math.max(currentSubtitleIdx - params.surroundingContextLength, 0),
        Math.min(currentSubtitleIdx + params.surroundingContextLength, data.srtData.subtitles.length),
      ];

  const originalLines = data.srtData.subtitles
    .slice(ogStart, ogEnd)
    .flatMap((s) => s.content)
    .join("\n");

  return `
${contentHeader}
Description: ${data.titleMetadata.description}

Rules:
- Preserve the meaning, tone, and natural spoken style.
- Return ONLY the translated text, nothing else.
- Newlines within subtitles are for display formatting, not sentence boundaries. Only periods end sentences. Preserve newlines as-is.
- You will receive a few lines at a time. Translate them in the context of the surrounding lines below.

Surrounding context:
\`\`\`
${originalLines}
\`\`\`
  `.trim();
}
