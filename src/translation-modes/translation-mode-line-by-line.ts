import { AiError, LanguageModel } from "@effect/ai";
import { Effect } from "effect";
import type { SrtData, SrtSubtitle } from "../data/srt.ts";
import {
  languageCodeToName,
  type TranslateMovieData,
  type TranslateMovieLineByLineParams,
} from "../data/translation-mode.ts";

export function translateMovieLineByLine(
  data: TranslateMovieData,
  params: TranslateMovieLineByLineParams,
): Effect.Effect<SrtData, AiError.AiError, LanguageModel.LanguageModel> {
  return Effect.forEach(
    data.srtData.subtitles,
    (subtitle, idx) => translateSingleSubtitle(data, params, subtitle, idx),
    { concurrency: params.concurrency },
  ).pipe(Effect.map((subtitles) => ({ subtitles })));
}

function translateSingleSubtitle(
  data: TranslateMovieData,
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
    } satisfies SrtSubtitle;
  });
}

function buildSystemPrompt(
  data: TranslateMovieData,
  params: TranslateMovieLineByLineParams,
  currentSubtitleIdx: number,
): string {
  const releaseYearText = data.movieDetails.releaseYear
    ? ` released in ${data.movieDetails.releaseYear}`
    : "";

  const descriptionText = data.movieDetails.description
    ? `For more context this is the description of the movie:\n\`\`\`\n${data.movieDetails.description}\n\`\`\``
    : "";

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
You are a professional translator and the movie expert. You are going to translate movie subtitles.
The movie we're translating is "${data.movieDetails.title}"${releaseYearText}.
${descriptionText}
You will be translating from ${languageCodeToName(data.sourceLanguage)} to ${languageCodeToName(data.targetLanguage)}.
Preserve the meaning, tone, and natural spoken style. Return only the translated subtitles and nothing else.
Sometimes there are new lines in the middle of sentence. They're required to correctly fit subtitles on the display. New lines don't mean anything. Treat those sentences as one sentence. Only full stop/period mean "end of sentence". Preserve new lines for presentation purposes.
I will only give you a couple of lines at the time. Return only the translation of given lines.
Here is a couple of lines before/after the ones I will give you so you'll know what is the context. Translate all subtitles I will give you and then return only the ones I'm asking for."
\`\`\`
${originalLines}
\`\`\`
I will now provide the lines that you need to translate. Remember that they're a continuous part of the whole movie. Translate them in the context of the surrounding lines.`.trim();
}
