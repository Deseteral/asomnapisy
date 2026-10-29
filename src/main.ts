import { Command } from "effect/cli";
import { Effect, Layer } from "effect";
import { BunServices, BunRuntime } from "@effect/platform-bun";
import { FetchHttpClient } from "effect/http";
import { TmdbClient } from "./services/tmdb-client";
import { TranslationCache } from "./services/translation-cache";
import { translateCommand } from "./commands/translate";
import { extractCommand } from "./commands/extract.ts";
import { clearCacheCommand } from "./commands/clear-cache.ts";

const command = Command.make("asomnapisy").pipe(
  Command.withSubcommands([
    translateCommand,
    extractCommand,
    clearCacheCommand,
  ]),
);

const cli = Command.run(command, {
  version: "1.0.0",
});

const MainLayer = Layer.mergeAll(BunServices.layer, FetchHttpClient.layer, TmdbClient.layer, TranslationCache.layer);

cli.pipe(
  Effect.provide(MainLayer),
  BunRuntime.runMain,
);
