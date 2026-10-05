// The databank multipart upload POST — the ONE client seam a caller reaches for to ingest a picked file
// as a source document (bytes → CAS → extract → chunk → embed). Raw fetch, not tRPC — the route is a Hono
// multipart handler (`POST /api/databank/upload`, entry/http/upload.ts). Mirrors `upload-asset.ts`: the
// `file`+`name` FormData body, the CSRF header every mutation carries, and a validated response. The
// server's `UploadResult` is domain-internal (not a wire schema), so the load-bearing half — the returned
// `DocumentView` — is validated here at the boundary against the exported `documentViewSchema` (the
// `storedAssetSchema` posture).
//
// SO ARE THE DISPOSITIONS (#1488). They used to ride as a typed PASS-THROUGH — a `as { outcome: … }`
// assertion read straight off the parsed JSON, which is a claim about the body rather than a check of it. A
// 2xx says the upload succeeded, not that the body is the shape it promised, so a version skew or a proxy's
// own JSON could drive the caller's created-vs-duplicate UI off a value nothing validated. All three closed
// vocabularies are now checked against the tuples they are typed from.
//
// PORTED from `legacy-main:packages/client/src/data/upload-document.ts`. The one
// named edit is at the CALLER: the client-side size pre-check derives from `useUploadCaps().databankUpload`,
// never legacy's hardcoded 20 MiB literal (§2.2).

import type { DocumentDestination, UploadResult } from "@orb/contracts/databank";
import { DOCUMENT_DESTINATION_FORM_FIELD, uploadResultSchema } from "@orb/contracts/databank";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { throwHttpError } from "./http-error.ts";

const UPLOAD_URL = "/api/databank/upload";
const UPLOAD_FIELD = "file";
const NAME_FIELD = "name";

/** The canonical validated producer response, including a saved but not queued document. */
export type { UploadResult as UploadDocumentResult } from "@orb/contracts/databank";

/** POST a picked `File` to the databank upload route; validate the returned `document` against
 *  {@link documentViewSchema} and its dispositions against their own vocabularies (never bare-cast). Throws
 *  on a non-OK response, a malformed document, or an unknown disposition — the
 *  caller (an upload component/mutation) owns the try/catch + loading-state UI (the `FileDropzone`
 *  `loading`/`success` contract, `@orb/ui`). `name` defaults to the file's own name server-side when omitted. */
export async function uploadDocument(file: File, name?: string, destination?: DocumentDestination): Promise<UploadResult> {
  const form = new FormData();
  form.set(UPLOAD_FIELD, file);
  if (destination !== undefined) {
    form.set(DOCUMENT_DESTINATION_FORM_FIELD, JSON.stringify(destination));
  }
  if (name !== undefined && name.length > 0) {
    form.set(NAME_FIELD, name);
  }
  const response = await fetch(UPLOAD_URL, {
    method: "POST",
    body: form,
    headers: { [CSRF_HEADER]: "1" },
  });
  if (!response.ok) {
    await throwHttpError("uploadDocument", response);
  }
  return uploadResultSchema.parse(await response.json());
}
