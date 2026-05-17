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
