// The DIRECT-INVOCATION refusal (#509). An `ops/*.ts` module is a LIBRARY — the program is `cli.ts <verb>`
// (docs/law/Core-Tooling-Law.md §2.5: eleven pnpm rows point at the cli, nothing points into ops/). A
// module with no main that is RUN loads, executes nothing and exits 0 — a green that never ran a check, and
// docs/history/gate-authoring-legacy-2026-09-13.md §8 prescribed exactly that spelling for months. A bare zero must mean "I could not
// run", never "clean", so a module that finds itself as the process entry REFUSES and names the real door.
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { EXIT } from "./exit-contract.ts";

/** Real path, or the input verbatim when it does not resolve (a deleted or virtual `argv[1]`). */
function realOrSelf(path: string): string {
  // @orb-waive caught-failure-ownership(catch): a deleted or virtual argv[1] fails to resolve; the caller's own doc says exactly that case is expected, so falling back to the input verbatim is the correct optional-read-as-absent behavior, not a lost failure. Ends if a resolve failure here starts meaning something other than "no real path".
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * Call as the FIRST statement of a module that must never be a program. When the process was started ON
 * this module it writes the refusal to stderr and sets exit 2 (tool error — the run is NOT a verdict);
 * when the module was merely imported it does nothing at all.
 *
 * `realEntry` is the command the caller actually meant, printed verbatim so the refusal is a fix.
 *
 * It sets `process.exitCode` rather than calling `process.exit`: `run-tool.ts` owns the only hard exit in
 * the tree (policy `tooling-process-exit-home`), and a library module has no top-level work to abort —
 * evaluating its declarations and falling off the end IS the stop.
 */
export function refuseDirectInvocation(moduleUrl: string, realEntry: string): void {
  const entry = process.argv[1];
  if (entry === undefined) {
    return; // `node --eval`, a REPL, a worker with no script — nothing was invoked directly
  }
  const self = realOrSelf(fileURLToPath(moduleUrl));
  if (realOrSelf(resolve(entry)) !== self) {
    return; // imported by something else — the normal path
  }
  process.stderr.write(
    `TOOL ERROR (direct invocation): ${self} is a LIBRARY module — running it executes NOTHING and would exit 0 (a green that never ran). Run instead: ${realEntry}\n`,
  );
  process.exitCode = EXIT.toolError;
}
