// The multipart upload POST — the ONE client seam a caller reaches for to persist a picked file as a
// content-addressed asset (avatars/personas/backgrounds all route through this). Raw fetch, not tRPC —
// the route is a Hono multipart handler, and it refuses a request without the CSRF header on every auth path.

import type { AssetKind, AssetUploadRefusal, AssetUploadRefusalCode, StoredAsset } from "@orb/contracts/assets";
import { assetUploadRefusalSchema, storedAssetSchema } from "@orb/contracts/assets";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { UPLOAD_FILE_FIELD } from "@orb/contracts/uploads";
import { parseJsonText } from "@orb/kit/json";
import { HttpError, isHttpFailure, throwHttpError } from "./http-error.ts";

const UPLOAD_URL = "/api/assets/upload";
const KIND_FIELD = "kind";
const PAYLOAD_TOO_LARGE = 413;
const UNSUPPORTED_MEDIA_TYPE = 415;
/** The statuses the route answers a person-fixable refusal with (over the cap, wrong contents). */
const REFUSAL_STATUSES: ReadonlySet<number> = new Set([PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE]);

/** The server refused the file for a reason the person can act on. `sentence` is the server's own clause; `reason` is the
 *  refusal's code (`null` when the server sent none), which a caller keys its words on. */
export class UploadRefusedError extends Error {
  public readonly sentence: string;
  public readonly reason: AssetUploadRefusalCode | null;
  constructor(refusal: AssetUploadRefusal) {
    super(`uploadAsset: refused — ${refusal.error}`);
    this.sentence = refusal.error;
    this.reason = refusal.reason ?? null;
    this.name = this.constructor.name;
  }
}

/** Whether an upload failed as a request (the network, a refusal, or a non-OK or malformed answer) rather than as a
 *  fault in the caller's own code. */
export function isUploadFailure(error: unknown): boolean {
  return error instanceof UploadRefusedError || isHttpFailure(error);
}

/** POST a picked `File` to the asset-upload route, parse + validate the response against
 *  {@link storedAssetSchema}. Throws {@link UploadRefusedError} for a refusal carrying a reason, else an
 *  {@link HttpError} on a non-OK response or a malformed body — the caller (an upload component/mutation) owns the
 *  try/catch + loading-state UI (the `FileDropzone` `loading`/`success` 8-state contract, `@orb/ui`). */
export async function uploadAsset(file: File, kind: AssetKind): Promise<StoredAsset> {
  const form = new FormData();
  form.set(UPLOAD_FILE_FIELD, file);
  form.set(KIND_FIELD, kind);
  const response = await fetch(UPLOAD_URL, {
    method: "POST",
    body: form,
    headers: { [CSRF_HEADER]: "1" },
  });
  if (REFUSAL_STATUSES.has(response.status)) {
    // A refusal body that is not JSON leaves `refusal.success` false, and 413/415 are never `response.ok`, so the
    // status-line `throwHttpError` below always throws.
    const refusal = assetUploadRefusalSchema.safeParse(parseJsonText(await response.clone().text()));
    if (refusal.success) {
      throw new UploadRefusedError(refusal.data);
    }
  }
  if (!response.ok) {
    await throwHttpError("uploadAsset", response);
  }
  const stored = storedAssetSchema.safeParse(parseJsonText(await response.text()));
  if (!stored.success) {
    throw new HttpError("uploadAsset: the answer was not a stored asset", response.status);
  }
  return stored.data;
}
