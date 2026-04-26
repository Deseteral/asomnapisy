import { Config, Context, Data, Effect, Layer, Redacted, Schema } from "effect";
import type { MovieDetails } from "../data/movie-details.ts";

export class TmdbError extends Data.TaggedError("TmdbError")<{
  message: string;
  cause?: unknown;
}> {
}

export class TmdbClient extends Context.Tag("TmdbClient")<
  TmdbClient,
  {
    getMovieDetails(tmdbId: string): Effect.Effect<MovieDetails, TmdbError>;
  }
>() {
}

const TmdbMovieResponse = Schema.Struct({
  original_title: Schema.String,
  release_date: Schema.optional(Schema.String),
  overview: Schema.optional(Schema.String),
});

function getMovieDetails(token: string, tmdbId: string): Effect.Effect<MovieDetails, TmdbError> {
  return Effect.tryPromise({
    try: async () => {
      // TODO: This should use Effect's HTTP client.
      const response = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`TMDB responded with status ${response.status}.`);
      }

      return response.json();
    },
    catch: (error) => new TmdbError({ message: "Failed to fetch movie details from TMDB.", cause: error }),
  }).pipe(
    Effect.flatMap((data) =>
      Schema.decodeUnknown(TmdbMovieResponse)(data).pipe(
        Effect.mapError((cause) => new TmdbError({ message: "Bad response from TMDB.", cause })),
      ),
    ),
    Effect.map((json) => {
      const title = json.original_title;
      const releaseYear = json.release_date?.split("-")[0];
      const description = json.overview;

      return { title, tmdbId, releaseYear, description };
    }),
  );
}

export const TmdbClientLive: Layer.Layer<TmdbClient, TmdbError> = Layer.effect(
  TmdbClient,
  Effect.gen(function* () {
    const token = yield* Config.redacted("TMDB_ACCESS_TOKEN").pipe(
      Effect.mapError(() => new TmdbError({ message: "TMDB_ACCESS_TOKEN environment variable is not set." })),
    );

    return TmdbClient.of({
      getMovieDetails: (tmdbId) => getMovieDetails(Redacted.value(token), tmdbId),
    });
  }),
);
