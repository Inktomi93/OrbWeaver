---
kind: adr
status: active
updated: 2026-09-23
---

# The role verdict has one home in every tier, not just the auth seam

## Context

Split off [ADR 0135](0135-users-role-is-the-one-home-of-the.md), whose per-tier role-verdict clause pushed it over the 8 KiB ADR cap. The role-clients binder stamped `role:"owner"` on any `UserId` handed to it, and that forged role was consumed by `resolveRole` → `credentials.resolve` → `mintMaxProSub`.

## Decision

**(G) THE VERDICT HAS ONE HOME IN EVERY TIER, NOT JUST THE SEAM — AND `enabled` IS A SECOND COLUMN THE REQUEST CASES MUST AGREE ON.** The seam's own "no path invents a role" is a claim about the whole tree, and when it landed it was false one file over: the role-clients binder — then its own module under `entry/compose/`, folded into `entry/compose/services.ts` by the `@orb/inference` extraction — stamped `role:"owner"` on any `UserId` handed to `bindRoleClientsForUser`, and `entry/compose/automation-plugin.ts`'s `/autobg` case reaches it at REQUEST time with an automation rule's AUTHOR — a rule needs only D18 ROOM host authority (`automation/verbs/create-rule.ts` → `requireChatHost`), so any authenticated user who creates a chat qualifies. **That forged role was CONSUMED, not merely computed:** `resolveRole` → `credentials.resolve` → `mintMaxProSub`, whose owner gate keys on `principal.role` (only the row-backed sources key on `userId`), while the then-live per-role source list let any user pin `roleDefaults.summarize.source` to `max-pro-sub` (that source axis and its settings lists are superseded — a task is bound to a connection ROW the principal owns). The mint that documents itself as "unconstructable except after `requireOwner` passes" was therefore constructable by a non-owner, and the only thing stopping the resulting call was the credential firewall's `summarize` row happening to omit `max-pro-sub` — **a policy row nobody wrote as a boundary is not a boundary.** The binder now takes the resolver as a dep; `entry/lifecycle.ts`'s boot-seed Principal likewise READS the row `seedOwner` just wrote. **What survives is only the fail-closed FLOOR** (`role:"user"` synthetics for role-IRRELEVANT ops: `entry/compose/chat.ts`, `imagery.ts`, `search-discovery.ts`) — inventing the floor DENIES, and that is the line clause E draws. Homes: `entry/compose/services.ts` — the wiring AND, since the binder folded into it, the no-`Principal`-construction rule itself (`roleClientsFor` resolves the funder through the injected resolver). ⚠ The dedicated binder pins, which drove the REAL resolver and the REAL owner gate, were DELETED with the binder file and have no successor: `services.test.ts` only asserts that `roleClientsFor` is a function. Re-pinning this invariant is owed. **The `enabled` half:** the fallback case authenticates through `loadUserById`, a read that deliberately gates nothing so the frozen-host bridge can resolve a disabled/offline host's authority — so the CASE owns the gate, and now applies it (`createFallbackPrincipalResolver`), matching `validate` (invariant 8) and the SSO case's `provisioned.enabled`. Not live-reachable (`admin.setEnabled` refuses to disable an owner) — it is depth against a direct `users.enabled = 0` write, and it matters because an un-credentialed `via:"fallback"` principal is what reaches EVERY owner- and admin-gated tRPC surface under `single-user`, not just the debug route. **The generalization: a uniformity claim ("all paths do X") is a claim about a SET, and it decays the moment a sibling tier grows a new member of that set — re-derive the census before trusting one, and write the census next to the claim so the next reader can check it instead of re-sweeping.**

## Consequences

The binder takes the resolver as a dep; `entry/lifecycle.ts`'s boot-seed Principal reads the row `seedOwner` just wrote. Only the fail-closed floor survives (`role:"user"` synthetics for role-irrelevant ops). The dedicated binder pins were deleted with the binder file and have no successor — re-pinning that invariant is owed. The fallback case's `enabled` gate now applies, matching `validate` and the SSO case.

## Alternatives rejected

Trust a uniformity claim ("all paths do X") without a census next to it (rejected: a uniformity claim decays the moment a sibling tier grows a new member of the set it claims to cover).
