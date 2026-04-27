import { Config, Effect, Redacted, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import type { MovieDetails } from "../data/movie-details.ts";

export class TmdbError extends Schema.TaggedError<TmdbError>()("TmdbError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
}

const TmdbMovieResponse = Schema.Struct({
  original_title: Schema.String,
  release_date: Schema.optional(Schema.String),
  overview: Schema.optional(Schema.String),
});

function fetchMovieDetails(
  httpClient: HttpClient.HttpClient,
  token: string,
  tmdbId: string,
): Effect.Effect<MovieDetails, TmdbError> {
  const request = HttpClientRequest.get(`https://api.themoviedb.org/3/movie/${tmdbId}`).pipe(
    HttpClientRequest.bearerToken(token),
  );

  return httpClient.execute(request).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(TmdbMovieResponse)),
    Effect.mapError((cause) => new TmdbError({ message: "Failed to fetch movie details from TMDB.", cause })),
    Effect.map((json) => ({
      title: json.original_title,
      tmdbId,
      releaseYear: json.release_date?.split("-")[0],
      description: json.overview,
    })),
  );
}

export class TmdbClient extends Effect.Service<TmdbClient>()("TmdbClient", {
  effect: Effect.gen(function* () {
    const token = yield* Config.redacted("TMDB_ACCESS_TOKEN").pipe(
      Effect.mapError(() => new TmdbError({ message: "TMDB_ACCESS_TOKEN environment variable is not set." })),
    );
    const httpClient = yield* HttpClient.HttpClient;

    return {
      getMovieDetails: (tmdbId: string): Effect.Effect<MovieDetails, TmdbError> =>
        fetchMovieDetails(httpClient, Redacted.value(token), tmdbId),
    };
  }),
  dependencies: [FetchHttpClient.layer],
}) {
}
