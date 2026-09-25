---
kind: adr
status: superseded
updated: 2026-09-25
superseded-by: docs/adr/0259-signup-invites-mint-account-and-persona-in-one-gated-batch.md
---

# Signup invites mint accounts through one gated batch

## Context

Leg J lets an invite create an account for a signed-out friend. Review found that the plan's batch order seats a stranger on an exhausted invite, that any room host could mint accounts past the admin gate on `createUser`, and that a statement-shaped SSO insert is a second upsert, which spine invariant 10 bans. `db.transaction()` is banned in product code, so one `db.batch` is the only atomic unit, and a batch cannot rerun the JavaScript reads inside `provisionIdentity`.

## Decision

An invite with `allowSignup` creates at most one account per use, and it mints only through one gated batch. The full ruling, with the joiner's persona added to that batch, moved to [ADR 0259](0259-signup-invites-mint-account-and-persona-in-one-gated-batch.md).

## Consequences

Each account a signup invite creates has an audit row, a seat and a spent use, or none of them exist. A leaked link admits at most its remaining uses before its expiry. An admin who loses the role or is disabled stops every signup link they minted. Spend by the new accounts continues until the host kicks them or an admin disables them. The taken-handle answer is an oracle, and the per-invite bucket bounds it. `decideProvision` is tested as a pure function beside the `provisionIdentity` precedence cases. Accepted residual: a forced second OIDC login in the pending window can swap the pending join for another signup invite; the confirm keeps its empty body, and the visitor can leave that room.

## Alternatives rejected

- Extend `redeemInviteAtomic` with an ungated user insert before the seat, as the plan worded it: the seat's `changes()` then reads the insert and seats a stranger on an exhausted invite.
- Let any room host mint a signup invite: it bypasses the admin gate on `createUser` and the owner's `OIDC_SIGNUP` setting.
- A second SSO upsert beside `provisionIdentity`: it would carry its own weaker takeover rules.
- Mint the account over tRPC: a tRPC procedure cannot write the session cookie.
- Carry the token back through `/login?join=` and `goHome`: it puts a raw invite token back in the address bar and history.
