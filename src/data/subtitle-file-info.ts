import { Data, Effect } from "effect";
import * as path from "node:path";
import { stringReplaceLast } from "../utils.ts";

export const SUPPORTED_SUBTITLE_FILE_TYPES = ["srt"] as const;
export type SubtitleFileType = (typeof SUPPORTED_SUBTITLE_FILE_TYPES)[number];
export function isSupportedSubtitle(ext: string): ext is SubtitleFileType {
  return (SUPPORTED_SUBTITLE_FILE_TYPES as readonly string[]).includes(ext);
}

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

export class SubtitleFileParsingError extends Data.TaggedError("SubtitleFileParsingError")<{
  message: string;
}> {}

const EPISODE_PATTERN = /[Ss](\d+)[Ee](\d+)/;
const PARTIAL_SEASON_PATTERN = /[Ss](\d+)/;

export function parseFilePath(
  filePath: string,
  sourceLanguageCode: string,
  targetLanguageCode: string,
): Effect.Effect<SubtitleFileInfo, SubtitleFileParsingError> {
  const fail = (message: string): Effect.Effect<never, SubtitleFileParsingError> =>
    Effect.fail(new SubtitleFileParsingError({ message }));

  const filename = path.basename(filePath);
  const dirname = path.dirname(filePath);
  const type = path.extname(filePath).replace('.', '');

  if (!isSupportedSubtitle(type)) {
    return fail(`Unsupported subtitle file type "${type}".`);
  }

  if (!filename.includes(`.${sourceLanguageCode}.`)) {
    return fail(`Missing ".${sourceLanguageCode}." language code in filename.`);
  }

  const tmdbId = filename.match(/tmdb-(\d+)/)?.[1];
  if (!tmdbId) {
    return fail('Missing "tmdb-<id>" tag in filename.');
  }

  const targetFileName = stringReplaceLast(
    filename,
    `.${sourceLanguageCode}.`,
    `.${targetLanguageCode}.`,
  );

  const targetFilePath = path.join(dirname, targetFileName);

  const episodeMatch = filename.match(EPISODE_PATTERN);
  if (episodeMatch?.[1] && episodeMatch?.[2]) {
    return Effect.succeed({
      kind: "episode",
      type,
      seriesTmdbId: tmdbId,
      seasonNumber: parseInt(episodeMatch[1], 10),
      episodeNumber: parseInt(episodeMatch[2], 10),
      targetFilePath,
    });
  }

  // Detect partial episode patterns (e.g. S01 without E-number).
  if (PARTIAL_SEASON_PATTERN.test(filename)) {
    return fail(`Season without episode number in filename "${filename}".`);
  }

  return Effect.succeed({
    kind: "movie",
    type,
    tmdbId,
    targetFilePath,
  });
}
