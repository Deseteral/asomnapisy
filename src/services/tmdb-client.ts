import { Config, Context, Data, Effect, Layer, Redacted, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

export type MovieDetails = {
  title: string;
  tmdbId: string;
  releaseYear: string;
  description: string;
};

export type EpisodeDetails = {
  seriesTitle: string;
  seriesTmdbId: string;
  seriesDescription: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string;
  episodeDescription: string;
};

export class TmdbError extends Data.TaggedError("TmdbError")<{
  message: string;
  cause?: unknown;
}> {}

const TmdbMovieResponse = Schema.Struct({
  original_title: Schema.String,
  release_date: Schema.String,
  overview: Schema.String,
});

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

export class TmdbClient extends Context.Service<TmdbClient>()("TmdbClient", {
  make: Effect.gen(function* () {
    const token = yield* Config.Redacted("TMDB_ACCESS_TOKEN").pipe(
      Effect.mapError(() => new TmdbError({ message: "TMDB_ACCESS_TOKEN environment variable is not set." })),
    );
    const httpClient = yield* HttpClient.HttpClient;

    const fetchJson = <A, I>(
      path: string,
      schema: Schema.Codec<A, I>,
      errorMessage: string,
    ): Effect.Effect<A, TmdbError> => {
      const request = HttpClientRequest.get(`https://api.themoviedb.org/3${path}`).pipe(
        HttpClientRequest.bearerToken(Redacted.value(token)),
      );

      return httpClient.execute(request).pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap(HttpClientResponse.schemaBodyJson(schema)),
        Effect.mapError((cause) => new TmdbError({ message: errorMessage, cause })),
      );
    };

    const getMovieDetails = (tmdbId: string): Effect.Effect<MovieDetails, TmdbError> =>
      fetchJson(`/movie/${tmdbId}`, TmdbMovieResponse, "Failed to fetch movie details from TMDB.").pipe(
        Effect.map((movie) => ({
          title: movie.original_title,
          tmdbId,
          releaseYear: movie.release_date.split("-")[0] || "", // TODO: Maybe error this?
          description: movie.overview,
        })),
      );

    const getEpisodeDetails = (
      tmdbId: string,
      seasonNumber: number,
      episodeNumber: number,
    ): Effect.Effect<EpisodeDetails, TmdbError> =>
      Effect.all({
        series: fetchJson(`/tv/${tmdbId}`, TmdbSeriesResponse, "Failed to fetch series details from TMDB."),
        episode: fetchJson(
          `/tv/${tmdbId}/season/${seasonNumber}/episode/${episodeNumber}`,
          TmdbEpisodeResponse,
          `Failed to fetch episode S${seasonNumber}E${episodeNumber} details from TMDB.`,
        ),
      }, { concurrency: 2 }).pipe(
        Effect.map(({ series, episode }) => ({
          seriesTitle: series.original_name,
          seriesTmdbId: tmdbId,
          seriesDescription: series.overview,
          seasonNumber: episode.season_number,
          episodeNumber: episode.episode_number,
          episodeTitle: episode.name,
          episodeDescription: episode.overview,
        })),
      );

    return { getMovieDetails, getEpisodeDetails };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(FetchHttpClient.layer));
}
