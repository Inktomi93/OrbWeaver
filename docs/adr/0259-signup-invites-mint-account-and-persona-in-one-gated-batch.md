---
kind: adr
status: active
updated: 2026-09-25
supersedes: docs/adr/0254-signup-invites-mint-through-one-gated-batch.md
---

# Signup invites mint the account and the joiner's persona through one gated batch

## Context

An invite may create an account for a signed-out friend. Review found that the plan's batch order seats a stranger on an exhausted invite, that any room host could mint accounts past the admin gate on `createUser`, and that a statement-shaped SSO insert is a second upsert, which spine invariant 10 bans. `db.transaction()` is banned in product code, so one `db.batch` is the only atomic unit, and a batch cannot rerun the JavaScript reads inside `provisionIdentity`. A joiner seated with no persona speaks as nobody.

## Decision

An invite with `allowSignup` creates at most one account per use and mints only through one gated batch. The joiner names a persona before the seat exists, and that batch creates it.

Authority. Only a global admin mints a signup invite: `createInvite` calls `can(principal, "admin", {kind:"global"})` beside `requireHost`. The invite row stamps the minter and the auth mode at mint. At redeem an injected op refuses the signup unless the minter is still enabled and still passes that admin check. The one mode table is `SIGNUP_INVITES_MINTABLE`, a mapped `Record<AuthMode, boolean>` in `packages/contracts/src/chat/roster.ts` that the mint gate and the mint dialog both read, so a new mode fails `tsc`. `local` and `oidc` mint. `forward-header` and `single-user` refuse to mint, and a signup redeem refuses when its stamped mode is not the current one.

Caps. A signup invite has a finite use count from one to `SIGNUP_MAX_USES`, an expiry after the server clock and no later than `SIGNUP_MAX_TTL_MS` past it, and no target. Both constants live beside that table. The CHECK `allow_signup = 0 OR (invited_user_id IS NULL AND max_uses IS NOT NULL AND expires_at IS NOT NULL)` on `chat_invites` holds the shape in the database.

The joiner's persona. Both doors carry `joinerPersonaSchema` (`@orb/contracts/persona`) under a body cap sized for it.

The batch. Every statement after the first gates on `changes() > 0`. For `local` the order is: insert the user where the invite still admits and no row holds the handle key, then claim a use where the invite admits, then insert the joiner's persona, then insert the account's `user_settings` row aiming its current and default persona at it, then seat the member as that persona, then write the `invites.signup` audit row. Persona and settings own those two inserts and hand each to chat as an injected statement op. For `oidc` a `DELETE … RETURNING` of the live pending row by its hashed secret comes first and the user insert gates on it. The user insert never uses `onConflictDoNothing`, so a unique race throws and rolls the batch back. The control is the one admission predicate that the user insert and the claim both read. After commit a partial chain, where one `RETURNING` is empty and another is not, fails loudly instead of reporting a join. Chat passes the admission predicate to the sessions statement builder as `SQL`, so sessions reads no chat table.

Invariant 10. The pure `decideProvision` (`domain/sessions`) holds the ruled precedence. `provisionIdentity` and the `oidc` signup statement both decide through it, so the statement is not a second upsert; it keeps in SQL only the race-relevant checks: the unique indexes on handle, `external_id` and the single owner, and `NOT EXISTS` on the handle key and on email. The `local` signup carries no external identity and follows the `createUser` rules: a `user`-role human with a password hash.

Spine section 3. Both routes in `packages/server/src/entry/http/auth-routes.ts` mint the session cookie only after the batch commits with every `RETURNING` non-empty.

The route. The `local` signup route runs its controls in this order: `csrfGuard`, the body cap, the `multiHumanCapable` 404, the per-address bucket (`login-ip`, IPv6 grouped by /64), a refusal of a request with a valid session, the strict schema, the invite pre-check (a dead token answers 404 before any invite bucket or scrypt), the per-invite bucket, the reserved-handle refusal (`isReservedSignupHandle`), scrypt, the batch, then the session cookie, `seedUserConnections` and the `chatUpdated` emit.

The pending join. The `oidc` login route takes `?invite=` of at most 128 characters and keeps only its peppered hash on the OIDC transaction. It never answers whether the invite is valid. The JIT gate is the only source of the `jit-closed` deny reason. On that reason, when the transaction's invite still admits, the callback writes a pending row to the sessions-owned `oidc_pending_signups` table instead of refusing. The row holds the peppered hash of a fresh secret (never the OIDC state), the identity, the invite hash, and the id_token sealed under the secret hash as AAD. It expires after `OIDC_PENDING_JOIN_TTL_MS`; a later callback replaces a subject's row. The OIDC GC sweep reaps expired rows; the transaction consume never reads the table. The secret rides only the pending cookie (`infra/auth/modes/oidc.ts`: `HttpOnly`, `SameSite=Strict`). The callback redirects to `/login?pendingJoin=1`, whose URL carries no secret. The preview and confirm routes are POSTs behind `csrfGuard`, the body cap and the per-address bucket. The preview returns only the invite preview. The confirm's strict body holds only the joiner's persona, and it refuses a live session. It re-runs `deriveIdentityAccess` on the frozen groups and refuses an owner-by-policy identity. It refuses a reserved handle and one [ADR 0257](0257-handles-compare-on-one-unicode-key.md) refuses, as the `local` route does, then plans through `decideProvision`, keeping only an insert, and runs the batch. Every refusal clears both pending cookie names. Home: `domain/sessions/verbs/pending-signup.ts`.

Approval. Under `OIDC_REQUIRE_APPROVAL` the confirm spends one use and seats the disabled account in the same batch, and it mints no session. After commit the confirm mints a session only for an enabled account, then runs `seedUserConnections` and the `chatUpdated` emit.

The client stashes the raw token in `sessionStorage` when the signed-out guard redirects, never in the address bar. In `oidc` mode Continue hands it to the login route as `?invite=`, whose immediate 302 leaves no history entry. The stash clears when the join dialog or the pending-join confirm consumes it, when the visitor dismisses it, and on sign-out. The mint dialog offers the sign-up switch only to a global admin in a minting mode and only for a share link. The server re-checks every cap the dialog enforces.

## Consequences

Each account a signup invite creates has an audit row, a persona, a settings row aimed at it, a seat as it and a spent use, or none of them. A leaked link admits at most its remaining uses before its expiry. An admin who loses the role or is disabled stops every signup link they minted. Spend by the new accounts continues until the host kicks them or an admin disables them. The taken-handle answer is an oracle, and the per-invite bucket bounds it. `decideProvision` is tested as a pure function beside the `provisionIdentity` precedence cases. Accepted residual: a forced second OIDC login in the pending window can swap the pending join for another signup invite; the confirm body names no invite, and the visitor can leave that room.

## Alternatives rejected

- Extend `redeemInviteAtomic` with an ungated user insert before the seat: the seat's `changes()` then reads the insert and seats a stranger on an exhausted invite.
- Let any room host mint a signup invite: it bypasses the admin gate on `createUser` and the owner's `OIDC_SIGNUP` setting.
- A second SSO upsert beside `provisionIdentity`: it would carry its own weaker takeover rules.
- Mint the account over tRPC: a tRPC procedure cannot write the session cookie.
- Carry the token back through `/login?join=`: it puts the raw token back in the address bar and history.
- Create the persona or aim its pointers after commit: a failure there leaves the account and seat with empty pointers.
