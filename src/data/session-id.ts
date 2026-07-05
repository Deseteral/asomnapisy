import { Match } from "effect";
import { slugify } from "../utils";
import { formatAsEpisodeCode, type SubtitleTranslationData } from "./translation-data.ts";

export function generateSessionId(
  data: SubtitleTranslationData,
): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  return `asomnapisy-${timestamp}-${getMediaTitleSlug(data)}`;
}

export function generateCacheId(
  data: SubtitleTranslationData,
  model: string,
  chunkSize: number,
  surroundingContextLength: number,
): string {
  return `asomnapisy-${getMediaTitleSlug(data)}-${data.sourceLanguage}-${data.targetLanguage}-${slugify(model)}-cs${chunkSize}-sc${surroundingContextLength}`;
}

function getMediaTitleSlug(data: SubtitleTranslationData): string {
  const title = Match.value(data).pipe(
    Match.when({ kind: "movie" }, (d) => d.titleMetadata.title),
    Match.when({ kind: "episode" }, (d) => `${d.titleMetadata.title}-${formatAsEpisodeCode(d.episodeMetadata)}`),
    Match.exhaustive,
  );
  return slugify(title);
}
