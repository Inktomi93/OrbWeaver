// The portability bundle-import POST — the Backup & Restore pane's zip-import seam. Raw fetch, not
// tRPC — a Hono raw-body handler; the whole zip rides as the request body (not multipart). Workload-
// backed: the route stages the upload and enqueues a per-owner import-bundle workload, replying
// `202 { workloadId }`; progress streams over the existing workloads live-tail machinery (the `workloads`
// room on the tab's one socket). A second
// concurrent import for one owner is a 409; an oversize upload a 413.

import { CSRF_HEADER } from "@orb/contracts/identity";
import type { WorkloadId } from "@orb/kit/ids";
import { throwHttpError } from "./http-error.ts";

const BUNDLE_URL = "/api/import/bundle";
const ZIP_MIME = "application/zip";

/** The `202` accept body: the id of the enqueued import workload to subscribe for progress + the result. */
export interface BundleImportStarted {
  readonly workloadId: WorkloadId;
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
