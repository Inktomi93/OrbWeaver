---
kind: adr
status: active
updated: 2026-09-23
---

# The message-kind dispatch fan-out is committed

## Context

Split off [ADR 0129](0129-a-canon-row-s-purpose-is-a-declared.md), whose per-row purpose clauses pushed it over the 8 KiB ADR cap.

## Decision

**(G) THE DISPATCH FAN-OUT IS COMMITTED (not yet built).** Landed: the axis, the policy record, the DB shape, the two writers that stamp `narrator` (`postNarratorMessage` + the engine's narrator-round commit), and the memory dispatch. The SHAPE prompt-policy dispatch has since landed too (`entersPrompt`, `domain/chat/assembly/shape.ts`) — **amended, owner-ruled:** it runs BESIDE the bare `role === "system"` drop, not in place of it (`toShapeCanon`'s filter is `!(… || m.role === "system" || …) && entersPrompt(m.kind)`, both gates required). D32 keeps `system` the injection plane, but an ST import mints system-ROLE canon rows (`kit/serde/chat::roleOf` — `is_system:true`) that are `standard`-**kind**, and `CanonRow.role` is a two-case `user|assistant` union — the purpose-policy dispatch alone would admit those rows into a wire history that cannot represent them. Two planes, two gates; collapsing them would ship ST's assembly-dropped rows into every prompt. ~~Still owed, each a total Record / `assertNever` (§5.5): `applyNamesBehavior`, the client render chrome (which replaces the `narratorVoiced` inference), and the export/import serde cases.~~ **(TRUTH-REPAIRED, owner-authorized: all three have since LANDED — `domain/chat/assembly/names.ts::applyNamesBehavior`, the client kind chrome, and the export serde cases (`export-chat-bundle.ts`/`export-chat.ts`); the coupled-sites costing note below stays.)** **A new kind costs ~7 coupled sites** — tuple · policy row · shape dispatch · names dispatch · memory load · client chrome Record · serde cases — all tsc-forced but the serde cases.

## Consequences

The shape prompt-policy dispatch (`entersPrompt`) runs beside the bare `role === "system"` drop, not in place of it — both gates required, so an ST-imported system-role, standard-kind row cannot slip into wire history. A new kind costs about seven coupled sites, all tsc-forced but the serde cases.

## Alternatives rejected

Let the purpose-policy dispatch alone gate prompt entry (rejected: `CanonRow.role` is a two-case `user|assistant` union and cannot represent an ST-imported system-role row, so the dispatch alone would admit rows the wire history cannot carry).
