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

import type { DocumentView } from "@orb/contracts/databank";
import { documentViewSchema } from "@orb/contracts/databank";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { throwHttpError } from "./http-error.ts";

const UPLOAD_URL = "/api/databank/upload";
const UPLOAD_FIELD = "file";
const NAME_FIELD = "name";

/** The route's three closed vocabularies, spelled ONCE each: the tuple is what the response is CHECKED
 *  against and the interface below derives its member type from the same tuple, so the check and the type
 *  can never drift apart. */
const OUTCOMES = ["created", "duplicate"] as const;
const INGESTS = ["queued", "skipped"] as const;
const WARNINGS = ["empty-extraction"] as const;

/** The databank upload route's response — the producer verb's `UploadResult` shape: a created/duplicate
 *  `DocumentView` plus its ingest disposition (`queued` on a fresh upload, `skipped` on a dedup hit). */
export interface UploadDocumentResult {
  readonly document: DocumentView;
  readonly outcome: (typeof OUTCOMES)[number];
  readonly ingest: (typeof INGESTS)[number];
  readonly warning?: (typeof WARNINGS)[number];
}

/** The one member of `allowed` that `value` IS, or a throw naming the field. A 2xx is the server saying the
 *  upload SUCCEEDED, which says nothing about the body being the shape it promised — a version skew or a
 *  proxy's own JSON reaches here with a valid status, and an unchecked disposition then drives the caller's
 *  created-vs-duplicate UI off a value nothing validated. The `document` half has always been parsed; these
 *  three were read straight off the type assertion, which is a claim, not a check. */
function memberOf<T extends string>(field: string, value: unknown, allowed: readonly T[]): T {
  const member = allowed.find((candidate) => candidate === value);
  if (member === undefined) {
    throw new Error(`uploadDocument: response field "${field}" was not one of ${allowed.join(" | ")}`);
  }
  return member;
}

/** POST a picked `File` to the databank upload route; validate the returned `document` against
 *  {@link documentViewSchema} and its dispositions against their own vocabularies (never bare-cast). Throws
 *  on a non-OK response, a malformed document, or an unknown disposition — the
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
  const raw = (await response.json()) as { document: unknown; outcome: unknown; ingest: unknown; warning?: unknown };
  return {
    document: documentViewSchema.parse(raw.document),
    outcome: memberOf("outcome", raw.outcome, OUTCOMES),
    ingest: memberOf("ingest", raw.ingest, INGESTS),
    ...(raw.warning === undefined ? {} : { warning: memberOf("warning", raw.warning, WARNINGS) }),
  };
}
