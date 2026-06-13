import { LanguageModel, Model } from "@effect/ai";
import { OpenAiLanguageModel } from "@effect/ai-openai";
import { Args, Command, Options } from "@effect/cli";
import { HttpClient } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import type { FileSystem } from "@effect/platform/FileSystem";
import type { ConfigError } from "effect/ConfigError";
import { Effect, Layer, Match } from "effect";
import { readSrtFile, type SrtData, writeSrtFile } from "../data/srt.ts";
import { parseFilePath, type SubtitleFileInfo, SUPPORTED_SUBTITLE_FILE_TYPES } from "../data/subtitle-file-info.ts";
import type { SubtitleTranslationData } from "../data/translation-mode.ts";
import { LLM_PROVIDERS, type LlmProvider, makeOpenAiClientLayer } from "../services/llm-client.ts";
import { TmdbClient, type TmdbError } from "../services/tmdb-client.ts";
import { generateSessionId } from "../data/session-id.ts";
import {
  translateLineByLine,
  type TranslateLineByLineParams,
} from "../translation-modes/translation-mode-line-by-line.ts";
import {
  translateChunked,
  type TranslateChunkedParams,
} from "../translation-modes/translation-mode-chunked.ts";

const input = Args.file({ name: "sourceSubtitles", exists: "yes" })
  .pipe(Args.withDescription(`The path of subtitle file to translate. Supported file types: ${SUPPORTED_SUBTITLE_FILE_TYPES.join(", ")}.`));
const sourceLanguage = Options.text("sourceLanguage")
  .pipe(Options.withDefault("en"))
  .pipe(Options.withDescription("Language code of source subtitles (e.g. en, fr, de)."));
const targetLanguage = Options.text("targetLanguage")
  .pipe(Options.withDescription("Language code to translate the subtitles to (e.g. pl, es, ja)."));
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

const lineByLineCommand = Command.make(
  "line-by-line",
  { input, sourceLanguage, targetLanguage, llmProvider, model, surroundingContextLength, concurrency },
  (args) => {
    const params: TranslateLineByLineParams = {
      surroundingContextLength: args.surroundingContextLength,
      concurrency: args.concurrency,
    };

    return runTranslation(args, (data) => translateLineByLine(data, params));
  },
).pipe(
  Command.withDescription("line-by-line mode requests a single line translation from LLM. This is more suitable for locally running models."),
);

const chunkedCommand = Command.make(
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
    const params: TranslateChunkedParams = {
      chunkSize: args.chunkSize,
      surroundingContextLength: args.surroundingContextLength,
      maxRetries: args.maxRetries,
      concurrency: args.concurrency,
    };

    return runTranslation(args, (data) => translateChunked(data, params));
  },
).pipe(
  Command.withDescription("chunked mode divides all lines into groups and translates them in batches. This reduces request count and is more suitable for cloud models."),
);

export const translateCommand = Command.make("translate").pipe(
  Command.withDescription("Translate subtitles. Automatically detects media type."),
  Command.withSubcommands([lineByLineCommand, chunkedCommand]),
);

function runTranslation<E>(
  args: { input: string; sourceLanguage: string; targetLanguage: string; model: string; llmProvider: LlmProvider },
  translate: (data: SubtitleTranslationData) => Effect.Effect<SrtData, E, LanguageModel.LanguageModel>,
): Effect.Effect<void, E | PlatformError | ConfigError | TmdbError, FileSystem | HttpClient.HttpClient | TmdbClient> {
  return Effect.gen(function* () {
    const fileInfo = yield* parseFilePath(args.input, args.sourceLanguage, args.targetLanguage, args.model)
      .pipe(Effect.orDie);

    const data = yield* fetchData(
      args.input,
      fileInfo,
      args.sourceLanguage,
      args.targetLanguage,
    ).pipe(Effect.orDie);

    const sessionId = generateSessionId(data.titleMetadata.title);
    yield* Effect.log(`Session ID: ${sessionId}`);

    const result = yield* translate(data)
      .pipe(Effect.provide(makeLlmClientLayer({ ...args, sessionId })));

    yield* writeSrtFile(fileInfo.targetFilePath, result);
    yield* Effect.log(`Saved translated subtitles to ${fileInfo.targetFilePath}`);
  });
}

function fetchData(
  inputPath: string,
  fileInfo: SubtitleFileInfo,
  sourceLanguage: string,
  targetLanguage: string,
): Effect.Effect<SubtitleTranslationData, PlatformError | TmdbError, FileSystem | TmdbClient> {
  return Effect.gen(function* () {
    const tmdbClient = yield* TmdbClient;
    const srtData = yield* readSrtFile(inputPath);

    return yield* Match.value(fileInfo).pipe(
      Match.when({ kind: "movie" }, function* (d) {
        const movieDetails = yield* tmdbClient.getMovieDetails(d.tmdbId);

        return {
          kind: "movie" as const,
          srtData,
          titleMetadata: {
            title: movieDetails.title,
            releaseYear: movieDetails.releaseYear,
            description: movieDetails.description,
          },
          sourceLanguage,
          targetLanguage,
        };
      }),
      Match.when({ kind: "episode" }, function* (d) {
        const episodeDetails = yield* tmdbClient.getEpisodeDetails(d.seriesTmdbId, d.seasonNumber, d.episodeNumber);

        return {
          kind: "episode" as const,
          srtData,
          titleMetadata: {
            title: episodeDetails.seriesTitle,
            releaseYear: "",
            description: episodeDetails.seriesDescription,
          },
          episodeMetadata: {
            seriesTitle: episodeDetails.seriesTitle,
            seasonNumber: episodeDetails.seasonNumber,
            episodeNumber: episodeDetails.episodeNumber,
            episodeTitle: episodeDetails.episodeTitle,
          },
          sourceLanguage,
          targetLanguage,
        };
      }),
      Match.exhaustive,
    );
  });
}

function makeLlmClientLayer(args: { llmProvider: LlmProvider; model: string; sessionId?: string }): Layer.Layer<
  LanguageModel.LanguageModel | Model.ProviderName,
  ConfigError | TmdbError,
  HttpClient.HttpClient
> {
  return Layer.mergeAll(
    OpenAiLanguageModel.model(args.model),
  ).pipe(Layer.provide(makeOpenAiClientLayer(args.llmProvider, args.sessionId)));
}
