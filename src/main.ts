import { Command } from "@effect/cli";
import { Effect, Layer } from "effect";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { FetchHttpClient } from "@effect/platform";
import { fromVideoCommand } from "./commands/from-video.ts";
import { TmdbClient } from "./services/tmdb-client.ts";
import { translateMovieCommand, translateSeriesCommand } from "./commands/translate.ts";

const command = Command.make("asomnapisy").pipe(
  Command.withSubcommands([
    translateMovieCommand,
    translateSeriesCommand,
    fromVideoCommand,
  ]),
);

const cli = Command.run(command, {
  name: "asomnapisy",
  version: "v1.0.0",
});

// Cast needed: TypeScript's Exclude can't reduce CliApp.Environment (FileSystem | Path | Terminal)
// against BunContext even though all members are provided.
const program = cli(process.argv).pipe(
  Effect.provide(Layer.mergeAll(BunContext.layer, FetchHttpClient.layer, TmdbClient.Default)),
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(program as Effect.Effect<void, any>).pipe(BunRuntime.runMain);
