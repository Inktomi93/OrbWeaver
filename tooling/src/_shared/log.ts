// The stderr channel — stdout is reserved for tool PAYLOAD (artifacts.ts print/RESULT lines), so
// warnings/progress must never interleave with it (`tail -1` / `grep ^RESULT` parse stdout).
import process from "node:process";

export function warn(s: string): void {
  process.stderr.write(`${s}\n`);
}
