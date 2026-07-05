import { rm } from "node:fs/promises";
import { $ } from "bun";

const supportedTargets = [
  "linux-x64",
  "darwin-arm64",
] as const;

await rm("./build", { recursive: true, force: true });

for (const target of supportedTargets) {
  const outfileDirectory = `./build/${target}`;
  const zipfile = `./build/asomnapisy-${target}.zip`;

  await Bun.build({
    entrypoints: ["./src/main.ts"],
    compile: {
      target: `bun-${target}`,
      outfile: `${outfileDirectory}/asomnapisy`,
    },
  });

  await $`zip -j ${zipfile} ${outfileDirectory}/*`;
}
