import { Args, Command, Options } from "@effect/cli";
import { Effect, Layer } from "effect";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { FetchHttpClient, HttpClient } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import type { FileSystem } from "@effect/platform/FileSystem";
import { LanguageModel, Model } from "@effect/ai";
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import type { ConfigError } from "effect/ConfigError";
import path from "node:path";
import { readSrtFile, serializeSrt } from "./data/srt.ts";
import { resolveMovieDetails } from "./data/movie-details.ts";
import type { TranslateMovieData } from "./data/translation-mode.ts";
import { translateMovieLineByLine } from "./translation-modes/translation-mode-line-by-line.ts";
import { translateMovieChunked } from "./translation-modes/translation-mode-chunked.ts";
import { LLM_PROVIDERS, type LlmProvider, makeOpenAiClientLayer } from "./services/llm-client.ts";
import { TmdbClient, TmdbClientLive, TmdbError } from "./services/tmdb-client.ts";

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
const concurrency = Options.integer("concurrency")
  .pipe(Options.withDefault(1))
  .pipe(Options.withDescription("Number of subtitles to translate in parallel."));

const chunkSize = Options.integer("chunkSize")
  .pipe(Options.withDefault(30))
  .pipe(Options.withDescription("The amount of lines in a single translation chunk."));
const maxRetries = Options.integer("maxRetries")
  .pipe(Options.withDefault(3))
  .pipe(Options.withDescription("The amount of retries for translating a chunk. Retry count grows when using less capable LLM models."));

function makeTranslateMovieData(args: {
  input: string;
  sourceLanguage: string;
  targetLanguage: string;
}): Effect.Effect<TranslateMovieData, PlatformError, FileSystem | TmdbClient> {
  return Effect.gen(function* () {
    const srtData = yield* readSrtFile(args.input);
    const movieDetails = yield* resolveMovieDetails(path.basename(args.input));

    return {
      srtData,
      movieDetails,
      sourceLanguage: args.sourceLanguage,
      targetLanguage: args.targetLanguage,
    } satisfies TranslateMovieData;
  });
}

function makeAppLayer(args: { llmProvider: LlmProvider; model: string }): Layer.Layer<
  LanguageModel.LanguageModel | Model.ProviderName | OpenAiClient.OpenAiClient | TmdbClient | HttpClient.HttpClient,
  ConfigError | TmdbError,
  OpenAiClient.OpenAiClient | HttpClient.HttpClient
> {
  return Layer.mergeAll(
    OpenAiLanguageModel.model(args.model),
    makeOpenAiClientLayer(args.llmProvider),
    TmdbClientLive,
    FetchHttpClient.layer,
  );
}

const translateMovieLineByLineCommand = Command.make(
  "line-by-line",
  { input, sourceLanguage, targetLanguage, llmProvider, model, surroundingContextLength, concurrency },
  (args) =>
    Effect.gen(function* () {
      const data = yield* makeTranslateMovieData(args);

      const result = yield* translateMovieLineByLine(data, {
        surroundingContextLength: args.surroundingContextLength,
        concurrency: args.concurrency,
      });

      yield* Effect.logDebug(serializeSrt(result));
    }).pipe(Effect.provide(makeAppLayer(args))),
);

const translateMovieChunkedCommand = Command.make(
  "chunked",
  { input, sourceLanguage, targetLanguage, llmProvider, model, chunkSize, surroundingContextLength, maxRetries },
  (args) =>
    Effect.gen(function* () {
      const data = yield* makeTranslateMovieData(args);

      const result = yield* translateMovieChunked(data, {
        chunkSize: args.chunkSize,
        surroundingContextLength: args.surroundingContextLength,
        maxRetries: args.maxRetries,
      });

      yield* Effect.logDebug(serializeSrt(result));
    }).pipe(Effect.provide(makeAppLayer(args))),
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

// Cast needed: TypeScript's Exclude can't reduce CliApp.Environment (FileSystem | Path | Terminal)
// against BunContext even though all members are provided.
const program = cli(process.argv).pipe(
  Effect.provide(Layer.mergeAll(BunContext.layer, FetchHttpClient.layer)),
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(program as Effect.Effect<void, any>).pipe(BunRuntime.runMain);
