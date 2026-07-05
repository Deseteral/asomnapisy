import { rm } from "node:fs/promises";

const supportedTargets = [
  'linux-x64',
  'darwin-arm64',
] as const;

await rm("./build", { recursive: true, force: true });

for (const target of supportedTargets) {
  await Bun.build({
    entrypoints: ["./src/main.ts"],
    compile: {
      target: `bun-${target}`,
      outfile: `./build/${target}/asomnapisy`
    },
  });
}
