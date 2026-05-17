import { Args, Command, Options } from "@effect/cli";
import { Command as ShellCommand } from "@effect/platform";
import { Effect } from "effect";
import * as path from "node:path";

const input = Args.file({ name: "videoFile", exists: "yes" })
  .pipe(Args.withDescription("Video file with source subtitles."));
const track = Options.integer("track")
  .pipe(Options.withDescription("Subtitle track number (stream index from show-tracks)."));
const language = Options.text("language")
  .pipe(Options.withDescription("Two-letter language code for the output file name (e.g. pl, en, de)."));


const showSubtitleTracksCommand = Command.make("show-tracks", { input }, (args) => {
  return Effect.gen(function* () {
    const output = yield* ShellCommand.make(
      "ffprobe",
      ..."-loglevel error -select_streams s -show_entries stream=index:stream_tags=title -of csv=p=0".split(" "),
      args.input,
    ).pipe(ShellCommand.lines);

    console.log("Subtitle tracks in video file:");
    for (const line of output) {
      const [track, lang] = line.split(",");
      if (!track || !lang) continue;
      console.log(`${track.padStart(6, " ")} │ ${lang}`);
    }
  });
}).pipe(
  Command.withDescription("List available subtitle tracks in a video file."),
);

const extractSubtitlesCommand = Command.make(
  "extract-subtitles",
  { input, track, language },
  (args) => {
    return Effect.gen(function* () {
      const baseName = path.basename(args.input, path.extname(args.input));
      const dirName = path.dirname(args.input);
      const outputPath = path.join(dirName, `${baseName}.${args.language}.srt`);

      yield* Effect.log(`Extracting subtitle track ${args.track} to ${outputPath}.`);

      yield* ShellCommand.make(
        "ffmpeg",
        "-i", args.input,
        "-map", `0:s:${args.track}`,
        outputPath,
      ).pipe(ShellCommand.exitCode);

      yield* Effect.log(`Saved extracted subtitles to ${outputPath}.`);
    });
  },
).pipe(
  Command.withDescription("Extract a subtitle track from a video file to an SRT file using ffmpeg."),
);

export const fromVideoCommand = Command.make("from-video").pipe(
  Command.withDescription("Get subtitle data from video file."),
  Command.withSubcommands([showSubtitleTracksCommand, extractSubtitlesCommand]),
);
