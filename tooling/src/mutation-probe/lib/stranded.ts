// Crash safety for a tool that writes a MUTATED body into a real tracked source file.
//
// `finally` covers a throw and a normal exit. It does NOT cover SIGKILL, an OOM kill, a power loss, or
// (by default) Ctrl-C — and any of those strands a plausible-looking logic mutation in a file nobody is
// reviewing. This repo has already shipped one instrument edit by accident; a stranded mutant is the same
// failure with worse camouflage, because the file still compiles and still passes most of its suite.
//
// Two layers: a marker file written BEFORE the first plant carrying the pristine body (survives any kill,
// so the next run can heal), and signal handlers that restore on the kills a process can actually catch.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const MARKER = ".mutation-probe-active.json";

interface Marker {
  readonly sourceRel: string;
  readonly pristine: string;
}

function markerPath(root: string): string {
  return join(root, MARKER);
}

/** Restores any mutation stranded by a previous run. Returns the healed path, or undefined if clean. */
export function healStranded(root: string): string | undefined {
  const path = markerPath(root);
  if (!existsSync(path)) {
    return;
  }
  const marker = JSON.parse(readFileSync(path, "utf8")) as Marker;
  writeFileSync(join(root, marker.sourceRel), marker.pristine);
  rmSync(path, { force: true });
  return marker.sourceRel;
}

export interface StrandGuard {
  /** Clears the marker and detaches the signal handlers. Safe to call twice. */
  readonly release: () => void;
}

/** Arms crash recovery for one probe run. Call BEFORE the first plant. */
export function armStrandGuard(root: string, sourceRel: string, pristine: string): StrandGuard {
  const path = markerPath(root);
  writeFileSync(path, JSON.stringify({ sourceRel, pristine } satisfies Marker));

  let released = false;
  const restore = (): void => {
    if (released) {
      return;
    }
    released = true;
    writeFileSync(join(root, sourceRel), pristine);
    rmSync(path, { force: true });
  };
  const onSignal = (signal: NodeJS.Signals): void => {
    restore();
    process.exitCode = 1;
    process.kill(process.pid, signal);
  };
  const signals: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
  for (const signal of signals) {
    process.once(signal, () => {
      process.removeAllListeners(signal);
      onSignal(signal);
    });
  }
  return {
    release: (): void => {
      restore();
      for (const signal of signals) {
        process.removeAllListeners(signal);
      }
    },
  };
}
