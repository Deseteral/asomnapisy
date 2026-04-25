export type TranslationMode = "lineByLine" | "chunked";

export type TranslateMovieData = {
  srtData: SrtData;
  movieDetails: MovieDetails;
  sourceLanguage: string;
  targetLanguage: string;
  // llmClient: OpenAI;
  // llmIdentifier: String;
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
