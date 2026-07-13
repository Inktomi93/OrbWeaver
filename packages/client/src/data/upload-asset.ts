// The multipart upload POST — the ONE client seam a caller reaches for to persist a picked file as a
// content-addressed asset (avatars/personas/backgrounds all route through this). Raw fetch, not tRPC —
// the route is a Hono multipart handler. NOTE: the route does not currently enforce the CSRF header
// this sends (auth-gated only) — server-side gating is out of this file's scope.

import type { AssetKind, StoredAsset } from "@orb/contracts/assets";
import { storedAssetSchema } from "@orb/contracts/assets";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { throwHttpError } from "./http-error";

const UPLOAD_URL = "/api/assets/upload";
const UPLOAD_FIELD = "file";
const KIND_FIELD = "kind";

/** POST a picked `File` to the asset-upload route, parse + validate the response against
 *  {@link storedAssetSchema}. Throws on a non-OK response or a malformed body — the caller (an upload
 *  component/mutation) owns the try/catch + loading-state UI (the `FileDropzone` `loading`/`success`
 *  8-state contract, `@orb/ui`). */
export async function uploadAsset(file: File, kind: AssetKind): Promise<StoredAsset> {
  const form = new FormData();
  form.set(UPLOAD_FIELD, file);
  form.set(KIND_FIELD, kind);
  const response = await fetch(UPLOAD_URL, {
    method: "POST",
    body: form,
    headers: { [CSRF_HEADER]: "1" },
  });
  if (!response.ok) {
    await throwHttpError("uploadAsset", response);
  }
  return storedAssetSchema.parse(await response.json());
}
