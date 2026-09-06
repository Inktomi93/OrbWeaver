// The character-card import POST. Raw fetch, not tRPC — the route is a Hono multipart handler. Accepts
// one-or-many card files under the repeated `file` field. The route returns 200 for an accepted batch
// even when individual cards fail (per-card failures[] isolation), so this helper parses the real
// per-file outcome and hands it back — the summary must derive from that, never from the uploaded
// filenames. A non-200 (whole-batch rejection) throws.

import { CSRF_HEADER } from "@orb/contracts/identity";
import { throwHttpError } from "./http-error.ts";

const IMPORT_URL = "/api/import";
const IMPORT_FIELD = "file";

/** One imported (or deduped) card from `POST /api/import`'s `ProfileImportResult` — `created:false` marks a
 *  byte-identical re-import (already present, no write). `notes` mirrors the server's `ImportedCard.notes`
 *  (#1598/#1709): the card planes this import deliberately did NOT assert (today's one member — a
 *  re-uploaded card whose embedded lorebook was KEPT because the character already holds a primary book
 *  the owner may have edited). Present even when empty, exactly like the server shape it mirrors. */
interface ImportedCardResult {
  readonly filename: string | null;
  readonly created: boolean;
  readonly notes: readonly string[];
}

/** One card the server could not import (unreadable/invalid bytes) — carries the reason, isolated not thrown. */
interface FailedCardResult {
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
