// Preloaded by `scripts/eslint-parts.ts` into every process of an ESLint part: the process writes its own peak resident
// memory, in KiB, to a file named for its pid in the directory its preload URL names, so the runner can hold each part
// to the memory bar. It writes on an interval as well as at exit, because a heap abort or an out-of-memory kill skips
// the exit handler, and the last sample is then the only peak the runner can report.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { ESLINT_PEAK_DIR_PARAM } from "./eslint-parts.ts";

const SAMPLE_INTERVAL_MS = 1000;

const dir = new URL(import.meta.url).searchParams.get(ESLINT_PEAK_DIR_PARAM);
if (dir !== null) {
  const file = join(dir, String(process.pid));
  const sample = (): void => writeFileSync(file, String(process.resourceUsage().maxRSS));
  setInterval(sample, SAMPLE_INTERVAL_MS).unref();
  process.on("exit", sample);
}
