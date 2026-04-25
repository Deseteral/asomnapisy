import type { SrtData } from "./srt.ts";
import type { MovieDetails } from "./movie-details.ts";

export type TranslationMode = "lineByLine" | "chunked";

export type TranslateMovieData = {
  srtData: SrtData;
  movieDetails: MovieDetails;
  sourceLanguage: string;
  targetLanguage: string;
  model: string;
};

export type TranslateMovieLineByLineParams = {
  surroundingContextLength: number;
  concurrency: number;
};

export type TranslateMovieChunkedParams = {
  chunkSize: number;
  contextSize: number;
  maxRetries: number;
};
