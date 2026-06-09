import type { SrtData } from "./srt.ts";

export type TitleMetadata = {
  title: string;
  releaseYear: string;
  description: string;
};

export type EpisodeMetadata = {
  seriesTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string;
};

export type MovieContent = {
  readonly kind: "movie";
};

export type EpisodeContent = {
  readonly kind: "episode";
  readonly episodeMetadata: EpisodeMetadata;
};

export type SubtitleTranslationData = {
  srtData: SrtData;
  titleMetadata: TitleMetadata;
  sourceLanguage: string;
  targetLanguage: string;
} & (MovieContent | EpisodeContent);

const displayNames = new Intl.DisplayNames(["en"], { type: "language" });

export function languageCodeToName(code: string): string {
  return displayNames.of(code) ?? code;
}

export function formatAsEpisodeCode(metadata: EpisodeMetadata): string {
  return `S${String(metadata.seasonNumber).padStart(2, "0")}E${String(metadata.episodeNumber).padStart(2, "0")}`;
}
