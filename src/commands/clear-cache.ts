import { Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";
import { TranslationCache } from "../services/translation-cache.ts";

const session = Options.text("session").pipe(
  Options.optional,
  Options.withDescription("Session ID to clear (clears all cache if not specified)."),
);

type ClearCacheArgs = {
  session: Option.Option<string>;
};

export const clearCacheCommand = Command.make(
  "clear-cache",
  { session },
  (args: ClearCacheArgs) =>
    Effect.gen(function* () {
      const cache = yield* TranslationCache;

      if (Option.isSome(args.session)) {
        yield* Effect.log(`Clearing cache for session: ${args.session.value}`);
        yield* cache.clear(args.session.value);
      } else {
        yield* Effect.log("Clearing all cached translations.");
        yield* cache.clearAll();
      }

      yield* Effect.log("Cache cleared.");
    }),
).pipe(
  Command.withDescription("Clear translation cache. Clears all sessions by default, or a specific session with --session."),
);
