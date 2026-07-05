import { Effect } from "effect";
import { FileSystem } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";

export type SrtSubtitle = {
  order: string;
  timestamp: string;
  content: string[];
};

export type SrtData = {
  subtitles: SrtSubtitle[];
};

export function parseSrt(text: string): SrtData {
  const groups = text.split("\n\n");

  const subtitles = groups
    .map((group) => {
      const lines = group.split("\n");

      const [order, timestamp, ...content] = lines;
      if (!order || !timestamp || content.length === 0) return null;

      return { order, timestamp, content } satisfies SrtSubtitle;
    })
    .filter((s): s is SrtSubtitle => s !== null);

  return { subtitles };
}

export function serializeSrt(data: SrtData): string {
  return data.subtitles
    .map((subtitle) => [subtitle.order, subtitle.timestamp, ...subtitle.content, "", ""].join("\n"))
    .join("");
}

export function readSrtFile(path: string): Effect.Effect<SrtData, PlatformError, FileSystem.FileSystem> {
  return FileSystem.FileSystem.pipe(
    Effect.flatMap((fs) => fs.readFileString(path, "utf8")),
    Effect.map(parseSrt),
  );
}

export function writeSrtFile(filePath: string, data: SrtData): Effect.Effect<void, PlatformError, FileSystem.FileSystem> {
  return FileSystem.FileSystem.pipe(
    Effect.flatMap((fs) => fs.writeFileString(filePath, serializeSrt(data))),
  );
}

export function getFullText(subtitle: SrtSubtitle): string {
  return subtitle.content.join("\n");
}

export function injectCommentIntoSrtData(comment: string, data: SrtData): SrtData {
  const commentSubtitle: SrtSubtitle = {
    order: '0',
    timestamp: '00:00:00,000 --> 00:00:00,000',
    content: [comment],
  };
  return {
    ...data,
    subtitles: [commentSubtitle, ...data.subtitles],
  }
}
