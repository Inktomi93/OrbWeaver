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
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

function walk(path: string, accept: (path: string) => boolean, into: SourceEntry[]): void {
  // `Dirent<string>`, not `ReturnType<typeof readdirSync>`: that alias resolves to the BUFFER overload
  // (`Dirent<NonSharedBuffer>`) under node's current typings, and `entry.name` then isn't a string.
  let entries: Dirent<string>[];
  try {
    entries = readdirSync(path, { withFileTypes: true });
  } catch {
    // Not a directory (or unreadable): treat it as a leaf, which is how a caller passes a single file.
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
 *  Unreadable paths are skipped rather than thrown — a launcher probe must never die on a permissions blip.
 * @public Test-anchored module surface; focused tests pin this production-local behavior. */
export function newestSourceEntries(roots: readonly string[], accept: (path: string) => boolean = () => true): SourceEntry[] {
  const found: SourceEntry[] = [];
  for (const root of roots) {
    walk(root, accept, found);
  }
  return found.sort((a, b) => b.mtimeMs - a.mtimeMs);
}
