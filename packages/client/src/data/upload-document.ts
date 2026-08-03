// The databank multipart upload POST — the ONE client seam a caller reaches for to ingest a picked file
// as a source document (bytes → CAS → extract → chunk → embed). Raw fetch, not tRPC — the route is a Hono
// multipart handler (`POST /api/databank/upload`, entry/http/upload.ts). Mirrors `upload-asset.ts`: the
// `file`+`name` FormData body, the CSRF header every mutation carries, and a validated response. The
// server's `UploadResult` is domain-internal (not a wire schema), so the load-bearing half — the returned
// `DocumentView` — is validated here at the boundary against the exported `documentViewSchema` (the
// `storedAssetSchema` posture); the two tiny server-controlled enums (`outcome`/`ingest`) ride as typed
// pass-through (the `import-tree.ts` client-data response-type precedent).
//
// PORTED VERBATIM from `legacy-main:packages/client/src/data/upload-document.ts` (databank-surface-spec §4 —
// "it is already correct"). The one named edit is at the CALLER, not here: the client-side size pre-check
// derives from `useUploadCaps().databankUpload`, never legacy's hardcoded 20 MiB literal (§2.2).

import type { DocumentView } from "@orb/contracts/databank";
import { documentViewSchema } from "@orb/contracts/databank";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { throwHttpError } from "./http-error";

const UPLOAD_URL = "/api/databank/upload";
const UPLOAD_FIELD = "file";
const NAME_FIELD = "name";

/** The databank upload route's response — the producer verb's `UploadResult` shape: a created/duplicate
 *  `DocumentView` plus its ingest disposition (`queued` on a fresh upload, `skipped` on a dedup hit). */
export interface UploadDocumentResult {
  readonly document: DocumentView;
  readonly outcome: "created" | "duplicate";
  readonly ingest: "queued" | "skipped";
  readonly warning?: "empty-extraction";
}

/** POST a picked `File` to the databank upload route; validate the returned `document` against
 *  {@link documentViewSchema} (never bare-cast). Throws on a non-OK response or a malformed document — the
 *  caller (an upload component/mutation) owns the try/catch + loading-state UI (the `FileDropzone`
 *  `loading`/`success` contract, `@orb/ui`). `name` defaults to the file's own name server-side when omitted. */
export async function uploadDocument(file: File, name?: string): Promise<UploadDocumentResult> {
  const form = new FormData();
  form.set(UPLOAD_FIELD, file);
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
  const raw = (await response.json()) as {
    document: unknown;
    outcome: UploadDocumentResult["outcome"];
    ingest: UploadDocumentResult["ingest"];
    warning?: UploadDocumentResult["warning"];
  };
  return {
    document: documentViewSchema.parse(raw.document),
    outcome: raw.outcome,
    ingest: raw.ingest,
    ...(raw.warning === undefined ? {} : { warning: raw.warning }),
  };
}
