import { Config, Effect, Redacted, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import type { EpisodeDetails, MovieDetails } from "../data/movie-details.ts";

export class TmdbError extends Schema.TaggedError<TmdbError>()("TmdbError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
}

const TmdbMovieResponse = Schema.Struct({
  original_title: Schema.String,
  release_date: Schema.String,
  overview: Schema.String,
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
      releaseYear: json.release_date.split("-")[0] || "", // TODO: Maybe error this?
      description: json.overview,
    })),
  );
}

const TmdbSeriesResponse = Schema.Struct({
  original_name: Schema.String,
  overview: Schema.String,
});

const TmdbEpisodeResponse = Schema.Struct({
  name: Schema.String,
  overview: Schema.String,
  season_number: Schema.Number,
  episode_number: Schema.Number,
});

function fetchSeriesDetails(
  httpClient: HttpClient.HttpClient,
  token: string,
  tmdbId: string,
): Effect.Effect<typeof TmdbSeriesResponse.Type, TmdbError> {
  const url = `https://api.themoviedb.org/3/tv/${tmdbId}`;
  const request = HttpClientRequest.get(url)
    .pipe(HttpClientRequest.bearerToken(token));

  return httpClient.execute(request).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(TmdbSeriesResponse)),
    Effect.mapError((cause) => new TmdbError({ message: "Failed to fetch series details from TMDB.", cause })),
  );
}

function fetchEpisodeDetails(
  httpClient: HttpClient.HttpClient,
  token: string,
  tmdbId: string,
  seasonNumber: number,
  episodeNumber: number,
): Effect.Effect<typeof TmdbEpisodeResponse.Type, TmdbError> {
  const url = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNumber}/episode/${episodeNumber}`;
  const request = HttpClientRequest.get(url)
    .pipe(HttpClientRequest.bearerToken(token));

  return httpClient.execute(request).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(TmdbEpisodeResponse)),
    Effect.mapError((cause) => new TmdbError({
      message: `Failed to fetch episode S${seasonNumber}E${episodeNumber} details from TMDB.`,
      cause,
    })),
  );
}

function buildEpisodeDetails(
  tmdbId: string,
  series: typeof TmdbSeriesResponse.Type,
  episode: typeof TmdbEpisodeResponse.Type,
): EpisodeDetails {
  return {
    seriesTitle: series.original_name,
    seriesTmdbId: tmdbId,
    seriesDescription: series.overview,
    seasonNumber: episode.season_number,
    episodeNumber: episode.episode_number,
    episodeTitle: episode.name,
    episodeDescription: episode.overview,
  };
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

      getEpisodeDetails: (tmdbId: string, seasonNumber: number, episodeNumber: number): Effect.Effect<EpisodeDetails, TmdbError> =>
        Effect.all({
          series: fetchSeriesDetails(httpClient, Redacted.value(token), tmdbId),
          episode: fetchEpisodeDetails(httpClient, Redacted.value(token), tmdbId, seasonNumber, episodeNumber),
        }, { concurrency: 2 }).pipe(
          Effect.map(({ series, episode }) => buildEpisodeDetails(tmdbId, series, episode)),
        ),
    };
  }),
  dependencies: [FetchHttpClient.layer],
}) {
}
