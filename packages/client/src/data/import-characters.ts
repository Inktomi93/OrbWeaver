// data/import-characters — the character-card import POST (`entry/http/upload.ts` `POST /api/import`), the
// client seam the LIST's "Import card" picker reaches for. Raw `fetch`, not tRPC — the route is a Hono
// multipart handler (the same reason `uploadAsset` is a raw POST). Accepts one-or-many card files (PNG/JSON)
// under the repeated `file` field. The caller owns the loading-state UI + the post-success list refresh
// (invalidate `character.pathFilter`) — this helper only performs the POST and throws on a non-OK response.
//
// CSRF: sends the same `CSRF_HEADER` every tRPC mutation carries (parity/defense-in-depth), matching
// `uploadAsset` (the route is auth-gated; header enforcement is a server concern out of this file's scope).

import { CSRF_HEADER } from "@orb/contracts/identity";

const IMPORT_URL = "/api/import";
const IMPORT_FIELD = "file";

/** POST picked card `File`s to the import route. Throws on a non-OK response (the caller's dropzone owns the
 *  error/loading UI + the `character.list` invalidation on success). The result body (a per-file import
 *  summary) is intentionally not parsed here — the list refreshes via invalidation, not the response. */
export async function importCharacters(files: readonly File[]): Promise<void> {
  const form = new FormData();
  for (const file of files) {
    form.append(IMPORT_FIELD, file);
  }
  const response = await fetch(IMPORT_URL, {
    method: "POST",
    body: form,
    headers: { [CSRF_HEADER]: "1" },
  });
  if (!response.ok) {
    throw new Error(`importCharacters: ${response.status} ${response.statusText}`);
  }
}
