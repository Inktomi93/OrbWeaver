---
kind: adr
status: active
updated: 2026-09-23
---

# what a chat's model is TOLD it can do is ONE per-turn collection, and `domain/<x>/teaching-contribution.ts` is the ratified 11th feature-root slot that feeds it

## Context

Not recorded in the ledger row.

## Decision

A `TeachingContribution` is `{id, order, collect(tctx) → Promise<{injections, toolNames}>}` (`domain/chat/contract/context.ts`); a domain declares its contributions in its root slot, `entry/compose` assembles them onto `ChatContext.teaching`, and `substrate/teaching.ts` folds them ONCE per turn in `buildTurnContext` — right after the rpg gather, whose result rides `tctx.rpgGather` so a contribution can see what the game already teaches. **Five clauses.** (a) **TEACH AND ATTACH TRAVEL TOGETHER:** `toolNames` is the ONE source of `attachedToolNames` (the union over contributions, deduped) — a contribution that tells the model about a tool is the same contribution that attaches it, so the two cannot drift; names resolve at ATTACH (`resolveTools` THROWS on an unknown name — a wiring bug, never model data), attach is capability-gated per turn (`tools_unsupported` drops), and AUTHORITY runs at execute. (b) **THE DOUBLE-TEACH GUARD is a mechanism, not a convention:** the fold collapses byte-identical injections (position + depth + role + content, first occurrence wins) ACROSS CONTRIBUTIONS ONLY — teach text has one home (`PROSE_SLOTS`), so two producers teaching the same `PROSE_SLOTS` text contribute one line; the chat's own `chat_injections` rows never pass through it, because a host may legitimately author two identical rows and this seam does not edit a human's canon. (c) **PLACEMENT RIDES THE EMITTED INJECTION, never the seam:** a contribution's `ChatInjection`s carry their own position/depth/role (preset template sections are where those are set and user-settable) — the collection and the contract bake no depth or role default. (d) **ORIGIN IS STAMPED BY THE PRODUCER:** chat's own order-0 contributor (the rpg-gather projection) stamps `game-state`; the injections merge (`substrate/assemble-gather.ts`) concatenates pre-stamped injections so a later contributor is accounted under its own budget source instead of being relabelled a game. (e) **ERRORS ARE NOT SWALLOWED** — a contribution that throws fails the turn (deliberately unlike the D50 prompt-transform seam's skip-and-warn: a transform edits a human's draft under a deadline, teaching IS prompt content, and a turn that silently omits it produces a wrong prompt that reads as a model failure). ENFORCEMENT, tiered honestly: the root slot is in the `feature-structure` gate's `ALWAYS_ALLOWED_ROOT_FILES` (two-sided — the entry ratchets down the day no domain occupies it); the dep-cruiser stanza `domain-teaching-contribution-compose-only` makes the owning domain's `index.ts` the ONLY legal importer, so the factory reaches a turn through the injected registry and never through an inline call; `ChatContext.teaching` is REQUIRED and non-nullable (the null-op default lives on the compose INPUT, `[...createChatTeachingContributions(), ...(input.teaching ?? [])]`) so no ctx can silently drop a game turn's state block. Pins: the fold's unit laws + the merged-array byte pins per game/cyoa case + the host-duplicate-rows-survive scope pin (`tests/server/domain/chat/substrate/teaching.{test,int.test}.ts`), the order-0 contributor's verbatim-and-stamped projection (`tests/server/domain/chat/teaching-contribution.test.ts`), and the attach matrix on a real send (`tests/server/domain/chat/verbs/turn.int.test.ts`, the R2 rows).

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
