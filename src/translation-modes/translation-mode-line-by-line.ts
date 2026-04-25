import { Console, Effect } from "effect";

export function translateMovieLineByLine(): Effect.Effect<void> {
  return Console.log("Hello World");
}
