// data/import-tree — the folder-import POST helper. Raw fetch (a Hono multipart handler, not tRPC): each
// picked file rides the repeated `file` field, its `webkitRelativePath` carried AS the part filename so the
// server can reconstruct the tree. Workload-backed: the route stages the batch + starts a per-owner import
// workload, replying `202 { workloadId }`; progress streams over the same workloads.subscribe machinery.
// What a picked folder sends, skips and splits is decided before any request by `./import-tree-plan.ts`;
// `secrets.json` is dropped here too, whatever the caller planned.

import { CSRF_HEADER } from "@orb/contracts/identity";
import type { ImportStarted, PersonaCollision, PersonaCollisionChoices, TreeLayoutDeclaration } from "@orb/contracts/import";
import {
  encodePersonaCollisionChoices,
  importStartedSchema,
  isStSecretsFile,
  PERSONA_COLLISION_FIELD,
  personaCollisionReviewSchema,
  ST_SETTINGS_FILE,
  TREE_FILE_FIELD,
  TREE_LAYOUT_FIELD,
} from "@orb/contracts/import";
import { throwHttpError } from "./http-error.ts";

const TREE_URL = "/api/import/tree";

/** The `202` accept body: the id of the enqueued import workload to subscribe for progress + the result. */
export type TreeImportStarted = ImportStarted;

/** `webkitRelativePath` is present on a directory-picked File in a real browser, but it's a non-standard
 *  Chromium extension the DOM lib types as always-`string` — jsdom (and any spec-faithful `File`) doesn't
 *  implement it at all, so it's genuinely `undefined` at runtime despite the type. Read it through
 *  `unknown` so TS can't "prove" the always-present lie away. */
interface WithRelativePath {
  readonly webkitRelativePath?: string;
}

/** The browser's directory-relative path for a picked file (`characters/Aria.png`), or its bare name. */
export function relativePathOf(file: File): string {
  const rel = (file as unknown as WithRelativePath).webkitRelativePath;
  return rel !== undefined && rel.length > 0 ? rel : file.name;
}

/** POST one upload's files (each carrying its `webkitRelativePath`) to the tree-import route; resolve the
 *  enqueued workload id. Throws on a non-OK response (400 = unrecognized/invalid layout or a rejected path;
 *  409 = an import is already running; 413 = too large; 401/403 = auth/CSRF) with the server's `{ error }`.
 *  A `secrets.json` is dropped here whatever the caller planned — API keys never leave the browser. `layout`
 *  is the plan's declaration for one upload of a split native folder. */
export async function importTree(
  files: readonly File[],
  personaCollisions: PersonaCollisionChoices = {},
  layout: TreeLayoutDeclaration | null = null,
): Promise<TreeImportStarted> {
  const form = new FormData();
  for (const file of files) {
    const relPath = relativePathOf(file);
    if (isStSecretsFile(relPath)) {
      continue;
    }
    // The 3rd arg overrides the part filename with the browser's relative path (`characters/Aria.png`).
    form.append(TREE_FILE_FIELD, file, relPath);
  }
  for (const choice of encodePersonaCollisionChoices(personaCollisions)) {
    form.append(PERSONA_COLLISION_FIELD, choice);
  }
  if (layout !== null) {
    form.append(TREE_LAYOUT_FIELD, layout);
  }
  const response = await fetch(TREE_URL, {
    method: "POST",
    body: form,
    headers: { [CSRF_HEADER]: "1" },
  });
  if (!response.ok) {
    await throwHttpError("importTree", response);
  }
  return importStartedSchema.parse(await response.json());
}

const REVIEW_URL = "/api/import/tree/review";
const AVATARS_DIR_SEGMENT = "User Avatars";

/** The files the persona review reads: every profile's `settings.json` and its `User Avatars/` art. */
function isReviewFile(relPath: string): boolean {
  return relPath.split("/").at(-1) === ST_SETTINGS_FILE || relPath.split("/").includes(AVATARS_DIR_SEGMENT);
}

/** Ask the server which personas in the picked folder share a name with one you already own but differ in
 *  content. Read-only: nothing is staged. A folder with no `settings.json` has nothing to ask and makes no
 *  request. */
export async function reviewTreePersonas(files: readonly File[]): Promise<readonly PersonaCollision[]> {
  const reviewed = files.filter((file) => isReviewFile(relativePathOf(file)));
  if (!reviewed.some((file) => relativePathOf(file).split("/").at(-1) === ST_SETTINGS_FILE)) {
    return [];
  }
  const form = new FormData();
  for (const file of reviewed) {
    form.append(TREE_FILE_FIELD, file, relativePathOf(file));
  }
  const response = await fetch(REVIEW_URL, { method: "POST", body: form, headers: { [CSRF_HEADER]: "1" } });
  if (!response.ok) {
    await throwHttpError("reviewTreePersonas", response);
  }
  return personaCollisionReviewSchema.parse(await response.json()).collisions;
}
