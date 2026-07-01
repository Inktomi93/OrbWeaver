// `@orb/contracts/session` — the BFF browser-session VIEW (SINGULAR namespace, D12). This is the
// revocable browser login as exposed to the admin device list ("list / revoke my devices") — identity +
// live login state, produced by `domain/sessions` (`toSessionView` projection of a `sessions` row) and
// consumed by `domain/admin` (via an injected `SessionAdminPort`) + the client device table. A pure
// cross-boundary DTO so the producing + consuming domains can name it WITHOUT a domain↔domain import.
// Ported from neo-tavern `shared/contracts/session.ts`.
//
// D12 — the namespace is `contracts/session` (singular); the DOMAIN is `domain/sessions` (plural). There
// is NO `contracts/sessions`. This is NOT the agent-sdk chat session: that prompt-cache lineage lives in
// the `session_entries` table, backend-internal to the agent-sdk provider (D8,
// `infra/providers/backends/agent-sdk/session/`). The two share only the word "session"
// (core/Spine-Identity-and-Auth.md "BFF session ≠ SDK chat session").
//
// Layer 0 (kit-only): the only dep is the `SessionId` brand. `SessionView` carries NO `UserRole` — it is
// the device-list projection (id + timestamps + user-agent), not the principal — so the DAG's "if it
// exposes the role → Layer 1 (after identity)" FLAG resolves to NO `@orb/contracts/identity` edge.
//
// The opaque session token, its peppered `tokenHash`, the `SESSION_SECRET` pepper, and the owning
// `userId` NEVER appear on this view — the token is not identity, and the hash is a server-only secret.

import type { SessionId } from "@orb/kit/ids";

/**
 * One browser-session row as exposed to the admin device list. All timestamps are epoch-millis numbers
 * (the `sessions` table's native form). `revokedAt` is `null` while the device is live and a timestamp
 * once logged-out / kicked; `userAgent` is `null` when the mint carried no UA header. Deliberately
 * secret-free: no `tokenHash` / token / pepper / `userId` (the token is not identity — see the file
 * header + the no-secret-fields contract test).
 */
export interface SessionView {
  id: SessionId;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  revokedAt: number | null;
  userAgent: string | null;
}
