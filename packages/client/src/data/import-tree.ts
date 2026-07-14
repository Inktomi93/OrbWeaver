// The folder-import POST — the Backup & Restore pane's directory seam. Raw fetch (a Hono multipart handler,
// not tRPC): each picked file rides the repeated `file` field, its `webkitRelativePath` carried AS the part
// filename so the server can reconstruct the tree. Workload-backed like the .zip path: the route stages the
// batch + starts a per-owner import workload, replying `202 { workloadId }`; progress streams over the same
// workloads.subscribe machinery. A non-OK response (whole-batch rejection) throws with the server's message.

import { CSRF_HEADER } from "@orb/contracts/identity";
import { throwHttpError } from "./http-error";

const TREE_URL = "/api/import/tree";
const TREE_FIELD = "file";

/** The `202` accept body: the id of the enqueued import workload to subscribe for progress + the result. */
export interface TreeImportStarted {
  readonly workloadId: string;
}

/** `webkitRelativePath` is present on a directory-picked File in the browser, but the DOM lib that declares
 *  it isn't in every tsconfig's `lib` (the whole-graph typecheck compiles under Node's `File`). */
interface WithRelativePath {
  readonly webkitRelativePath?: string;
}

/** The browser's directory-relative path for a picked file (`characters/Aria.png`), or its bare name. */
export function relativePathOf(file: File): string {
  const rel = (file as File & WithRelativePath).webkitRelativePath;
  return rel !== undefined && rel.length > 0 ? rel : file.name;
}

/** POST a picked folder's files (each carrying its `webkitRelativePath`) to the tree-import route; resolve the
 *  enqueued workload id. Throws on a non-OK response (400 = unrecognized/invalid layout or a rejected path;
 *  409 = an import is already running; 413 = too large; 401/403 = auth/CSRF) with the server's `{ error }`. */
export async function importTree(files: readonly File[]): Promise<TreeImportStarted> {
  const form = new FormData();
  for (const file of files) {
    // The 3rd arg overrides the part filename with the browser's relative path (`characters/Aria.png`).
    form.append(TREE_FIELD, file, relativePathOf(file));
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
