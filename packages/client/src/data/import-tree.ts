// data/import-tree — the folder-import POST helper. Raw fetch (a Hono multipart handler, not tRPC): each
// picked file rides the repeated `file` field, its `webkitRelativePath` carried AS the part filename so the
// server can reconstruct the tree. Workload-backed: the route stages the batch + starts a per-owner import
// workload, replying `202 { workloadId }`; progress streams over the same workloads.subscribe machinery.
// What a picked folder sends, skips and splits is decided before any request by `./import-tree-plan.ts`;
// `secrets.json` is dropped here too, whatever the caller planned.

import { CSRF_HEADER } from "@orb/contracts/identity";
import { isStSecretsFile } from "@orb/contracts/import";
import type { WorkloadId } from "@orb/kit/ids";
import { throwHttpError } from "./http-error.ts";

const TREE_URL = "/api/import/tree";
const TREE_FIELD = "file";

/** The `202` accept body: the id of the enqueued import workload to subscribe for progress + the result. */
export interface TreeImportStarted {
  readonly workloadId: WorkloadId;
}

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
 *  A `secrets.json` is dropped here whatever the caller planned — API keys never leave the browser. */
export async function importTree(files: readonly File[]): Promise<TreeImportStarted> {
  const form = new FormData();
  for (const file of files) {
    const relPath = relativePathOf(file);
    if (isStSecretsFile(relPath)) {
      continue;
    }
    // The 3rd arg overrides the part filename with the browser's relative path (`characters/Aria.png`).
    form.append(TREE_FIELD, file, relPath);
  }
  const response = await fetch(TREE_URL, {
    method: "POST",
    body: form,
    headers: { [CSRF_HEADER]: "1" },
  });
  if (!response.ok) {
    await throwHttpError("importTree", response);
  }
  return (await response.json()) as TreeImportStarted;
}
