// infra/storage/curated-pose-reader — read one SHIPPED curated pose skeleton's BYTES by its library id
// (comfyui-control §4.12, C6d). Curated poses are GLOBAL shipped-static app content (NOT per-user CAS — the
// C6b ruling; seeding 669 rows into every user is the D20/D23 doubling), served by the client dist and read
// here off disk for the ComfyUI arm's `edit.poseControl` control map. A SEALED filesystem adapter (node:* +
// @orb/contracts only, NEVER @orb/db / a domain) constructed at `entry/` and injected into `domain/imagery`
// as the `readCuratedPose` port. PATH-CONFINED: the id resolves through the FROZEN generated index (an unknown
// id ⇒ null), AND the joined path is asserted within the pose-library root — defense-in-depth, a path-ish key
// never reads outside the shipped set (`O_NOFOLLOW`, matching the stage-dir/zip staging readers).

import { constants as fsConstants } from "node:fs";
import { open } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { resolveCuratedPose } from "@orb/contracts/poses";

/** The public-URL prefix every curated `thumbnailSrc` carries (`/poses/library/<cat>/<name>.png`), stripped to
 *  the on-disk relpath under the pose-library ROOT (which itself ends in `.../poses/library`). */
const THUMBNAIL_PREFIX = "/poses/library/";

/** The `readCuratedPose` port: a curated pose ref → its shipped skeleton bytes, or `null` (unknown/removed
 *  ref, an escaping path, or a missing file — every non-read degrades honestly to a dropped pose). File-local:
 *  the canonical port shape is homed inline on `ImageryServiceContext.readCuratedPose` (contract/service.ts). */
type CuratedPoseReader = (poseRef: string) => Promise<Uint8Array | null>;

/** Resolve `rel` under `root`, or `null` when it would escape (`..`/absolute) — the confinement gate (a read
 *  can NEVER land outside the pose-library root). Exported for a direct unit test of the escape refusal. */
export function confinePosePath(root: string, rel: string): string | null {
  const rootResolved = resolve(root);
  const abs = resolve(rootResolved, rel);
  return abs === rootResolved || abs.startsWith(`${rootResolved}${sep}`) ? abs : null;
}

/** Build the curated-pose byte reader over the shipped pose-library `root` (the `.../poses/library` dir under
 *  the client-static root the SPA serves). `null` for an unknown/removed id (not in the frozen index), an
 *  escaping path (confinement), or a missing file (a partial dist / dev without the set — an honest degrade). */
export function createCuratedPoseReader(root: string): CuratedPoseReader {
  return async (poseId) => {
    const pose = resolveCuratedPose(poseId);
    if (pose === undefined || !pose.thumbnailSrc.startsWith(THUMBNAIL_PREFIX)) {
      return null;
    }
    const abs = confinePosePath(root, pose.thumbnailSrc.slice(THUMBNAIL_PREFIX.length));
    if (abs === null) {
      return null;
    }
    try {
      // biome-ignore lint/suspicious/noBitwiseOperators: OR-ing POSIX open() flag bits is the intended API (the stage-dir/zip staging readers carry the same exemption).
      const handle = await open(abs, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
      try {
        const data = await handle.readFile();
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      } finally {
        await handle.close();
      }
    } catch {
      return null;
    }
  };
}
