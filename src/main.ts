import { Args, Command, Options } from "@effect/cli";
import { Effect, Layer } from "effect";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Command as ShellCommand, FetchHttpClient, HttpClient } from "@effect/platform";
import type { FileSystem } from "@effect/platform/FileSystem";
import { LanguageModel, Model } from "@effect/ai";
import { OpenAiLanguageModel } from "@effect/ai-openai";
import type { ConfigError } from "effect/ConfigError";
import type { SrtData } from "./data/srt.ts";
import { readSrtFile, writeSrtFile } from "./data/srt.ts";
import type { TranslateMovieData } from "./data/translation-mode.ts";
import {
  translateMovieLineByLine,
  type TranslateMovieLineByLineParams,
} from "./translation-modes/translation-mode-line-by-line.ts";
import {
  translateMovieChunked,
  type TranslateMovieChunkedParams,
} from "./translation-modes/translation-mode-chunked.ts";
import { LLM_PROVIDERS, type LlmProvider, makeOpenAiClientLayer } from "./services/llm-client.ts";
import { TmdbClient, TmdbError } from "./services/tmdb-client.ts";
import { parseFilePath, SUPPORTED_SUBTITLE_FILE_TYPES } from "./data/subtitle-file-info.ts";
import type { PlatformError } from "@effect/platform/Error";

const input = Args.file({ name: "sourceSubtitles", exists: "yes" })
  .pipe(Args.withDescription(`The path of subtitle file to translate. Supported file types: ${SUPPORTED_SUBTITLE_FILE_TYPES.join(", ")}.`));
const sourceLanguage = Options.text("sourceLanguage")
  .pipe(Options.withDefault("en"))
  .pipe(Options.withDescription("Language code of source subtitles (e.g. en, fr, de)."));
const targetLanguage = Options.text("targetLanguage")
  .pipe(Options.withDescription("Language code to translate the subtitles to (e.g. pl, es, ja)."));
// const tmdbId = Options.text("tmdbId")
//   .pipe(Options.withDefault(null))
//   .pipe(Options.withDescription("The Movie Database ID of given media. When missing this program will try to extract it from subtitle file name."));
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

function makeTranslateMovieData(
  input: string,
  tmdbId: string,
  sourceLanguage: string,
  targetLanguage: string,
): Effect.Effect<TranslateMovieData, PlatformError | TmdbError, FileSystem | TmdbClient> {
  return Effect.gen(function* () {
    const tmdbClient = yield* TmdbClient;

    const srtData = yield* readSrtFile(input);
    const movieDetails = yield* tmdbClient.getMovieDetails(tmdbId);

    return {
      srtData,
      movieDetails,
      sourceLanguage,
      targetLanguage,
    };
  });
}

function runTranslation<E>(
  args: { input: string; sourceLanguage: string; targetLanguage: string; model: string; llmProvider: LlmProvider },
  translate: (data: TranslateMovieData) => Effect.Effect<SrtData, E, LanguageModel.LanguageModel>,
): Effect.Effect<void, E | PlatformError, FileSystem | TmdbClient | LanguageModel.LanguageModel> {
  return Effect.gen(function* () {
    const fileInfo = yield* parseFilePath(args.input, args.sourceLanguage, args.targetLanguage, args.model)
      .pipe(Effect.orDie);

    const data = yield* makeTranslateMovieData(args.input, fileInfo.tmdbId, args.sourceLanguage, args.targetLanguage)
      .pipe(Effect.orDie);

    const result = yield* translate(data);

    yield* writeSrtFile(fileInfo.targetFilePath, result);
    yield* Effect.log(`Saved translated subtitles to ${fileInfo.targetFilePath}`);
  });
}

const translateMovieLineByLineCommand = Command.make(
  "line-by-line",
  { input, sourceLanguage, targetLanguage, llmProvider, model, surroundingContextLength, concurrency },
  (args) => {
    const params: TranslateMovieLineByLineParams = {
      surroundingContextLength: args.surroundingContextLength,
      concurrency: args.concurrency,
    };

    return runTranslation(args, (data) => translateMovieLineByLine(data, params))
      .pipe(Effect.provide(makeLlmClientLayer(args)));
  },
).pipe(
  Command.withDescription("line-by-line mode requests a single line translation from LLM. This is more suitable for locally running models."),
);

const translateMovieChunkedCommand = Command.make(
  "chunked",
  {
    input,
    sourceLanguage,
    targetLanguage,
    llmProvider,
    model,
    chunkSize,
    surroundingContextLength,
    maxRetries,
    concurrency,
  },
  (args) => {
    const params: TranslateMovieChunkedParams = {
      chunkSize: args.chunkSize,
      surroundingContextLength: args.surroundingContextLength,
      maxRetries: args.maxRetries,
      concurrency: args.concurrency,
    };

    return runTranslation(args, (data) => translateMovieChunked(data, params))
      .pipe(Effect.provide(makeLlmClientLayer(args)));
  },
).pipe(
  Command.withDescription("chunked mode divides all lines into groups and translates them in batches. This reduces request count and is more suitable for cloud models."),
);

const showSubtitleTracksCommand = Command.make("show-tracks", {
  input: Args.file({ name: "videoFile", exists: "yes" }),
}, (args) => {
  return Effect.gen(function* () {
    const cmd = ShellCommand.make(
      "ffprobe",
      ..."-loglevel error -select_streams s -show_entries stream=index:stream_tags=language -of csv=p=0".split(" "),
      args.input,
    );
    const output = yield* ShellCommand.lines(cmd);

    console.log(" Track │ Language");
    console.log("───────┼──────────");
    for (const line of output) {
      const [track, lang] = line.split(",");
      if (!track || !lang) continue;
      console.log(`${track.padStart(6, " ")} │ ${lang}`);
    }
  });
});

const command = Command.make("asomnapisy").pipe(
  Command.withSubcommands([
    Command.make("translate-movie").pipe(
      Command.withDescription("Translate movie subtitles."),
      Command.withSubcommands([translateMovieLineByLineCommand, translateMovieChunkedCommand]),
    ),
    Command.make("extract-subtitles").pipe(
      Command.withSubcommands([showSubtitleTracksCommand]),
    ),
  ]),
);

function makeLlmClientLayer(args: { llmProvider: LlmProvider; model: string }): Layer.Layer<
  LanguageModel.LanguageModel | Model.ProviderName,
  ConfigError | TmdbError,
  HttpClient.HttpClient
> {
  return Layer.mergeAll(
    OpenAiLanguageModel.model(args.model),
  ).pipe(Layer.provide(makeOpenAiClientLayer(args.llmProvider)));
}

const cli = Command.run(command, {
  name: "asomnapisy",
  version: "v1.0.0",
});

// Cast needed: TypeScript's Exclude can't reduce CliApp.Environment (FileSystem | Path | Terminal)
// against BunContext even though all members are provided.
const program = cli(process.argv).pipe(
  Effect.provide(Layer.mergeAll(BunContext.layer, FetchHttpClient.layer, TmdbClient.Default)),
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(program as Effect.Effect<void, any>).pipe(BunRuntime.runMain);
