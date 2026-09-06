// Crash safety for a tool that writes a MUTATED body into a real tracked source file.
//
// `finally` covers a throw and a normal exit. It does NOT cover SIGKILL, an OOM kill, a power loss, or
// (by default) Ctrl-C — and any of those strands a plausible-looking logic mutation in a file nobody is
// reviewing. This repo has already shipped one instrument edit by accident; a stranded mutant is the same
// failure with worse camouflage, because the file still compiles and still passes most of its suite.
//
// Two layers: a marker file written BEFORE the first plant carrying the pristine body (survives any kill,
// so the next run can heal), and signal handlers that restore on the kills a process can actually catch.
//
// CONTAINMENT (#1509 item 1). The marker is an on-disk JSON file that survives a crash, so by the time it
// is read back it is UNTRUSTED input: a corrupted or tampered `sourceRel` aimed a crash-recovery WRITE
// anywhere reachable through `../`. Every write here — heal and armed restore alike — goes through
// `containedTarget`, which refuses loudly instead of writing. A lexical `startsWith` is NOT containment
// (the standing lesson from the import-staging boundary): both ends are realpathed, so a symlinked
// component cannot smuggle the write out of the root either.
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import process from "node:process";

const MARKER = ".mutation-probe-active.json";

interface Marker {
  readonly sourceRel: string;
  readonly pristine: string;
}

function markerPath(root: string): string {
  return join(root, MARKER);
}

function refuse(sourceRel: string, why: string): never {
  throw new Error(
    `MUTATION-PROBE REFUSED: recovery target ${JSON.stringify(sourceRel)} ${why} — nothing was written; delete ${MARKER} and restore the source from git`,
  );
}

/** The ONE write door for every restore path. Returns the absolute path only when it is an existing file
 *  that resolves INSIDE the real root; anything else is a loud refusal, never a write. */
function containedTarget(root: string, sourceRel: string): string {
  if (sourceRel === "" || isAbsolute(sourceRel)) {
    refuse(sourceRel, "is not a repo-relative path");
  }
  const realRoot = realpathSync(root);
  const target = resolve(realRoot, sourceRel);
  if (!target.startsWith(realRoot + sep)) {
    refuse(sourceRel, `escapes the probe root ${JSON.stringify(realRoot)}`);
  }
  if (!existsSync(target)) {
    refuse(sourceRel, "does not exist under the probe root");
  }
  // Realpath BOTH ends: a symlinked component INSIDE the root still points out of it, and a lexical
  // prefix check cannot see that.
  if (realpathSync(target) !== target) {
    refuse(sourceRel, "resolves through a symlink to another location");
  }
  return target;
}

/** The marker is post-crash disk state, so its shape is asserted rather than asserted-by-cast. */
function readMarker(path: string): Marker {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`MUTATION-PROBE REFUSED: ${MARKER} is not an object — delete it and restore the source from git`);
  }
  const sourceRel = Reflect.get(parsed, "sourceRel");
  const pristine = Reflect.get(parsed, "pristine");
  if (typeof sourceRel !== "string" || typeof pristine !== "string") {
    throw new Error(`MUTATION-PROBE REFUSED: ${MARKER} carries no usable sourceRel/pristine pair — delete it and restore the source from git`);
  }
  return { sourceRel, pristine };
}

/** Restores any mutation stranded by a previous run. Returns the healed path, or undefined if clean. */
export function healStranded(root: string): string | undefined {
  const path = markerPath(root);
  if (!existsSync(path)) {
    return;
  }
  const marker = readMarker(path);
  writeFileSync(containedTarget(root, marker.sourceRel), marker.pristine);
  rmSync(path, { force: true });
  return marker.sourceRel;
}

export interface StrandGuard {
  /** Clears the marker and detaches the signal handlers. Safe to call twice. */
  readonly release: () => void;
}

/** Arms crash recovery for one probe run. Call BEFORE the first plant. */
export function armStrandGuard(root: string, sourceRel: string, pristine: string): StrandGuard {
  // Prove the restore target is contained BEFORE the marker exists: a marker naming a path this run could
  // never legally restore is a stranding waiting to happen.
  const sourceAbs = containedTarget(root, sourceRel);
  const path = markerPath(root);
  writeFileSync(path, JSON.stringify({ sourceRel, pristine } satisfies Marker));

  let released = false;
  const restore = (): void => {
    if (released) {
      return;
    }
    released = true;
    writeFileSync(sourceAbs, pristine);
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
