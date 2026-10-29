import { Argument, Command, Flag } from "effect/cli";
import { HttpClient } from "effect/http";
import type { PlatformError } from "effect/PlatformError";
import type { ConfigError } from "effect/Config";
import { Array as Arr, Effect, FileSystem, Match, Option } from "effect";
import * as path from "node:path";
import { injectCommentIntoSrtData, readSrtFile, writeSrtFile } from "../data/srt.ts";
import {
  parseFilePath,
  type SubtitleFileInfo,
  type SubtitleFileParsingError,
  SUPPORTED_SUBTITLE_INPUT_FILE_TYPES,
} from "../data/subtitle-file-info.ts";
import type { SubtitleTranslationData } from "../data/translation-data.ts";
import { generateCacheId, generateSessionId } from "../data/session-id.ts";
import { LLM_PROVIDERS, type LlmProvider, makeLanguageModelLayer } from "../services/llm-client.ts";
import { TmdbClient, type TmdbError } from "../services/tmdb-client.ts";
import { TranslationCache } from "../services/translation-cache.ts";
import { translateChunked, type TranslateChunkedParams } from "../translation/chunked-translation.ts";
import packageJson from "../../package.json";

const input = Argument.Path("sourceSubtitles", { mustExist: true }).pipe(
  Argument.withDescription(`The path of subtitle file or directory to translate. Supported file types: ${SUPPORTED_SUBTITLE_INPUT_FILE_TYPES.join(", ")}.`),
);
const sourceLanguage = Flag.String("sourceLanguage").pipe(
  Flag.withDefault("en"),
  Flag.withDescription("Language code of source subtitles (e.g. en, fr, de)."),
);
const targetLanguage = Flag.String("targetLanguage").pipe(
  Flag.withDescription("Language code to translate the subtitles to (e.g. pl, es, ja)."),
);
const llmProvider = Flag.Literals("llmProvider", LLM_PROVIDERS).pipe(
  Flag.withDescription("LLM provider service."),
);
const model = Flag.String("model").pipe(
  Flag.withDescription("LLM model identifier."),
);

const surroundingContextLength = Flag.Int("surroundingContextLength").pipe(
  Flag.withDefault(5),
  Flag.withDescription("Amount of lines before and after translated ones in context."),
);
const concurrency = Flag.Int("concurrency").pipe(
  Flag.withDefault(1),
  Flag.withDescription("Number of subtitles to translate in parallel."),
);
const reasoning = Flag.Boolean("reasoning").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Enable LLM reasoning."),
);

const chunkSize = Flag.Int("chunkSize").pipe(
  Flag.withDefault(30),
  Flag.withDescription("The amount of lines in a single translation chunk."),
);
const maxRetries = Flag.Int("maxRetries").pipe(
  Flag.withDefault(3),
  Flag.withDescription("The amount of retries for translating a chunk. Retry count grows when using less capable LLM models."),
);

type TranslateArgs = {
  input: string;
  sourceLanguage: string;
  targetLanguage: string;
  llmProvider: LlmProvider;
  model: string;
  chunkSize: number;
  surroundingContextLength: number;
  maxRetries: number;
  concurrency: number;
  reasoning: boolean;
};

type TranslateError = PlatformError | ConfigError | TmdbError | SubtitleFileParsingError;
type TranslateEnv = FileSystem.FileSystem | HttpClient.HttpClient | TmdbClient | TranslationCache;

export const translateCommand = Command.make(
  "translate",
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
    reasoning,
  },
  (args) => runTranslation(args),
).pipe(
  Command.withDescription("Translate subtitles. Automatically detects media type. Accepts a single file or a directory for batch translation."),
);

function runTranslation(args: TranslateArgs): Effect.Effect<void, TranslateError, TranslateEnv> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const stat = yield* fs.stat(args.input);

    yield* Match.value(stat.type).pipe(
      Match.when("File", () => runSingleTranslation(args)),
      Match.when("Directory", () => runBatchTranslation(args)),
      Match.orElse(() => Effect.void),
    );
  });
}

