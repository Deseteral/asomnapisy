import { Command, Args, Options } from "@effect/cli";
import { Effect } from "effect";
import { BunRuntime, BunContext } from "@effect/platform-bun";
import { translateMovieLineByLine } from "./translation-modes/translation-mode-line-by-line";

// Common params.
const input = Args.file({ name: "sourceSubtitles", exists: "yes" });
const sourceLanguage = Options.text("sourceLanguage").pipe(Options.withDefault("english"));
const targetLanguage = Options.text("targetLanguage");
const concurrency = Options.integer("concurrency").pipe(Options.withDefault(1));

// line-by-line specific params.
const lineByLineSurroundingContextLength = Options.integer("surroundingContextLength").pipe(
  Options.withDefault(5),
); // TODO: Add range.

const translateMovieLineByLineCommand = Command.make(
  "line-by-line",
  { input, sourceLanguage, targetLanguage, lineByLineSurroundingContextLength, concurrency },
  () => translateMovieLineByLine(),
);

const command = Command.make("asomnapisy").pipe(
  Command.withSubcommands([
    Command.make("translate-movie").pipe(
      Command.withDescription("Translate movie subtitles."),
      Command.withSubcommands([translateMovieLineByLineCommand]),
    ),
  ]),
);

const cli = Command.run(command, {
  name: "asomnapisy",
  version: "v1.0.0",
});

cli(process.argv).pipe(Effect.provide(BunContext.layer), BunRuntime.runMain);
