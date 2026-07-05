import { Command } from "@effect/cli";
import { Effect } from "effect";
import { TranslationCache } from "../services/translation-cache.ts";

export const clearCacheCommand = Command.make("clear-cache", {}, () => Effect.gen(function* () {
    const cache = yield* TranslationCache;
    yield* Effect.log("Clearing all cached translations.");
    yield* cache.clearAll();
    yield* Effect.log("Cache cleared.");
  }),
).pipe(
  Command.withDescription("Clear translation cache."),
);
