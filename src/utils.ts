import { Effect } from "effect";
import readline from "node:readline";

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// TODO: This could use Effect way of reading line.
export function terminalReadline(message: string): Effect.Effect<string> {
  return Effect.async<string>((resume) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(message, (answer) => {
      rl.close();
      resume(Effect.succeed(answer));
    });
  });
}

export function stringReplaceLast(str: string, search: string, replacement: string): string {
  const index = str.lastIndexOf(search);
  if (index === -1) return str;
  return str.slice(0, index) + replacement + str.slice(index + search.length);
}
