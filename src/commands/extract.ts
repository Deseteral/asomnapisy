import { Args, Command } from "@effect/cli";
import { Command as ShellCommand, CommandExecutor } from "@effect/platform";
import { Effect } from "effect";
import * as path from "node:path";
import type { PlatformError } from "@effect/platform/Error";
import { terminalReadline } from "../utils.ts";

const input = Args.file({ name: "videoFile", exists: "yes" }).pipe(
  Args.withDescription("Video file with source subtitles."),
);

function printTracks(filePath: string): Effect.Effect<void, PlatformError, CommandExecutor.CommandExecutor> {
  return Effect.gen(function* () {
    const args = "-loglevel error -select_streams s -show_entries stream=index:stream_tags=language,title -of csv=p=0".split(" ");
    const output = yield* ShellCommand.make("ffprobe", ...args, filePath)
      .pipe(ShellCommand.lines);

    console.log("Subtitle tracks in video file:");
    for (const line of output) {
      const [track, ...rest] = line.split(",");
      if (!track) continue;
      console.log(`${track.padStart(6, " ")} │ ${rest.join(" ")}`);
    }
  });
}

function extractTrack(sourceFilePath: string, track: string, language: string): Effect.Effect<void, PlatformError, CommandExecutor.CommandExecutor> {
  return Effect.gen(function* () {
    const baseName = path.basename(sourceFilePath, path.extname(sourceFilePath));
    const dirName = path.dirname(sourceFilePath);
    const outputPath = path.join(dirName, `${baseName}.${language}.srt`);

    yield* Effect.log(`Extracting subtitle track ${track} to ${outputPath}.`);

    yield* ShellCommand.make(
      "ffmpeg",
      "-i", sourceFilePath,
      "-map", `0:${track}`,
      outputPath,
    ).pipe(
      ShellCommand.stdout("inherit"),
      ShellCommand.stderr("inherit"),
      ShellCommand.exitCode,
    );

    yield* Effect.log(`Saved extracted subtitles to ${outputPath}.`);
  });
}

export const extractCommand = Command.make("extract", { input }, (args) => {
  return Effect.gen(function* () {
    yield* printTracks(args.input);

    const track = (yield* terminalReadline("Enter track number to extract: ")).trim();
    const language = (yield* terminalReadline("Enter two-letter language code (e.g. pl, en, de): ")).trim();

    if (language.length !== 2) {
      return yield* Effect.dieMessage(`Invalid language code: "${language}".`);
    }

    yield* extractTrack(args.input, track, language);
  });
}).pipe(
  Command.withDescription("List subtitle tracks and interactively extract one to an SRT file."),
);
