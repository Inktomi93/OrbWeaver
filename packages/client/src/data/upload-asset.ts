// The multipart upload POST — the ONE client seam a caller reaches for to persist a picked file as a
// content-addressed asset (avatars/personas/backgrounds all route through this). Raw fetch, not tRPC —
// the route is a Hono multipart handler. NOTE: the route does not currently enforce the CSRF header
// this sends (auth-gated only) — server-side gating is out of this file's scope.

import type { AssetKind, StoredAsset } from "@orb/contracts/assets";
import { assetUploadRefusalSchema, storedAssetSchema } from "@orb/contracts/assets";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { throwHttpError } from "./http-error.ts";

const UPLOAD_URL = "/api/assets/upload";
const UPLOAD_FIELD = "file";
const KIND_FIELD = "kind";
const PAYLOAD_TOO_LARGE = 413;
const UNSUPPORTED_MEDIA_TYPE = 415;
/** The statuses the route answers a person-fixable refusal with (over the cap, wrong contents). */
const REFUSAL_STATUSES: ReadonlySet<number> = new Set([PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE]);

/** The server refused the file for a reason the person can act on; `reason` is the server's own sentence. */
export class UploadRefusedError extends Error {
  public readonly reason: string;
  constructor(reason: string) {
    super(`uploadAsset: refused — ${reason}`);
    this.reason = reason;
    this.name = this.constructor.name;
  }
}

/** POST a picked `File` to the asset-upload route, parse + validate the response against
 *  {@link storedAssetSchema}. Throws {@link UploadRefusedError} for a refusal carrying a reason, else a
 *  plain error on a non-OK response or a malformed body — the caller (an upload component/mutation) owns the
 *  try/catch + loading-state UI (the `FileDropzone` `loading`/`success` 8-state contract, `@orb/ui`). */
export async function uploadAsset(file: File, kind: AssetKind): Promise<StoredAsset> {
  const form = new FormData();
  form.set(UPLOAD_FIELD, file);
  form.set(KIND_FIELD, kind);
  const response = await fetch(UPLOAD_URL, {
    method: "POST",
    body: form,
    headers: { [CSRF_HEADER]: "1" },
  });
  if (REFUSAL_STATUSES.has(response.status)) {
    // @orb-waive caught-failure-ownership(json): a refusal body that is not JSON falls through to `throwHttpError` below, which throws with the status. Ends if that fallthrough is removed.
    const refusal = assetUploadRefusalSchema.safeParse(
      await response
        .clone()
        .json()
        .catch(() => null),
    );
    if (refusal.success) {
      throw new UploadRefusedError(refusal.data.error);
    }
  }
  if (!response.ok) {
    await throwHttpError("uploadAsset", response);
  }
  return storedAssetSchema.parse(await response.json());
}
