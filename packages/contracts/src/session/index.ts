// `@orb/contracts/session` — the BFF browser-session VIEW. The revocable browser login as exposed to
// the admin device list, produced by `domain/sessions` and consumed by `domain/admin` + the client
// device table. NOT the agent-sdk chat session (that prompt-cache lineage is backend-internal).
// The opaque session token, its peppered `tokenHash`, the owning `userId`, and (since #141) the sealed
// OIDC `id_token` never appear on this view.

import type { SessionId } from "@orb/kit/ids";

/** One browser-session row as exposed to the admin device list. `revokedAt` is `null` while the device
 *  is live. Deliberately secret-free: no `tokenHash`/token/pepper/`userId`, and no `oidcIdToken*` column
 *  (that sealed blob has exactly ONE reader — the logout revoke — and is pinned unprojectable in
 *  `tests/server/domain/sessions/verbs/create.int.test.ts`). */
export interface SessionView {
  id: SessionId;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  revokedAt: number | null;
  userAgent: string | null;
}