function runSingleTranslation(args: TranslateArgs): Effect.Effect<void, TranslateError, TranslateEnv> {
  return Effect.gen(function* () {
    const fileInfo = yield* parseFilePath(args.input, args.sourceLanguage, args.targetLanguage);
    const data = yield* fetchTranslationData(args.input, fileInfo, args.sourceLanguage, args.targetLanguage);

    const sessionId = generateSessionId(data);
    const cacheId = generateCacheId(data, args.model, args.chunkSize, args.surroundingContextLength);
    yield* Effect.log(`Session ID: ${sessionId}`);

    const languageModel = makeLanguageModelLayer({
      provider: args.llmProvider,
      model: args.model,
      reasoning: args.reasoning,
      sessionId,
    });

    const params: TranslateChunkedParams = {
      chunkSize: args.chunkSize,
      surroundingContextLength: args.surroundingContextLength,
      maxRetries: args.maxRetries,
      concurrency: args.concurrency,
    };

    const translationInfoComment = [
      `Translated by asomnapisy v${packageJson.version}`,
      "https://github.com/Deseteral/asomnapisy",
      `model: ${args.model}`,
      `session ID: ${sessionId}`,
    ].join("\n");

    const result = yield* translateChunked(data, params, cacheId).pipe(
      Effect.map((data) => injectCommentIntoSrtData(translationInfoComment, data)),
      Effect.provide(languageModel),
    );

    yield* writeSrtFile(fileInfo.targetFilePath, result);
    yield* Effect.log(`Saved translated subtitles to ${fileInfo.targetFilePath}`);

    const cache = yield* TranslationCache;
    yield* cache.clear(cacheId);
  });
}

type BatchFileEntry = {
  filePath: string;
  fileInfo: SubtitleFileInfo;
};

type BatchStatus = "translated" | "skipped" | "failed";

function runBatchTranslation(args: TranslateArgs): Effect.Effect<void, PlatformError, TranslateEnv> {
  return Effect.gen(function* () {
    const entries = (yield* discoverFilesToBatchProcess(args))
      .toSorted((a, b) => a.filePath.localeCompare(b.filePath));

    if (entries.length === 0) {
      return yield* Effect.log(`No matching subtitle files found in ${args.input}.`);
    }

    yield* Effect.log(`Found ${entries.length} subtitle files in ${args.input}.`);

    const statuses = yield* Effect.forEach(entries, (entry) => translateBatchEntry(args, entry));
    const results = Arr.zip(entries, statuses);

    const countOf = (status: BatchStatus): number => statuses.filter((s) => s === status).length;
    const failed = results.filter(([, status]) => status === "failed");

    yield* Effect.log(`\nBatch complete: ${countOf("translated")} translated, ${countOf("skipped")} skipped, ${failed.length} failed.`);

    if (failed.length > 0) {
      yield* Effect.log("Failed:");
      yield* Effect.forEach(failed, ([entry]) => Effect.log(`  ${entry.filePath}`));
    }
  });
}

function translateBatchEntry(args: TranslateArgs, entry: BatchFileEntry): Effect.Effect<BatchStatus, PlatformError, TranslateEnv> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    if (yield* fs.exists(entry.fileInfo.targetFilePath)) {
      yield* Effect.log(`${entry.filePath} - skipped (target exists).`);
      return "skipped";
    }

    yield* Effect.log(`Translating ${entry.filePath}.`);

    return yield* runSingleTranslation({ ...args, input: entry.filePath }).pipe(
      Effect.as<BatchStatus>("translated"),
      Effect.catch((error) =>
        Effect.logError(`  ${entry.filePath} - failed: ${String(error)}.`)
          .pipe(Effect.as<BatchStatus>("failed")),
      ),
    );
  });
}

function discoverFilesToBatchProcess(args: TranslateArgs): Effect.Effect<BatchFileEntry[], PlatformError, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const filenames = yield* fs.readDirectory(args.input);

    const candidates = filenames.filter((filename) => isSupportedSourceFile(filename, args.sourceLanguage));

    const parsed = yield* Effect.forEach(candidates, (filename) => {
      const filePath = path.join(args.input, filename);
      return parseFilePath(filePath, args.sourceLanguage, args.targetLanguage).pipe(
        Effect.map((fileInfo): Option.Option<BatchFileEntry> => Option.some({ filePath, fileInfo })),
        Effect.catch((error) =>
          Effect.logWarning(`Skipping ${filename}: ${error.message}`)
            .pipe(Effect.as(Option.none<BatchFileEntry>())),
        ),
      );
    });

    return Arr.getSomes(parsed);
  });
}

function fetchTranslationData(
  inputPath: string,
  fileInfo: SubtitleFileInfo,
  sourceLanguage: string,
  targetLanguage: string,
): Effect.Effect<SubtitleTranslationData, PlatformError | TmdbError, FileSystem.FileSystem | TmdbClient> {
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

function isSupportedSourceFile(filename: string, sourceLanguage: string): boolean {
  return SUPPORTED_SUBTITLE_INPUT_FILE_TYPES
    .map((type) => `.${sourceLanguage}.${type}`)
    .some((suffix) => filename.endsWith(suffix));
}
