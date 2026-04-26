import { Effect } from "effect";
import { TmdbClient } from "../services/tmdb-client.ts";

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

export function resolveMovieDetails(filename: string): Effect.Effect<MovieDetails, never, TmdbClient> {
  const filenameDetails = parseMovieDetailsFromFilename(filename);
  const baseDetails: MovieDetails = filenameDetails ?? { title: filename };

  if (!filenameDetails) {
    return Effect.logWarning("Could not parse movie details from filename.").pipe(
      Effect.as(baseDetails),
    );
  }

  const tmdbId = filenameDetails.tmdbId;
  if (!tmdbId) {
    return Effect.logWarning("Could not parse TMDB ID from filename.").pipe(
      Effect.as(baseDetails),
    );
  }

  return Effect.gen(function* () {
    const tmdb = yield* TmdbClient;
    return yield* tmdb.getMovieDetails(tmdbId);
  }).pipe(
    Effect.catchAll((error) =>
      Effect.logWarning(
        `Failed to fetch TMDB details: ${error.message}. Continuing with filename-only details.`,
      ).pipe(Effect.as(baseDetails)),
    ),
  );
}
