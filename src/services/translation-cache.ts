import { Context, Effect, FileSystem, Layer, Schema, Semaphore } from "effect";
import type { PlatformError } from "effect/PlatformError";
import type { SrtSubtitle } from "../data/srt.ts";
import { BunFileSystem } from "@effect/platform-bun";
import * as os from "node:os";
import * as path from "node:path";

const CachedSubtitle = Schema.Struct({
  order: Schema.String,
  timestamp: Schema.String,
  content: Schema.mutable(Schema.Array(Schema.String)),
});
const CacheDataSchema = Schema.Record(
  Schema.String,
  Schema.mutableKey(Schema.mutable(Schema.Array(CachedSubtitle))),
);
const JsonCacheData = Schema.fromJsonString(CacheDataSchema);
type CacheData = Schema.Schema.Type<typeof CacheDataSchema>;

function cacheFilePath(cacheId: string): string {
  return path.join(cacheDir(), `${cacheId}.json`);
}

function cacheDir(): string {
  return path.join(os.tmpdir(), "asomnapisy");
}

export class TranslationCache extends Context.Service<TranslationCache>()("TranslationCache", {
  make: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const semaphore = yield* Semaphore.make(1);

    const load = (cacheId: string): Effect.Effect<Map<string, SrtSubtitle[]>> =>
      semaphore.withPermits(1)(
        Effect.gen(function* () {
          const filePath = cacheFilePath(cacheId);

          const json = yield* fs.readFileString(filePath, "utf8").pipe(
            Effect.catch((error: PlatformError) =>
              Effect.logWarning(`Failed to read cache file (${cacheId}): ${error.message}`)
                .pipe(Effect.as("{}")),
            ),
          );

          const decoded = yield* Schema.decodeUnknownEffect(JsonCacheData)(json).pipe(
            Effect.catch((error) =>
              Effect.logWarning(`Failed to parse cache file (${cacheId}): ${error.message}`)
                .pipe(Effect.as<CacheData>({})),
            ),
          );

          return new Map(Object.entries(decoded));
        }),
      );

    const save = (
      cacheId: string,
      chunkId: string,
      subtitles: SrtSubtitle[],
    ): Effect.Effect<void> =>
      semaphore.withPermits(1)(
        Effect.gen(function* () {
          const filePath = cacheFilePath(cacheId);

          yield* fs.makeDirectory(cacheDir(), { recursive: true }).pipe(
            Effect.catch((error: PlatformError) =>
              Effect.logWarning(`Failed to create cache dir (${cacheId}): ${error.message}`),
            ),
          );

          const json = yield* fs.readFileString(filePath, "utf8").pipe(
            Effect.catch(() => Effect.succeed("{}")),
          );

          const existing = yield* Schema.decodeUnknownEffect(JsonCacheData)(json).pipe(
            Effect.catch(() => Effect.succeed<CacheData>({})),
          );

          existing[chunkId] = subtitles;

          const tmpPath = `${filePath}.tmp`;
          yield* Schema.encodeEffect(JsonCacheData)(existing).pipe(
            Effect.flatMap((data) =>
              fs.writeFileString(tmpPath, data).pipe(
                Effect.andThen(fs.rename(tmpPath, filePath)),
                Effect.uninterruptible,
              ),
            ),
            Effect.catch((error) =>
              Effect.logWarning(`Failed to save cache file (${cacheId}): ${error.message}`),
            ),
          );
        }),
      );

    const clear = (cacheId: string): Effect.Effect<void> =>
      semaphore.withPermits(1)(
        Effect.gen(function* () {
          const filePath = cacheFilePath(cacheId);

          yield* fs.remove(filePath, { force: true }).pipe(
            Effect.catch((error: PlatformError) =>
              Effect.logWarning(`Failed to clear cache (${cacheId}): ${error.message}`),
            ),
          );
        }),
      );

    const clearAll = (): Effect.Effect<void> =>
      semaphore.withPermits(1)(
        Effect.gen(function* () {
          yield* fs.remove(cacheDir(), { recursive: true, force: true }).pipe(
            Effect.catch((error: PlatformError) =>
              Effect.logWarning(`Failed to clear cache directory: ${error.message}`),
            ),
          );
        }),
      );

    return { load, save, clear, clearAll };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(BunFileSystem.layer));
}
