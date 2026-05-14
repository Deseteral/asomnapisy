import { Args, Command } from "@effect/cli";
import { Command as ShellCommand } from "@effect/platform";
import { Effect } from "effect";

const input = Args.file({ name: "videoFile", exists: "yes" })
  .pipe(Args.withDescription("Video file with source subtitles."));

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
});

export const extractSubtitlesCommand = Command.make("extract-subtitles").pipe(
  Command.withSubcommands([showSubtitleTracksCommand]),
);
