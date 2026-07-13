// Probe output contract: report lines to stdout via `print`; the LAST line is a stable
// `RESULT <tool> key=value …` machine line (`tail -1` / `grep ^RESULT`). Exit code carries
// the verdict and is the CALLER's to compute — _kit only prints; a skipped capability is
// reported in the RESULT line but is not a failure.
import process from "node:process";

export function print(s: string): void {
  process.stdout.write(`${s}\n`);
}

export type ResultPair = readonly [key: string, value: string | number];

/** Print the blank separator + the final `RESULT <tool> k=v …` machine line (pairs in order). */
export function printResult(tool: string, pairs: readonly ResultPair[]): void {
  const kv = pairs.map(([k, v]) => `${k}=${v}`).join(" ");
  print("");
  print(`RESULT ${tool} ${kv}`);
}
