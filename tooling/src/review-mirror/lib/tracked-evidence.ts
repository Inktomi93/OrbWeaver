// The tracked-findings deposit for #770: a milestone run keeps its bulky comment-stripped mirror in the
// external throwaway target, but when the caller names `--evidence-out` it also drops the small evidence JSON
// at an in-repo path so the sweep's findings survive as a durable, board-linkable artifact instead of a lost
// ~/Documents run. This is a plain opt-in write — nothing standing, nothing scheduled (D62).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

/** Resolve `evidenceOut` against the repo root (a relative caller path lands in-repo), else honour an absolute path. */
export function resolveTrackedEvidencePath(root: string, evidenceOut: string | undefined): string | null {
  if (evidenceOut === undefined) {
    return null;
  }
  return isAbsolute(evidenceOut) ? evidenceOut : resolve(root, evidenceOut);
}

/** Write the already-serialized evidence to the resolved tracked path (creating parents), returning that path, or null when no deposit was requested. */
export function depositTrackedEvidence(root: string, evidenceOut: string | undefined, serialized: string): string | null {
  const path = resolveTrackedEvidencePath(root, evidenceOut);
  if (path === null) {
    return null;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serialized);
  return path;
}
