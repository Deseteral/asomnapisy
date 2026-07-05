import { Match } from "effect";
import { slugify } from "../utils";
import { formatAsEpisodeCode, type SubtitleTranslationData } from "./translation-data.ts";

export function generateSessionId(
  data: SubtitleTranslationData,
  model: string,
  chunkSize: number,
  surroundingContextLength: number,
): string {
  const mediaTitle = Match.value(data).pipe(
    Match.when({ kind: "movie" }, (d) => d.titleMetadata.title),
    Match.when({ kind: "episode" }, (d) => `${d.titleMetadata.title}-${formatAsEpisodeCode(d.episodeMetadata)}`),
    Match.exhaustive,
  );

  return `asomnapisy-${slugify(mediaTitle)}-${data.sourceLanguage}-${data.targetLanguage}-${slugify(model)}-cs${chunkSize}-sc${surroundingContextLength}`;
}
