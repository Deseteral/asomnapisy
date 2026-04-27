import type { SrtData } from "./srt.ts";
import type { MovieDetails } from "./movie-details.ts";

export type TranslateMovieData = {
  srtData: SrtData;
  movieDetails: MovieDetails;
  sourceLanguage: string;
  targetLanguage: string;
};

const displayNames = new Intl.DisplayNames(["en"], { type: "language" });

export function languageCodeToName(code: string): string {
  return displayNames.of(code) ?? code;
}

export type TranslateMovieLineByLineParams = {
  surroundingContextLength: number;
  concurrency: number;
};

export type TranslateMovieChunkedParams = {
  chunkSize: number;
  surroundingContextLength: number;
  maxRetries: number;
  concurrency: number;
};
