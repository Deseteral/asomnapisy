import { Effect } from "effect";
import { FileSystem } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { BunFileSystem } from "@effect/platform-bun";
import type { SrtSubtitle } from "../data/srt.ts";
import * as os from "node:os";
import * as path from "node:path";

type CacheData = Record<string, Array<{
  order: string;
  timestamp: string;
  content: string[];
}>>;

function cacheFilePath(sessionId: string): string {
  return path.join(cacheDir(), `${sessionId}.json`);
}

function cacheDir(): string {
  return path.join(os.tmpdir(), "asomnapisy");
}

export class TranslationCache extends Effect.Service<TranslationCache>()("TranslationCache", {
  dependencies: [BunFileSystem.layer],
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const semaphore = yield* Effect.makeSemaphore(1);

    const load = (sessionId: string): Effect.Effect<Map<string, SrtSubtitle[]>> =>
      semaphore.withPermits(1)(
        Effect.gen(function* () {
          const filePath = cacheFilePath(sessionId);

          const exists = yield* fs.exists(filePath)
            .pipe(Effect.catchAll(() => Effect.succeed(false)));

          if (!exists) return new Map();

          const json = yield* fs.readFileString(filePath, "utf8").pipe(
            Effect.catchAll((error: PlatformError) =>
              Effect.logWarning(`Failed to read cache file: ${error.message}`)
                .pipe(Effect.as("{}")),
            ),
          );

          let parsed: CacheData;
          try {
            parsed = JSON.parse(json) as CacheData;
          } catch (error) {
            yield* Effect.logWarning(`Failed to parse cache file: ${String(error)}`);
            parsed = {};
          }

          return new Map(Object.entries(parsed));
        }),
      );

    const save = (
      sessionId: string,
      chunkLabel: string,
      subtitles: SrtSubtitle[],
    ): Effect.Effect<void> =>
      semaphore.withPermits(1)(
        Effect.gen(function* () {
          const filePath = cacheFilePath(sessionId);

          yield* fs.makeDirectory(cacheDir(), { recursive: true }).pipe(
            Effect.catchAll((error: PlatformError) =>
              Effect.logWarning(`Failed to create cache dir: ${error.message}`),
            ),
          );

          let existing: CacheData = {};
          const exists = yield* fs.exists(filePath).pipe(
            Effect.catchAll(() => Effect.succeed(false)),
          );
          if (exists) {
            const json = yield* fs.readFileString(filePath, "utf8").pipe(
              Effect.catchAll(() => Effect.succeed("{}")),
            );
            try {
              existing = JSON.parse(json) as CacheData;
            } catch {
              existing = {};
            }
          }

          existing[chunkLabel] = subtitles.map((s) => ({
            order: s.order,
            timestamp: s.timestamp,
            content: s.content,
          }));

          yield* fs.writeFileString(filePath, JSON.stringify(existing)).pipe(
            Effect.catchAll((error: PlatformError) =>
              Effect.logWarning(`Failed to write cache file: ${error.message}`),
            ),
          );
        }),
      );

    const clear = (sessionId: string): Effect.Effect<void> =>
      Effect.gen(function* () {
        const filePath = cacheFilePath(sessionId);

        const exists = yield* fs.exists(filePath).pipe(
          Effect.catchAll(() => Effect.succeed(false)),
        );
        if (exists) {
          yield* fs.remove(filePath).pipe(
            Effect.catchAll((error: PlatformError) =>
              Effect.logWarning(`Failed to clear cache: ${error.message}`),
            ),
          );
        }
      });

    return { load, save, clear };
  }),
}) {}
