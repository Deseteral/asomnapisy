export type MovieDetails = {
  title: string;
  tmdbId?: string;
  releaseYear?: string;
  description?: string;
};

const FILENAME_REGEX =
  /^(.*?)(?=\s*[({]|\.[a-z]{2}\.srt$|\.srt$)(?:\s*\((?<year>\d{4})\))?(?:\s*\{tmdb-(?<tmdbId>\d+)\})?.*?\.(?:[a-z]{2}\.)?srt$/;

export function parseMovieDetailsFromFilename(filename: string): MovieDetails | null {
  const match = filename.match(FILENAME_REGEX);

  if (!match) return null;

  const title = match[1];
  const releaseYear = match.groups?.["year"];
  const tmdbId = match.groups?.["tmdbId"];

  if (!title) return null;

  return { tmdbId, title, releaseYear };
}
