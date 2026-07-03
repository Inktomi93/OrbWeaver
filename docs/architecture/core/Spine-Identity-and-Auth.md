# Orbweaver — Spine: Identity, Auth, and Permission

> **Status: planning (authoritative detail).** This is the CANONICAL cross-cutting Spine document for
> spine thread §7.1 (cited elsewhere as "spine §7.1" / `AGENTS-2-Spine.md` §7.1, which points here).

> **D60 (2026-07-01): the agent-principal mechanics are now FULLY DESIGNED** — authoritative:
> [`../proposed/agent-principal-design/`](../proposed/agent-principal-design/README.md); this
> file's agent digest is superseded on any conflict by that set + the ledger D60 entry.

Findings that fix the target:

- **Resolve identity ONCE at the edge → one immutable `Principal` flows down.** Today it's resolved
  **twice per request** (`provisionIdentity` computes the row id keyed on `externalId`, then
  `createContext` throws it away and re-resolves by `handle` via `ensureUser`), across **3 principal
  shapes** (`ResolvedIdentity → AuthContext → Context`) with `role`/`userId` duplicated. Carry `userId`
  out of `resolve()`; never re-query. The 4 auth modes are already clean (one dispatcher, one branch
  point — keep).
- **Permission = global-role × resource-role × capability** (only the first is wired today). Global
  `admin|user` is real + 2-layer enforced (`adminProcedure` + `requireAdmin`). The per-resource
  `chat_participants.role: host|member` **exists in schema but gates NOTHING** ("added-but-unwired").
  Access control today is **pure single-owner row-scoping** (`chats.ownerId === ctx.userId` via
  `loadOwnedChat`) — the exact assumption that breaks for multi-human + agents. Target: wire `host|member`
  as chat authority; replace owner-equality with **participant-membership**; introduce a real
  `can(principal, action, resource)` seam instead of scattered `role===admin` / `ownerId===userId`.
- **LOCKED (user decision): agents are FIRST-CLASS PRINCIPALS** _(the MODEL is locked; per D60
  (2026-07-01) the mint mechanics are FULLY DESIGNED and committed as planned work — authoritative:
  `../proposed/agent-principal-design/` + the ledger D60 entry, which win over this digest on any
  detail. The v1 borrowed-owner posture (ledger §3/§5/D17) stays the shipping posture until the seat
  wave lands)._ Today the buddy is NOT a `users` row —
  it's a per-owner row (`buddies.userId → users.id`) acting **as the owner** (kill-switch + propose/confirm
  gate + in-process rate-limit, firewalled OUT of chat `messages`). Orbweaver makes an agent a **real
  principal**: its own `users` row + identity, a seat in `chat_participants`, **self-attributed messages**
  (`authorUserId` = the agent, not the owner). This unifies with multi-human (both want
  `chat_participants` to carry authz + `authorUserId` to mean the real author) — ONE model, not two. The
  blast radius (grounded by the principal-ripple dig): the `chat_participants.kind` enum + XOR check, the
  `authorUserId` stamping path, `loadOwnedChat`'s owner-equality access predicate, the `buddies`-table
  plumbing, and the roster builders all change. Preserve the safety the borrowed-identity model gave for
  free (an agent principal still needs a capability ceiling + the confirm gate — it must not silently
  exceed what its actions should do); that's now enforced by the permission model (global×resource×capability)
  rather than by "it's just the owner."
- **Esoteric to preserve:** `externalId` keys SSO / `handle` keys the rest (rename stability); the
  owner-fallback is bootstrap AND an origin-gated security belt (`viaFallback` is the safe "this is the
  owner" discriminator, NOT `externalId===null`); JWKS fails-closed 3 ways; CSRF keys on `viaCookie`;
  credential AAD binds `(userId, provider)`; the `max-pro-sub` gate is the only construction site (admin-gated in neo-source today → `requireOwner` in orbweaver, D17).
- **BFF session ≠ SDK chat session** — keep the two "session" concepts firmly separate (identity vs
  prompt-cache lineage); the schema already calls this out.
- **Persona = the human principal's presentation identity — three axes, three homes** (authoritative here;
  `AGENTS-3-Domains.md` §"Participants, agents & identity" is the map): **active** per-participant
  (`chat_participants.activePersonaId` — each human's lines render under their own persona; multi-human
  native), **anchor** per-chat (`chats.anchorPersonaId` — the stable `{{user}}` POV; a mid-chat persona
  switch never rewrites the card's established `{{user}}`; the dual-persona render rule lives in
  `chat/assembly`), **attribution** per-message (`messages.personaId` + `authorUserId`, server-stamped).
  There is NO `chats.personaId` second home.
