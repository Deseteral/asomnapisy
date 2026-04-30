import { Data, Effect, Match } from "effect";
import * as path from "node:path";

// TODO: Add support for vtt.
export const SUPPORTED_SUBTITLE_FILE_TYPES = ["srt"] as const;
export type SubtitleFileType = (typeof SUPPORTED_SUBTITLE_FILE_TYPES)[number];

export type SubtitleFileInfo = {
  type: SubtitleFileType,
  tmdbId: string,
  targetFilePath: string,
};

export class UnsupportedSubtitleFileTypeError extends Data.TaggedError("UnsupportedSubtitleFileTypeError")<object> {}

export class LanguageCodeMissingError extends Data.TaggedError("LanguageCodeMissingError")<object> {}

export class TmdbIdMissingError extends Data.TaggedError("TmdbIdMissingError")<object> {}

export type SubtitleFilePathParsingError =
  | UnsupportedSubtitleFileTypeError
  | LanguageCodeMissingError
  | TmdbIdMissingError;

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

    return {
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

