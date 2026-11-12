// Preloaded by `scripts/eslint-parts.ts` into every process of an ESLint part: at exit the process appends its own peak
// resident memory, in KiB, to the file its preload URL names, so the runner can hold each part to the memory bar.
import { appendFileSync } from "node:fs";
import process from "node:process";
import { ESLINT_PEAK_FILE_PARAM } from "./eslint-parts.ts";

const file = new URL(import.meta.url).searchParams.get(ESLINT_PEAK_FILE_PARAM);
if (file !== null) {
  process.on("exit", () => appendFileSync(file, `${process.resourceUsage().maxRSS}\n`));
}
