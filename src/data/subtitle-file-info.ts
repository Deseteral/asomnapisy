import { Data, Effect } from "effect";
import * as path from "node:path";

export type SubtitleFileInfo = {
  type: "srt",
  tmdbId: string,
  targetFilePath: string,
};

export class UnsupportedSubtitleFileTypeError extends Data.TaggedError("UnsupportedSubtitleFileTypeError")<{}> {}

export class LanguageCodeMissingError extends Data.TaggedError("LanguageCodeMissingError")<{}> {}

export class TmdbIdMissingError extends Data.TaggedError("TmdbIdMissingError")<{}> {}

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
    // TODO: Add support for more file types.
    const type = "srt";

    const filename = path.basename(filePath);
    const dirname = path.dirname(filePath);
    const extension = path.extname(filePath).replace(".", "");

    if (extension !== "srt") {
      return yield* Effect.fail(new UnsupportedSubtitleFileTypeError());
    }

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

  if (index === -1) {
    return str;
  }

  return str.slice(0, index) + replacement + str.slice(index + search.length);
}

