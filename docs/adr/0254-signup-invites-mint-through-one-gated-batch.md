---
kind: adr
status: active
updated: 2026-09-25
---

# Signup invites mint accounts through one gated batch

## Context

Easy-sharing leg J lets a room invite create an account for a signed-out friend. The pre-build security review found that the plan's batch order seats a stranger on an exhausted invite, that any room host could mint accounts past the admin gate on `createUser`, and that a statement-shaped SSO insert is a second upsert, which spine invariant 10 bans. `db.transaction()` is banned in product code, so one `db.batch` is the only atomic unit, and a batch cannot rerun the JavaScript reads inside `provisionIdentity`.

## Decision

An invite with `allowSignup` creates at most one account per use, and it mints only through one gated batch.

Authority. Only a global admin mints a signup invite: `createInvite` calls `can(principal, "admin", {kind:"global"})` beside `requireHost`. The invite row stamps the minter and the auth mode at mint. At redeem an injected op re-reads the minter row and refuses the signup unless the minter is still enabled and still passes the same admin check. The chat composition root injects the mode capability from a mapped `Record<AuthMode, …>`, so a new mode fails `tsc`. `forward-header` and `single-user` refuse to mint, and a signup redeem refuses when the stamped mode differs from the current mode. The `oidc` capability turns on with the confirm flow.

Caps. A signup invite has a finite use count from one to `SIGNUP_MAX_USES`, an expiry after the server clock and no later than `SIGNUP_MAX_TTL_MS` past it, and no target. Both constants live in `packages/contracts/src/chat/roster.ts`. The CHECK `allow_signup = 0 OR (invited_user_id IS NULL AND max_uses IS NOT NULL AND expires_at IS NOT NULL)` on `chat_invites` holds the shape in the database.

The batch. Every statement after the first gates on `changes() > 0`. For `local` the order is: insert the user where the invite still admits and no handle matches case-insensitively, then claim a use where the invite admits, then seat the member, then write the `invites.signup` audit row. For `oidc` a `DELETE` of the pending record by its hashed secret comes first and the user insert gates on it; that flow is not yet built. The user insert never uses `onConflictDoNothing`, so a unique race throws and rolls the batch back. The redeem asserts that every `RETURNING` is non-empty. Chat builds the admission predicate and passes it to the sessions statement builder as `SQL`, so sessions reads no chat table.

Invariant 10. A pure `decideProvision(existing, identity, ownerId, options)` in `domain/sessions` holds the ruled precedence. `provisionIdentity` interprets its decision and runs the two reads the decision names: the owner row for owner adoption and the email for the collision deny. The `oidc` signup statement calls the same function and puts only the race-relevant checks in SQL: the unique indexes on handle, `external_id` and the single owner, and a `NOT EXISTS` on email, because email has no unique index. A statement that decides through `decideProvision` is not a second upsert. The `local` signup carries no external identity and follows the `createUser` rules instead: a human with role `user` and a password hash.

Spine section 3. The `local` signup route and the `oidc` confirm route in `packages/server/src/entry/http/auth-routes.ts` are session cookie sites. Each mints through `sessions.create` only after the batch commits with every `RETURNING` non-empty.

The route. The `local` signup route runs its controls in this order: `csrfGuard`, the body cap, the `multiHumanCapable` 404, the per-address bucket (the `login-ip` scope, with an IPv6 address grouped by its /64 prefix), a refusal of a request that already carries a valid session, the strict schema, the invite pre-check (an invalid or spent token answers 404 with no invite bucket and no scrypt), the per-invite bucket, the reserved-handle refusal (the sessions front door compares `ownerHandles()` and `DEFAULT_USER_HANDLE` case-insensitively), scrypt, the batch, then the session cookie, `seedUserConnections` and the `chatUpdated` emit.

Approval. Under `OIDC_REQUIRE_APPROVAL` the confirm spends one use and seats the disabled account in the same batch, and it mints no session. Once an admin enables the account, the friend signs in and is already a member. That flow is not yet built.

The client stashes the raw token in `sessionStorage` when the signed-out guard redirects, and the token never returns to a URL. The stash clears when the join dialog consumes it, when the visitor dismisses it, and on sign-out.

## Consequences

Each account a signup invite creates has an audit row, a seat and a spent use, or none of them exist. A leaked link admits at most its remaining uses before its expiry. An admin who loses the role or is disabled stops every signup link they minted. Spend by the new accounts continues until the host kicks them or an admin disables them. The taken-handle answer is an oracle, and the per-invite bucket bounds it. The `provisionIdentity` tests keep their precedence cases, and `decideProvision` is tested as a pure function.

## Alternatives rejected

- Extend `redeemInviteAtomic` with an ungated user insert before the seat, as the plan worded it: the seat's `changes()` then reads the insert and seats a stranger on an exhausted invite.
- Let any room host mint a signup invite: it bypasses the admin gate on `createUser` and the owner's `OIDC_SIGNUP` setting.
- A second SSO upsert beside `provisionIdentity`: it would carry its own weaker takeover rules.
- Mint the account over tRPC: a tRPC procedure cannot write the session cookie.
- Carry the token back through `/login?join=` and `goHome`: it puts a raw invite token back in the address bar and history.
