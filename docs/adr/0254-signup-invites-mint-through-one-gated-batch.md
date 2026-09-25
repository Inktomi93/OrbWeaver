---
kind: adr
status: active
updated: 2026-09-25
---

# Signup invites mint accounts through one gated batch

## Context

Leg J lets an invite create an account for a signed-out friend. Review found that the plan's batch order seats a stranger on an exhausted invite, that any room host could mint accounts past the admin gate on `createUser`, and that a statement-shaped SSO insert is a second upsert, which spine invariant 10 bans. `db.transaction()` is banned in product code, so one `db.batch` is the only atomic unit, and a batch cannot rerun the JavaScript reads inside `provisionIdentity`.

## Decision

An invite with `allowSignup` creates at most one account per use, and it mints only through one gated batch.

Authority. Only a global admin mints a signup invite: `createInvite` calls `can(principal, "admin", {kind:"global"})` beside `requireHost`. The invite row stamps the minter and the auth mode at mint. At redeem an injected op re-reads the minter row and refuses the signup unless the minter is still enabled and still passes the same admin check. The one mode table is the mapped `SIGNUP_INVITES_MINTABLE` in `packages/contracts/src/chat/roster.ts`, read by the mint gate and dialog, so a new mode fails `tsc`. `local` and `oidc` mint. `forward-header` and `single-user` refuse to mint, and a signup redeem refuses when the stamped mode differs from the current mode.

Caps. A signup invite has a finite use count from one to `SIGNUP_MAX_USES`, an expiry after the server clock and no later than `SIGNUP_MAX_TTL_MS` past it, and no target. The CHECK `allow_signup = 0 OR (invited_user_id IS NULL AND max_uses IS NOT NULL AND expires_at IS NOT NULL)` on `chat_invites` holds the shape in the database.

The batch. Every statement after the first gates on `changes() > 0`. For `local` the order is: insert the user where the invite still admits and no row holds the handle key, then claim a use where the invite admits, then seat the member, then write the `invites.signup` audit row. For `oidc` a `DELETE … RETURNING` of the live pending row by its hashed secret comes first and the user insert gates on it. The user insert never uses `onConflictDoNothing`, so a unique race throws and rolls the batch back. The control is the one admission predicate that the user insert and the claim both read. After commit the redeem fails loudly on a partial chain of `RETURNING`s instead of reporting a join.

Invariant 10. A pure `decideProvision(existing, identity, ownerId, options)` in `domain/sessions` holds the ruled precedence. `provisionIdentity` interprets its decision and runs the two reads the decision names: the owner row for owner adoption and the email for the collision deny. The `oidc` signup statement calls the same function and puts only the race-relevant checks in SQL: the unique indexes on handle, `external_id` and the single owner, and `NOT EXISTS` checks on the handle key and on email. A statement that decides through `decideProvision` is not a second upsert. The `local` signup carries no external identity and follows the `createUser` rules instead: a human with role `user` and a password hash.

Handle key. Every handle writer compares on one Unicode key and refuses a mixed-script handle ([ADR 0256](0256-handles-compare-on-one-unicode-key.md)).

Spine section 3. The `local` signup and `oidc` confirm routes are session cookie sites; each mints only after the batch commits with every `RETURNING` non-empty.

The route. The `local` signup route runs its controls in this order: `csrfGuard`, the body cap, the `multiHumanCapable` 404, the per-address bucket (the `login-ip` scope, with an IPv6 address grouped by its /64 prefix), a refusal of a request that already carries a valid session, the strict schema, the invite pre-check (an invalid or spent token answers 404 with no invite bucket and no scrypt), the per-invite bucket, the reserved-handle refusal (`isReservedSignupHandle`), scrypt, the batch, then the session cookie, the connection seed and the `chatUpdated` emit.

The pending join. The `oidc` login route takes `?invite=` of at most 128 characters and keeps only its peppered hash on the OIDC transaction. It never answers whether the invite is valid. The JIT gate is the only source of the `jit-closed` deny reason. On that reason, when the transaction's invite still admits, the callback writes a pending row to the sessions-owned `oidc_pending_signups` table instead of refusing. The row holds the peppered hash of a fresh secret (never the OIDC state), the identity, the invite hash, and the id_token sealed under the secret hash as AAD. It expires after `OIDC_PENDING_JOIN_TTL_MS`. There is one row per subject, and a later callback replaces it. The OIDC GC sweep reaps expired rows, and the transaction consume never reads the table. The secret rides only the pending cookie: `__Host-orb_join_pending` over https and `orb_join_pending_insecure` over http, both `HttpOnly` and `SameSite=Strict`. The callback redirects to `/login?pendingJoin=1`, whose URL carries no secret. The preview and confirm routes are POSTs behind `csrfGuard`, the body cap and the per-address bucket. The preview returns only the strict invite preview. The confirm takes a strict empty body and refuses a live session. It re-runs `deriveIdentityAccess` on the frozen groups and refuses an owner-by-policy identity. It refuses a reserved handle and one ADR 0256 refuses, as the `local` route does, then plans through `decideProvision`, keeping only an insert, and runs the batch. Every refusal clears both pending cookie names. Home: `domain/sessions/verbs/pending-signup.ts`.

Approval. Under `OIDC_REQUIRE_APPROVAL` the confirm spends one use and seats the disabled account in the same batch, and it mints no session. Once an admin enables it, the friend signs in as a member. After commit it mints a session only for an enabled account, then seeds connections and emits `chatUpdated`.

The client stashes the raw token in `sessionStorage` when the signed-out guard redirects; it never returns to the address bar. In `oidc` mode, Continue hands it to the login route as `?invite=`, which answers with an immediate 302, so it never becomes a history entry. The stash clears when the join dialog or the pending-join confirm consumes it, when the visitor dismisses it, and on sign-out. The mint dialog offers the sign-up switch only to a global admin in a minting mode and only for a share link. The server re-checks every cap the dialog enforces.

## Consequences

Each account a signup invite creates has an audit row, a seat and a spent use, or none of them exist. A leaked link admits at most its remaining uses before its expiry. An admin who loses the role or is disabled stops every signup link they minted. Spend by the new accounts continues until the host kicks them or an admin disables them. The taken-handle answer is an oracle, and the per-invite bucket bounds it. Accepted residual: a forced second OIDC login in the pending window can swap the pending join for another signup invite; the confirm keeps its empty body, and the visitor can leave that room.

## Alternatives rejected

- Extend `redeemInviteAtomic` with an ungated user insert before the seat, as the plan worded it: the seat's `changes()` then reads the insert and seats a stranger on an exhausted invite.
- Let any room host mint a signup invite: it bypasses the admin gate on `createUser` and the owner's `OIDC_SIGNUP` setting.
- A second SSO upsert beside `provisionIdentity`: it would carry its own weaker takeover rules.
- Mint the account over tRPC: a tRPC procedure cannot write the session cookie.
- Carry the token back through `/login?join=` and `goHome`: it puts a raw invite token back in the address bar and history.
