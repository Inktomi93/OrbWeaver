// The character-card import POST. Raw fetch, not tRPC — the route is a Hono multipart handler. Accepts
// one-or-many card files under the repeated `file` field. The route returns 200 for an accepted batch
// even when individual cards fail (per-card failures[] isolation), so this helper parses the real
// per-file outcome and hands it back — the summary must derive from that, never from the uploaded
// filenames. A non-200 (whole-batch rejection) throws.

import { CSRF_HEADER } from "@orb/contracts/identity";
import type { CardImportResult } from "@orb/contracts/import";
import { cardImportResultSchema } from "@orb/contracts/import";
import { throwHttpError } from "./http-error.ts";

const IMPORT_URL = "/api/import";
const IMPORT_FIELD = "file";

export type { CardImportResult } from "@orb/contracts/import";

/** POST picked card `File`s to the import route and return the server's real per-file result. Throws on a
 *  non-OK response (a whole-batch rejection). Per-card failures ride back in the 200 body's `failed[]` — the
 *  caller's dropzone owns the error/loading UI + the `character.list` invalidation on success. */
export async function importCharacters(files: readonly File[]): Promise<CardImportResult> {
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
    await throwHttpError("importCharacters", response);
  }
  return cardImportResultSchema.parse(await response.json());
}
