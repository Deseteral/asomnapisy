import { Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { BunRuntime, BunContext } from "@effect/platform-bun";

const command = Command.make("hello-world", {}, () => Console.log("Hello World"));

const cli = Command.run(command, {
  name: "asomnapisy",
  version: "v1.0.0",
});

cli(process.argv).pipe(Effect.provide(BunContext.layer), BunRuntime.runMain);
