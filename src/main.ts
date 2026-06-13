import { Command } from "@effect/cli";
import { Effect, Layer } from "effect";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { FetchHttpClient } from "@effect/platform";
import { TmdbClient } from "./services/tmdb-client";
import { translateCommand } from "./commands/translate";
import { extractCommand } from "./commands/extract.ts";

const command = Command.make("asomnapisy").pipe(
  Command.withSubcommands([
    translateCommand,
    extractCommand,
  ]),
);

const cli = Command.run(command, {
  name: "asomnapisy",
  version: "v1.0.0",
});

// TODO:
// Cast needed: TypeScript's Exclude can't reduce CliApp.Environment (FileSystem | Path | Terminal)
// against BunContext even though all members are provided.
const program = cli(process.argv).pipe(
  Effect.provide(Layer.mergeAll(BunContext.layer, FetchHttpClient.layer, TmdbClient.Default)),
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(program as Effect.Effect<void, any>).pipe(BunRuntime.runMain);
