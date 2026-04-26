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

const input = Args.file({ name: "sourceSubtitles", exists: "yes" })
  .pipe(Args.withDescription("The path of subtitle file to translate."));
const sourceLanguage = Options.text("sourceLanguage")
  .pipe(Options.withDefault("english"))
  .pipe(Options.withDescription("Language of source subtitles."));
const targetLanguage = Options.text("targetLanguage")
  .pipe(Options.withDescription("The language to translate the subtitles to."));
const llmProvider = Options.choice("llmProvider", LLM_PROVIDERS)
  .pipe(Options.withDescription("LLM provider service."));
const model = Options.text("model")
  .pipe(Options.withDescription("LLM model identifier."));

const surroundingContextLength = Options.integer("surroundingContextLength")
  .pipe(Options.withDefault(5))
  .pipe(Options.withDescription("Amount of lines before and after translated ones in context."));

const chunkSize = Options.integer("chunkSize")
  .pipe(Options.withDefault(30))
  .pipe(Options.withDescription("The amount of lines in a single translation chunk."));
const maxRetries = Options.integer("maxRetries")
  .pipe(Options.withDefault(3))
  .pipe(Options.withDescription("The amount of retries for translating a chunk. Retry count grows when using less capable LLM models."));

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
  { input, sourceLanguage, targetLanguage, llmProvider, model, chunkSize, surroundingContextLength, maxRetries },
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
        surroundingContextLength: args.surroundingContextLength,
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
