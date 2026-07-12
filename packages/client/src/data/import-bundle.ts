// data/import-bundle — the portability bundle-import POST (entry/http/import.ts, `POST /api/import/bundle`),
// the Backup & Restore pane's zip-import seam. Raw `fetch`, not tRPC — a Hono raw-body handler, the same
// reason `importCharacters` / `uploadAsset` are raw POSTs. The whole zip rides as the request BODY (the
// server reads `c.req.raw.body` directly — NOT multipart form-data), so the `File` streams straight up.
//
// WORKLOAD-BACKED: the route stages the upload to disk and enqueues a SINGULAR per-owner `import-bundle`
// workload, replying `202 { workloadId }`. Progress + the terminal summary stream over the EXISTING
// workloads status machinery (`workloads.subscribe`) — the caller subscribes to that id (the Workloads
// pane's same seam). A second concurrent import for one owner is a 409 (the single-active lock); an
// oversize upload a 413. Every non-OK response throws — the caller's dropzone owns the error/loading UI.
//
// CSRF: sends the same `CSRF_HEADER` every tRPC mutation carries (the cookie-session belt; parity with
// `importCharacters` / `uploadAsset`).

import { CSRF_HEADER } from "@orb/contracts/identity";
import { throwHttpError } from "./http-error";

const BUNDLE_URL = "/api/import/bundle";
const ZIP_MIME = "application/zip";

/** The `202` accept body: the id of the enqueued import workload to subscribe for progress + the result. */
export interface BundleImportStarted {
  readonly workloadId: string;
}

/** POST a portability zip as the raw request body; resolve the enqueued workload id. Throws on a non-OK
 *  response (409 = an import is already running; 413 = oversize; 400 = a malformed/hostile archive; 401/403
 *  = auth/CSRF) with the server's `{ error }` message. */
export async function importBundle(file: File): Promise<BundleImportStarted> {
  const response = await fetch(BUNDLE_URL, {
    method: "POST",
    body: file,
    headers: { [CSRF_HEADER]: "1", "Content-Type": ZIP_MIME },
  });
  if (!response.ok) {
    await throwHttpError("importBundle", response);
  }
  return (await response.json()) as BundleImportStarted;
}
