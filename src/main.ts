import { Command, Args, Options } from "@effect/cli";
import { Effect } from "effect";
import { BunRuntime, BunContext } from "@effect/platform-bun";
import path from "node:path";
import { readSrtFile, serializeSrt } from "./data/srt.ts";
import { resolveMovieDetails } from "./data/movie-details.ts";
import type { TranslateMovieData } from "./data/translation-mode.ts";
import { translateMovieLineByLine } from "./translation-modes/translation-mode-line-by-line.ts";
import { translateMovieChunked } from "./translation-modes/translation-mode-chunked.ts";
import { makeLlmClientLayer, LLM_PROVIDERS } from "./services/llm-client.ts";
import { TmdbClientLive } from "./services/tmdb-client.ts";

// Common params.
const input = Args.file({ name: "sourceSubtitles", exists: "yes" });
const sourceLanguage = Options.text("sourceLanguage").pipe(Options.withDefault("english"));
const targetLanguage = Options.text("targetLanguage");
const llmProvider = Options.choice("llmProvider", LLM_PROVIDERS);
const model = Options.text("model");

// Line-by-line specific params.
const surroundingContextLength = Options.integer("surroundingContextLength").pipe(
  Options.withDefault(5),
);

// Chunked specific params.
const chunkSize = Options.integer("chunkSize").pipe(Options.withDefault(30));
const contextSize = Options.integer("contextSize").pipe(Options.withDefault(4));
const maxRetries = Options.integer("maxRetries").pipe(Options.withDefault(3));

const translateMovieLineByLineCommand = Command.make(
  "line-by-line",
  { input, sourceLanguage, targetLanguage, llmProvider, model, surroundingContextLength },
  (args) =>
    Effect.gen(function* () {
      const srtData = yield* readSrtFile(args.input);
      const movieDetails = yield* resolveMovieDetails(path.basename(args.input));

      const data: TranslateMovieData = {
        srtData,
        movieDetails,
        sourceLanguage: args.sourceLanguage,
        targetLanguage: args.targetLanguage,
        model: args.model,
      };

      const result = yield* translateMovieLineByLine(data, {
        surroundingContextLength: args.surroundingContextLength,
        concurrency: 1,
      });

      yield* Effect.logDebug(serializeSrt(result));
    }).pipe(
      Effect.provide(makeLlmClientLayer(args.llmProvider)),
      Effect.provide(TmdbClientLive),
    ),
);

const translateMovieChunkedCommand = Command.make(
  "chunked",
  { input, sourceLanguage, targetLanguage, llmProvider, model, chunkSize, contextSize, maxRetries },
  (args) =>
    Effect.gen(function* () {
      const srtData = yield* readSrtFile(args.input);
      const movieDetails = yield* resolveMovieDetails(path.basename(args.input));

      const data: TranslateMovieData = {
        srtData,
        movieDetails,
        sourceLanguage: args.sourceLanguage,
        targetLanguage: args.targetLanguage,
        model: args.model,
      };

      const result = yield* translateMovieChunked(data, {
        chunkSize: args.chunkSize,
        contextSize: args.contextSize,
        maxRetries: args.maxRetries,
      });

      yield* Effect.logDebug(serializeSrt(result));
    }).pipe(
      Effect.provide(makeLlmClientLayer(args.llmProvider)),
      Effect.provide(TmdbClientLive),
    ),
);

const command = Command.make("asomnapisy").pipe(
  Command.withSubcommands([
    Command.make("translate-movie").pipe(
      Command.withDescription("Translate movie subtitles."),
      Command.withSubcommands([translateMovieLineByLineCommand, translateMovieChunkedCommand]),
    ),
  ]),
);

const cli = Command.run(command, {
  name: "asomnapisy",
  version: "v1.0.0",
});

cli(process.argv).pipe(Effect.provide(BunContext.layer), BunRuntime.runMain);
