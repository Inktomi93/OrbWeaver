// The Saved-keys row's pure model (inference program §5.3a): the reuse count line and the per-cause
// revocation sentence; how a key NAMES itself is `keySubjectName` in `credentials-names.ts`. Split out of the row component so the copy is testable without a
// browser and so the row's two ConfirmDialogs and its Replace prompt quote ONE count phrase between them.

import type { CredRevokedReason } from "@orb/contracts/credentials";
import { REVOKED_KEY_COPY } from "#lib";

/** The reuse fact as a SENTENCE — a key is shared across connections, so every consequential act on it
 *  quotes this rather than leaving the reader to count rows. */
export function reuseSentence(usedBy: number): string {
  if (usedBy === 0) {
    return "No connection uses this key yet";
  }
  return usedBy === 1 ? "1 connection uses this key" : `${usedBy} connections use this key`;
}

/** The row's secondary line: the COUNT, plus — when revoked — WHY. The bare Revoked chip could not tell
 *  "you revoked this" from "the provider rejected your key", and those want opposite actions from the
 *  reader (press Clear revoked, versus paste a new key). `wrap` rides along because the line becomes a
 *  sentence once a cause joins it, and a clipped explanation of a dead credential is worse than none.
 *
 *  The PROVIDER left this line when it moved into the row's title — it is half the row's identity, not
 *  metadata about it, and repeating it here spent the one line the count needs. */
export function keyRowSubtitle(
  credential: { readonly revokedAt: number | null; readonly revokedReason: CredRevokedReason | null },
  usedBy: number,
): { readonly text: string | undefined; readonly wrap: boolean } {
  const cause = credential.revokedAt !== null && credential.revokedReason !== null ? revokedReasonCopy(credential.revokedReason) : null;
  const parts = [`used by ${usedBy} connection${usedBy === 1 ? "" : "s"}`, cause].filter((part) => part !== null);
  return { text: parts.length > 0 ? parts.join(" · ") : undefined, wrap: cause !== null };
}

/** The user-facing sentence for each revocation cause — a closed dispatch over `CredRevokedReason`, so a new
 *  member is a `tsc` error here rather than a row that renders a cause the pane has no words for.
 *
 *  The copy is derived ENTIRELY from the enum member: nothing the provider or the endpoint said is echoed,
 *  so this line cannot become the credential-echo leak class (a user endpoint that reflects the request back
 *  has repeatedly turned display-bound response text into a key disclosure).
 *
 *  The words are {@link REVOKED_KEY_COPY}'s, the one home every revoked-key surface reads, so this row and the
 *  connection badge cannot disagree on why. A wire value outside the union is not parsed at this boundary, and the
 *  honest answer to "why?" we cannot read is silence, never the raw string on screen. */
function revokedReasonCopy(reason: CredRevokedReason): string | null {
  return Object.hasOwn(REVOKED_KEY_COPY, reason) ? REVOKED_KEY_COPY[reason].savedKey : null;
}
