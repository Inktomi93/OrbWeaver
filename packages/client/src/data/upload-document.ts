// The databank multipart upload POST — the ONE client seam a caller reaches for to ingest a picked file
// as a source document (bytes → CAS → extract → chunk → embed). Raw fetch, not tRPC — the route is a Hono
// multipart handler (`POST /api/databank/upload`, entry/http/upload.ts). Mirrors `upload-asset.ts`: the
// `file`+`name` FormData body, the CSRF header every mutation carries, and a validated response. The
// response is validated against the canonical contracts `uploadResultSchema`, including its document and
// dispositions, rather than trusting a successful HTTP status as proof of a usable body.
//
// SO ARE THE DISPOSITIONS (#1488). They used to ride as a typed PASS-THROUGH — a `as { outcome: … }`
// assertion read straight off the parsed JSON, which is a claim about the body rather than a check of it. A
// 2xx says the upload succeeded, not that the body is the shape it promised, so a version skew or a proxy's
// own JSON could drive the caller's created-vs-duplicate UI off a value nothing validated. All three closed
// vocabularies are now checked against the tuples they are typed from.
//
// The client-side size pre-check, at the CALLER, derives from `useUploadCaps().databankUpload`, never a
// hardcoded byte literal (§2.2).

import type { DocumentDestination, UploadResult } from "@orb/contracts/databank";
import { DOCUMENT_DESTINATION_FORM_FIELD, documentUploadRefusalSchema, uploadResultSchema } from "@orb/contracts/databank";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { DATABANK_UPLOAD_ROUTE } from "@orb/contracts/uploads";
import { throwHttpError } from "./http-error.ts";

const UPLOAD_FIELD = "file";
const NAME_FIELD = "name";

/** The server refused the document and said why in a body {@link documentUploadRefusalSchema} accepts. `reason` is the
 *  refusal's code (`null` when the server stated none): a caller keys its words on it, never on the server's sentence. */
export class DocumentUploadRefusedError extends Error {
  public readonly reason: string | null;
  public readonly status: number;
  constructor(refusal: { readonly error: string; readonly reason?: string | undefined }, status: number) {
    super(`uploadDocument: ${String(status)} — ${refusal.error}`);
    this.name = this.constructor.name;
    this.reason = refusal.reason ?? null;
    this.status = status;
  }
}

/** POST a picked `File` to the databank upload route; validate its full result against
 *  {@link uploadResultSchema} (never bare-cast). Throws {@link DocumentUploadRefusedError} for a refusal body
 *  the contract accepts, else
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
  const response = await fetch(DATABANK_UPLOAD_ROUTE, {
    method: "POST",
    body: form,
    headers: { [CSRF_HEADER]: "1" },
  });
  if (!response.ok) {
    // a body that is not JSON (the empty 413 a body-limit belt sends) leaves `refusal.success` false, and the line after it throws the status-line error. Ends if that throw stops following.
    const refusal = documentUploadRefusalSchema.safeParse(
      await response
        .clone()
        .json()
        .catch(() => null),
    );
    if (refusal.success) {
      throw new DocumentUploadRefusedError(refusal.data, response.status);
    }
    await throwHttpError("uploadDocument", response);
  }
  return uploadResultSchema.parse(await response.json());
}
