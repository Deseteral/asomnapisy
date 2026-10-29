import { Argument, Command, Prompt } from "effect/cli";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import type { PlatformError } from "effect/PlatformError";
import { Data, Effect, Terminal } from "effect";
import * as path from "node:path";

const input = Argument.File("videoFile", { mustExist: true }).pipe(
  Argument.withDescription("Video file with source subtitles."),
);

class InvalidLanguageCodeError extends Data.TaggedError("InvalidLanguageCodeError")<{
  message: string;
}> {}

export const extractCommand = Command.make("extract", { input }, (args) => {
  return Effect.gen(function* () {
    yield* printTracks(args.input);

    const track = (yield* Prompt.String({ message: "Enter track number to extract:" })).trim();
    const language = (yield* Prompt.String({ message: "Enter two-letter language code (e.g. pl, en, de):" })).trim();

    if (language.length !== 2) {
      return yield* new InvalidLanguageCodeError({ message: `Invalid language code: "${language}".` });
    }

    yield* extractTrack(args.input, track, language);
  });
}).pipe(
  Command.withDescription("List subtitle tracks and interactively extract one to an SRT file."),
);

function printTracks(
  filePath: string,
): Effect.Effect<void, PlatformError, ChildProcessSpawner.ChildProcessSpawner | Terminal.Terminal> {
  return Effect.gen(function* () {
    const terminal = yield* Terminal.Terminal;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    const args = "-loglevel error -select_streams s -show_entries stream=index:stream_tags=language,title -of csv=p=0".split(" ");
    const lines = yield* spawner.lines(ChildProcess.make("ffprobe", [...args, filePath]));

    const rows = lines.flatMap((line) => {
      const [track, ...rest] = line.split(",");
      return track ? [`${track.padStart(6, " ")} │ ${rest.join(" ")}`] : [];
    });

    yield* terminal.display(["Subtitle tracks in video file:", ...rows, ""].join("\n"));
  });
}

function extractTrack(
  sourceFilePath: string,
  track: string,
  language: string,
): Effect.Effect<void, PlatformError, ChildProcessSpawner.ChildProcessSpawner> {
  return Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const baseName = path.basename(sourceFilePath, path.extname(sourceFilePath));
    const dirName = path.dirname(sourceFilePath);
    const outputPath = path.join(dirName, `${baseName}.${language}.srt`);

    yield* Effect.log(`Extracting subtitle track ${track} to ${outputPath}.`);

    yield* spawner.exitCode(ChildProcess.make(
      "ffmpeg",
      ["-i", sourceFilePath, "-map", `0:${track}`, outputPath],
      { stdout: "inherit", stderr: "inherit" },
    ));

    yield* Effect.log(`Saved extracted subtitles to ${outputPath}.`);
  });
}
