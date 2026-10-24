// data/import-tree-served — a picked folder's plan under the caps the server serves. The served tree total
// limits each upload's whole multipart body, while the planner packs file bytes, so every upload is charged its
// own framing: a fixed part once, and each file's part as the file joins it.

import type { PersonaCollision } from "@orb/contracts/import";
import { treeUploadFixedFramingBytes, treeUploadPartFramingBytes } from "@orb/contracts/import";
import { relativePathOf, reviewTreePersonas } from "./import-tree.ts";
import type { TreeImportCaps, TreeImportPlan } from "./import-tree-plan.ts";
import { plannedFiles, planTreeImport } from "./import-tree-plan.ts";

/** Plan a picked folder against the served caps; `personaCollisionKeys` are the collisions each upload answers. */
export function planServedTreeImport(files: readonly File[], served: TreeImportCaps, personaCollisionKeys: readonly string[]): Promise<TreeImportPlan> {
  return planTreeImport(files, served, {
    perUpload: treeUploadFixedFramingBytes(personaCollisionKeys),
    perFile: (file) => treeUploadPartFramingBytes({ path: relativePathOf(file), type: file.type }),
  });
}

/** A folder pick's preflight: the plan, the persona collisions the server reports for the files it would send,
 *  and, when there are any, the plan again with every upload carrying their answers. */
export async function planServedFolderImport(
  files: readonly File[],
  served: TreeImportCaps,
): Promise<{ readonly plan: TreeImportPlan; readonly collisions: readonly PersonaCollision[] }> {
  const reviewed = await planServedTreeImport(files, served, []);
  const collisions = await reviewTreePersonas(plannedFiles(reviewed));
  if (collisions.length === 0) {
    return { plan: reviewed, collisions };
  }
  return {
    plan: await planServedTreeImport(
      files,
      served,
      collisions.map((c) => c.key),
    ),
    collisions,
  };
}
