// The probe output contract (shared by every scripts/probes/* tool, matching stack.sh):
//   • report lines go to stdout via `print` (never console.log — uniform, no inspector noise);
//   • the LAST stdout line is a stable machine line `RESULT <tool> key=value …` so agents
//     `tail -1` / `grep ^RESULT` and always land the verdict + artifact paths;
//   • the EXIT CODE carries the verdict: non-zero when anything observably went wrong
//     (nav error, page errors, failed requests, step failures, SSIM fail). The exit code is
//     the CALLER's to compute and return — _kit only prints; a skipped capability (e.g.
//     ffmpeg absent) is reported in the RESULT line but is NOT a failure.
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
