---
kind: adr
status: active
updated: 2026-09-23
---

# `users.role` is the ONE home of the global-role verdict, and every `Principal`-minting path READS it

## Context

Not recorded in the ledger row.

## Decision

Owner-ruled on a live drive, verbatim: *"when the fallback path admits you, it goes through like normal."* Homes: `entry/auth/seam.ts` (`ownerHandleForFallback` + the fallback case + the row→`Principal` mapper behind `createHostPrincipalResolver`/`createFallbackPrincipalResolver`) · `domain/sessions/substrate/role-policy.ts` (`ownerHandles`/`determineRole` — the owner PREDICATE) · `entry/boot/seed-owner.ts` (the boot backfill) · `entry/compose/services.ts` (`roleClientsFor`/`resolveFunderPrincipal` — the binder that was its own `entry/compose/` module until the extraction) + `entry/lifecycle.ts` (the two former stamp sites, clause G). Pins: `tests/server/entry/auth/seam.test.ts` (the AGREEMENT pin + the `enabled` parity); the binder's own provenance pin was deleted with its file and is owed (clause G).

**(A) THE FALLBACK ADMITS; IT DOES NOT GRANT.** `Principal.via === "fallback"` stays the safe "this IS the owner" discriminator and the origin gate (`ownerFallbackAllowed`) stays the entire security boundary — **but the case no longer stamps `role:"owner"`.** It resolves the box owner's ROW and mints from it. This AMENDS the Spine's invariant 7 wording ("mints `role:"owner"`") without moving the boundary: an admitted caller still lands as the owner on any correctly-seeded box, and on a box where the owner row is somehow below `owner` the verdict is now HONEST and fail-closed instead of an override.

**(B) TWO HOMES FOR ONE VERDICT IS THE DEFECT, AND IT IS SILENT.** The measured instance: the seam stamped `owner` on the request Principal while `createHostPrincipalResolver` read `users.role` and answered `user` for the SAME caller, so `resolveChatCapability` (request Principal) advertised `agent-sdk / max-pro-sub / claude-opus-4-8` while the TURN (frozen-host Principal) resolved `vllm / Qwen3-VL-8B` — `ROLE_SELECTORS.chat` was, until the D142 flip, `isOwner ? max-pro-sub : vllm`. Pinning the role default then DISABLED the composer and 403'd `previewContextFit` with `requires owner privilege`, because the preview resolves its connection under `resolveHostPrincipal(hostUserId)`. **Nothing threw; the two surfaces just quietly disagreed.** This is the `viewerReadsHidden`/D110 discipline applied to authority: home the verdict once, or the surfaces drift.

**(C) WHO THE OWNER IS, IS RESOLUTION-TIER POLICY — never verification's placeholder handle.** `infra/auth` stamps `config.defaultHandle` (`DEFAULT_USER_HANDLE`, schema default the literal `"owner"`) on the fallback identity and deliberately reads no owner policy (invariant 3). The seam therefore resolves the handle through `ownerHandles()` — the SAME predicate `determineRole` and the boot owner-seed read, exported from the sessions front door precisely "so entry's boot owner-seed and the login-derived role path can never fork"; the fallback is its THIRD consumer. D17's singleton (env-enforced: a multi-handle `OWNER_HANDLES` is boot-fatal at `foundation/env`'s superRefine) is what makes `[0]` well-defined.

**(D) THE COST OF THE SPLIT WAS A SECOND-CLASS TWIN, AND IT IS A CLASS.** With `OWNER_HANDLES=owner@example.com` and `DEFAULT_USER_HANDLE` unset, the first un-credentialed request called `ensureUser("owner")`, `determineRole` CORRECTLY refused it owner (the handle is not the owner's), and the seam overrode that refusal in memory — minting a second `users` row at role `user` that then hosted chats. Live evidence: the owner row at `created_at` 1786123844475 (boot seed) and the twin at 1786123847898, **3.4 seconds later**, holding 7 `chat_participants` rows. The general rule: **a JIT-create verb that DERIVES a role, called with a handle the caller only assumed was the owner's, mints a tenant — and an in-memory stamp over it hides the mint instead of preventing it.** After this ruling the twin is unmakeable; the existing dev rows were abandoned by owner ruling (*"it's a dev db, we literally do not care lol"*), not migrated.

**(E) THE MINT IS ONE FUNCTION, ON PURPOSE.** The request-fallback Principal and the frozen-host Principal are produced by the same `createHostPrincipalResolver` closure over one `loadUserById` read. Its unknown-id `?? "user"` degrade is fail-closed on an absent row, NOT an invented grant — the distinction a reviewer must keep. **The pin is an AGREEMENT pin** (`resolvePrincipal(...)` deep-equals `createHostPrincipalResolver(sessions)(thatUserId)`), not two independent role assertions: a divergence is exactly what no single-surface test could see, and it is what a live drive found.

**(F) THE TWIN ALSO ATE THE ENV-SEEDED CREDENTIAL — "the feature is inert" was a TENANCY misread.** A board row held that the `.env` `OPENROUTER_API_KEY` never reached the app, on the evidence that a live `credentials.list` returned `[]`. It is FALSE, and this ruling is what repairs it. `entry/lifecycle.ts` seeds the key onto a `Principal` built with `userId: ownerId` — the row `seedOwner` just ensured from `ownerHandles()`, i.e. the REAL owner — and `credentials.list` is strictly per-user (`listOwnedCredentials` → `where(eq(userCredentials.ownerId, principal.userId))`, no admin/owner widening). The drive ran as the TWIN, so the empty list was the tenancy control working exactly as designed. Live evidence: the single `user_credentials` row is scoped to the real owner at `created_at` 1786123844573 — **98 ms after** that owner's `users` row — while the twin, minted 3.4 s later, holds none. **The lesson is the diagnostic one: a per-user-scoped read returning EMPTY is evidence about WHICH PRINCIPAL asked, never about whether the data exists.** Before calling a per-user feature inert, confirm the reading principal is the writing principal — an identity split presents identically to an unwired feature, and it presented that way here for weeks.

Split off for the 8 KiB ADR cap: the per-tier role verdict and the `enabled` column agreement [ADR 0218](0218-role-verdict-one-home-every-tier.md).

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
