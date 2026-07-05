import { Effect, Schema } from "effect";
import { FileSystem } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import type { SrtSubtitle } from "../data/srt.ts";
import { BunFileSystem } from "@effect/platform-bun";
import * as os from "node:os";
import * as path from "node:path";

const CachedSubtitle = Schema.Struct({
  order: Schema.String,
  timestamp: Schema.String,
  content: Schema.mutable(Schema.Array(Schema.String)),
});
const CacheDataSchema = Schema.mutable(
  Schema.Record({
    key: Schema.String,
    value: Schema.mutable(Schema.Array(CachedSubtitle)),
  }),
);
const JsonCacheData = Schema.parseJson(CacheDataSchema);
type CacheData = Schema.Schema.Type<typeof CacheDataSchema>;

function cacheFilePath(cacheId: string): string {
  return path.join(cacheDir(), `${cacheId}.json`);
}

function cacheDir(): string {
  return path.join(os.tmpdir(), "asomnapisy");
}

export class TranslationCache extends Effect.Service<TranslationCache>()("TranslationCache", {
  dependencies: [BunFileSystem.layer],
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const semaphore = yield* Effect.makeSemaphore(1);

    const load = (cacheId: string): Effect.Effect<Map<string, SrtSubtitle[]>> =>
      semaphore.withPermits(1)(
        Effect.gen(function* () {
          const filePath = cacheFilePath(cacheId);

          const json = yield* fs.readFileString(filePath, "utf8").pipe(
            Effect.catchAll((error: PlatformError) =>
              Effect.logWarning(`Failed to read cache file (${cacheId}): ${error.message}`)
                .pipe(Effect.as("{}")),
            ),
          );

          const decoded = yield* Schema.decodeUnknown(JsonCacheData)(json).pipe(
            Effect.catchAll((error) =>
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
            Effect.catchAll((error: PlatformError) =>
              Effect.logWarning(`Failed to create cache dir (${cacheId}): ${error.message}`),
            ),
          );

          const json = yield* fs.readFileString(filePath, "utf8").pipe(
            Effect.catchAll(() => Effect.succeed("{}")),
          );

          const existing = yield* Schema.decodeUnknown(JsonCacheData)(json).pipe(
            Effect.catchAll(() => Effect.succeed<CacheData>({})),
          );

          existing[chunkId] = subtitles;

          const tmpPath = `${filePath}.tmp`;
          yield* Schema.encode(JsonCacheData)(existing).pipe(
            Effect.flatMap((data) =>
              fs.writeFileString(tmpPath, data).pipe(
                Effect.zipRight(fs.rename(tmpPath, filePath)),
                Effect.uninterruptible,
              ),
            ),
            Effect.catchAll((error) =>
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
            Effect.catchAll((error: PlatformError) =>
              Effect.logWarning(`Failed to clear cache (${cacheId}): ${error.message}`),
            ),
          );
        }),
      );

    const clearAll = (): Effect.Effect<void> =>
      semaphore.withPermits(1)(
        Effect.gen(function* () {
          yield* fs.remove(cacheDir(), { recursive: true, force: true }).pipe(
            Effect.catchAll((error: PlatformError) =>
              Effect.logWarning(`Failed to clear cache directory: ${error.message}`),
            ),
          );
        }),
      );

    return { load, save, clear, clearAll };
  }),
}) {}
