// The one recursive "what changed last" walker the launcher's two freshness readers share: prod's
// client-bundle staleness (newest source mtime vs the built bundle) and dev's served-transform probe (the
// newest workspace module is the ONE a dead vite watcher would be serving stale). Two walkers would be
// exactly the drift those two stages exist to catch.

import type { Dirent } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface SourceEntry {
  readonly path: string;
  readonly mtimeMs: number;
}

function safeMtimeMs(path: string): number | null {
  // @orb-gate-ignore caught-failure-ownership(default:error): ENOENT means this source vanished during the walk; every unreadable/unmeasurable error propagates so null cannot fabricate freshness. Ends if another absence code is supported.
  try {
    return statSync(path).mtimeMs;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function walk(path: string, accept: (path: string) => boolean, into: SourceEntry[]): void {
  // `Dirent<string>`, not `ReturnType<typeof readdirSync>`: that alias resolves to the BUFFER overload
  // (`Dirent<NonSharedBuffer>`) under node's current typings, and `entry.name` then isn't a string.
  let entries: Dirent<string>[];
  // @orb-gate-ignore caught-failure-ownership(default:error): ENOTDIR is a single-file leaf and ENOENT is a vanished optional root; every unreadable directory error propagates. Ends if callers add another explicitly optional filesystem state.
  try {
    entries = readdirSync(path, { withFileTypes: true });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    if (code !== "ENOTDIR" && code !== "ENOENT") {
      throw error;
    }
    // Not a directory: treat it as a leaf, which is how a caller passes a single file. A missing optional
    // root contributes nothing; unreadable roots throw above so the freshness verdict cannot be fabricated.
    const mtimeMs = safeMtimeMs(path);
    if (mtimeMs !== null && accept(path)) {
      into.push({ path, mtimeMs });
    }
    return;
  }
  for (const entry of entries) {
    walk(join(path, entry.name), accept, into);
  }
}

/** Every accepted file under `roots` (files or directories), NEWEST FIRST. `accept` defaults to everything.
 *  Missing paths contribute nothing; unreadable paths throw because omission can fabricate a fresh verdict.
 * @public Test-anchored module surface; focused tests pin this production-local behavior. */
export function newestSourceEntries(roots: readonly string[], accept: (path: string) => boolean = () => true): SourceEntry[] {
  const found: SourceEntry[] = [];
  for (const root of roots) {
    walk(root, accept, found);
  }
  return found.sort((a, b) => b.mtimeMs - a.mtimeMs);
}
