// data/import-tree-served — a picked folder's plan under the caps the server serves. The served tree total
// limits each upload's whole multipart body, while the planner packs file bytes, so the framing comes off first.

import { treeUploadFramingBytes } from "@orb/contracts/import";
import { relativePathOf } from "./import-tree.ts";
import type { TreeImportCaps, TreeImportPlan } from "./import-tree-plan.ts";
import { planTreeImport } from "./import-tree-plan.ts";

/** Plan a picked folder against the served caps; `personaCollisionKeys` are the collisions each upload answers. */
export function planServedTreeImport(files: readonly File[], served: TreeImportCaps, personaCollisionKeys: readonly string[]): Promise<TreeImportPlan> {
  const parts = files.map((file) => ({ path: relativePathOf(file), type: file.type }));
  const framing = treeUploadFramingBytes(parts, served.files, personaCollisionKeys);
  return planTreeImport(files, { ...served, totalBytes: served.totalBytes - framing });
}
