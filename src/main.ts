import { Command } from "@effect/cli";
import { Effect, Layer } from "effect";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { FetchHttpClient } from "@effect/platform";
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
  name: "asomnapisy",
  version: "v1.0.0",
});

const MainLayer = Layer.mergeAll(BunContext.layer, FetchHttpClient.layer, TmdbClient.Default, TranslationCache.Default);

cli(process.argv).pipe(
  Effect.provide(MainLayer),
  BunRuntime.runMain,
);
