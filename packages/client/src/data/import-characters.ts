// data/import-characters — the character-card import POST (`entry/http/upload.ts` `POST /api/import`), the
// client seam the LIST's "Import card" picker reaches for. Raw `fetch`, not tRPC — the route is a Hono
// multipart handler (the same reason `uploadAsset` is a raw POST). Accepts one-or-many card files (PNG/JSON)
// under the repeated `file` field. The caller owns the loading-state UI + the post-success list refresh
// (invalidate `character.pathFilter`).
//
// The route returns 200 for an ACCEPTED batch even when individual cards fail (per-card failures[] isolation —
// a garbage `.json` lands in `failed`, not a non-200), so this helper PARSES the real per-file outcome from
// the response body and hands it back. The summary must be built from THIS result, never from the uploaded
// filenames — a card the server put in `failed` is a failure, not a fabricated ✓. A non-200 (e.g. a whole
// batch rejected, or no files) throws.
//
// CSRF: sends the same `CSRF_HEADER` every tRPC mutation carries (parity/defense-in-depth), matching
// `uploadAsset` (the route is auth-gated; header enforcement is a server concern out of this file's scope).

import { CSRF_HEADER } from "@orb/contracts/identity";
import { throwHttpError } from "./http-error";

const IMPORT_URL = "/api/import";
const IMPORT_FIELD = "file";

/** One imported (or deduped) card from `POST /api/import`'s `ProfileImportResult` — `created:false` marks a
 *  byte-identical re-import (already present, no write). */
export interface ImportedCardResult {
  readonly filename: string | null;
  readonly created: boolean;
}

/** One card the server could not import (unreadable/invalid bytes) — carries the reason, isolated not thrown. */
export interface FailedCardResult {
  readonly filename: string | null;
  readonly error: string;
}

/** The `POST /api/import` response body (the server's `ProfileImportResult`): the REAL per-file outcome. The
 *  report summary derives from THIS — never from the uploaded filenames. */
export interface CardImportResult {
  readonly imported: readonly ImportedCardResult[];
  readonly failed: readonly FailedCardResult[];
}

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
  return (await response.json()) as CardImportResult;
}
