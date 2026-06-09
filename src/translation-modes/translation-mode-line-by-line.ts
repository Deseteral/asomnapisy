import { AiError, LanguageModel } from "@effect/ai";
import { Effect, Match } from "effect";
import type { SrtData, SrtSubtitle } from "../data/srt.ts";
import { formatAsEpisodeCode, languageCodeToName, type SubtitleTranslationData } from "../data/translation-mode.ts";

export type TranslateMovieLineByLineParams = {
  surroundingContextLength: number;
  concurrency: number;
};

export function translateMovieLineByLine(
  data: SubtitleTranslationData,
  params: TranslateMovieLineByLineParams,
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
  params: TranslateMovieLineByLineParams,
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

    return {
      order: subtitle.order,
      timestamp: subtitle.timestamp,
      content: response.text.split("\n"),
    };
  });
}

function buildSystemPrompt(
  data: SubtitleTranslationData,
  params: TranslateMovieLineByLineParams,
  currentSubtitleIdx: number,
): string {
  const contentIntro = Match.value(data).pipe(
    Match.when({ kind: "movie" }, (d) => `
      You are a professional translator and the movie expert. You are going to translate movie subtitles.
      Movie: "${d.titleMetadata.title}" released ${d.titleMetadata.releaseYear}.
    `),
    Match.when({ kind: "episode" }, (d) => `
      You are a professional translator and the TV series expert. You are going to translate TV episode subtitles.
      Series: "${d.episodeMetadata.seriesTitle}", episode ${formatAsEpisodeCode(d.episodeMetadata)} "${d.episodeMetadata.episodeTitle}".
    `),
    Match.exhaustive,
  );

  const descriptionText = Match.value(data).pipe(
    Match.when({ kind: "movie" }, (d) => `
      For more context this is the description of the movie:
      \`\`\`
      ${d.titleMetadata.description}
      \`\`\`
    `),
    Match.when({ kind: "episode" }, (d) => `
      For more context this is the description of the series:
      \`\`\`
      ${d.titleMetadata.description}
      \`\`\`
    `),
    Match.exhaustive,
  );

  const contentNoun = Match.value(data).pipe(
    Match.when({ kind: "movie" }, () => "movie"),
    Match.when({ kind: "episode" }, () => "episode"),
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
${contentIntro}
${descriptionText}
You will be translating from ${languageCodeToName(data.sourceLanguage)} to ${languageCodeToName(data.targetLanguage)}.
Preserve the meaning, tone, and natural spoken style. Return only the translated subtitles and nothing else.
Sometimes there are new lines in the middle of sentence. They're required to correctly fit subtitles on the display. New lines don't mean anything. Treat those sentences as one sentence. Only full stop/period mean "end of sentence". Preserve new lines for presentation purposes.
I will only give you a couple of lines at the time. Return only the translation of given lines.
Here is a couple of lines before/after the ones I will give you so you'll know what is the context. Translate all subtitles I will give you and then return only the ones I'm asking for."
\`\`\`
${originalLines}
\`\`\`
I will now provide the lines that you need to translate. Remember that they're a continuous part of the whole ${contentNoun}. Translate them in the context of the surrounding lines.
  `.trim();
}
