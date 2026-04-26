import { Config, Context, Data, Effect, Layer, Redacted, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
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

function getMovieDetails(
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

export const TmdbClientLive: Layer.Layer<TmdbClient, TmdbError, HttpClient.HttpClient> = Layer.effect(
  TmdbClient,
  Effect.gen(function* () {
    const token = yield* Config.redacted("TMDB_ACCESS_TOKEN").pipe(
      Effect.mapError(() => new TmdbError({ message: "TMDB_ACCESS_TOKEN environment variable is not set." })),
    );
    const httpClient = yield* HttpClient.HttpClient;

    return TmdbClient.of({
      getMovieDetails: (tmdbId) => getMovieDetails(httpClient, Redacted.value(token), tmdbId),
    });
  }),
);
