import { Effect } from "effect";
import { FileSystem } from "@effect/platform";

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

export function readSrtFile(path: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs.readFileString(path, "utf8");
    return parseSrt(text);
  });
}

export function getFullText(subtitle: SrtSubtitle): string {
  return subtitle.content.join("\n");
}

export function getSrtFullText(data: SrtData): string {
  return data.subtitles.map((s) => getFullText(s)).join("\n");
}
