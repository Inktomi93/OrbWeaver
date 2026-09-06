// The #1598 explicit RESTORE-embedded-book door — `POST /api/import/restore-card-lorebook`. Raw fetch (a
// Hono multipart route, not tRPC), the `import-characters.ts` shape: ONE card file's bytes, matched
// server-side against the character those exact bytes imported as (an ordinary re-upload through
// `/api/import` now KEEPS an edited primary book — this is the separate, explicitly-asked-for door that
// puts the card's own book back).
//
// The server NEVER THROWS for a bad/unmatched card — `runCardLorebookRestore`'s refusal rides back as a
// 400 body with `{ok:false, error}`, exactly like a card import's per-file `failed[]` isolation, so a
// caller renders it as data. A whole-request rejection (401/403/413/5xx — no auth, no CSRF, over-size, a
// server fault) is the only arm that throws.

import { CSRF_HEADER } from "@orb/contracts/identity";
import type { CharacterId, WorldBookId } from "@orb/kit/ids";
import { throwHttpError } from "./http-error.ts";

const RESTORE_URL = "/api/import/restore-card-lorebook";
const RESTORE_FIELD = "file";
const BAD_REQUEST = 400;

/** The `POST /api/import/restore-card-lorebook` response body — the server's `RestoreCharacterBookResult`
 *  (`domain/import/contract/results.ts`), verbatim. `replaced:false` means the character held no primary
 *  book at all and the card's book landed fresh (a restore onto a character whose book was deleted is
 *  still a restore). */
export type RestoreCardLorebookResult =
  | { readonly ok: true; readonly characterId: CharacterId; readonly worldBookId: WorldBookId; readonly entryCount: number; readonly replaced: boolean }
  | { readonly ok: false; readonly error: string };

/** POST one card file's bytes to the #1598 restore route and return the server's verdict. The 400 "this
 *  card doesn't match anything of yours" arm still carries a real JSON body and is read as data, never
 *  thrown — only a whole-request rejection (a status the route never uses for its own refusal) throws. */
export async function restoreCardLorebook(file: File): Promise<RestoreCardLorebookResult> {
  const form = new FormData();
  form.append(RESTORE_FIELD, file);
  const response = await fetch(RESTORE_URL, {
    method: "POST",
    body: form,
    headers: { [CSRF_HEADER]: "1" },
  });
  if (!response.ok && response.status !== BAD_REQUEST) {
    await throwHttpError("restoreCardLorebook", response);
  }
  return (await response.json()) as RestoreCardLorebookResult;
}
