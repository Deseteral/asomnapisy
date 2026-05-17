import { Data, Effect, Match } from "effect";
import * as path from "node:path";

// TODO: Add support for vtt.
export const SUPPORTED_SUBTITLE_FILE_TYPES = ["srt"] as const;
export type SubtitleFileType = (typeof SUPPORTED_SUBTITLE_FILE_TYPES)[number];

type BaseFileInfo = {
  type: SubtitleFileType;
  targetFilePath: string;
};

export type MovieFileInfo = BaseFileInfo & {
  kind: "movie";
  tmdbId: string;
};

export type EpisodeFileInfo = BaseFileInfo & {
  kind: "episode";
  seriesTmdbId: string;
  seasonNumber: number;
  episodeNumber: number;
};

export type SubtitleFileInfo = MovieFileInfo | EpisodeFileInfo;

export class UnsupportedSubtitleFileTypeError extends Data.TaggedError("UnsupportedSubtitleFileTypeError")<object> {}

export class LanguageCodeMissingError extends Data.TaggedError("LanguageCodeMissingError")<object> {}

export class TmdbIdMissingError extends Data.TaggedError("TmdbIdMissingError")<object> {}

export class SeasonNumberMissingError extends Data.TaggedError("SeasonNumberMissingError")<{
  filename: string;
}> {}

export class EpisodeNumberMissingError extends Data.TaggedError("EpisodeNumberMissingError")<{
  filename: string;
}> {}

export type SubtitleFilePathParsingError =
  | UnsupportedSubtitleFileTypeError
  | LanguageCodeMissingError
  | TmdbIdMissingError
  | SeasonNumberMissingError
  | EpisodeNumberMissingError;

const EPISODE_PATTERN = /[Ss](\d+)[Ee](\d+)/;
const PARTIAL_SEASON_PATTERN = /[Ss](\d+)/;

export function parseFilePath(
  filePath: string,
  sourceLanguageCode: string,
  targetLanguageCode: string,
  model: string,
): Effect.Effect<SubtitleFileInfo, SubtitleFilePathParsingError> {
  return Effect.gen(function* () {
    const filename = path.basename(filePath);
    const dirname = path.dirname(filePath);
    const extension = path.extname(filePath);

    const type: SubtitleFileType = yield* Match.value(extension).pipe(
      Match.when(".srt", () => Effect.succeed("srt" as const)),
      Match.orElse(() => Effect.fail(new UnsupportedSubtitleFileTypeError())),
    );

    if (!filename.includes(`.${sourceLanguageCode}.`)) {
      return yield* Effect.fail(new LanguageCodeMissingError());
    }

    const tmdbId = filename.match(/tmdb-(\d+)/)?.[1];
    if (!tmdbId) {
      return yield* Effect.fail(new TmdbIdMissingError());
    }

    const targetFileName = replaceLast(
      filename,
      `.${sourceLanguageCode}.`,
      `.${model}.${targetLanguageCode}.`,
    );

    const targetFilePath = path.join(dirname, targetFileName);

    const episodeMatch = filename.match(EPISODE_PATTERN);
    if (episodeMatch?.[1] && episodeMatch?.[2]) {
      const seasonNumber = parseInt(episodeMatch[1], 10);
      const episodeNumber = parseInt(episodeMatch[2], 10);
      return {
        kind: "episode" as const,
        type,
        seriesTmdbId: tmdbId,
        seasonNumber,
        episodeNumber,
        targetFilePath,
      };
    }

    // Detect partial episode patterns (e.g. S01 without E-number).
    if (PARTIAL_SEASON_PATTERN.test(filename)) {
      return yield* Effect.fail(new EpisodeNumberMissingError({ filename }));
    }

    return {
      kind: "movie" as const,
      type,
      tmdbId,
      targetFilePath,
    };
  });
}

function replaceLast(str: string, search: string, replacement: string): string {
  const index = str.lastIndexOf(search);
  if (index === -1) return str;
  return str.slice(0, index) + replacement + str.slice(index + search.length);
}

