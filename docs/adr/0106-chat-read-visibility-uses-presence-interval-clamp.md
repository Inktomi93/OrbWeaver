---
kind: adr
status: active
updated: 2026-09-23
---

# Chat read visibility uses a presence-interval clamp

## Context

Not recorded in the ledger row.

## Decision

**Chat read-visibility: presence-interval clamp, two planes, one verdict.** The unit of visibility is the canon row (`messages.seq`); every derived artifact (event, live delta, summary, digest, variable delta) classifies by the seq-span of the canon it derives from; an artifact with no canon anchor (ids, counts, lifecycle, resume control, current variable values) is room-activity metadata and is NEVER clamped. Two planes: the ROOM plane (assembly, engine, compaction, arbitration, automation fact resolution, the all-chats firehose) reads full canon under host authority, unclamped BY TYPE; the VIEWER plane (any bytes toward a specific human) is clamped by that human's own floor. **Membership and visibility are one inseparable answer**: no verb, persistence read, injected op, or delivery gate may report chat membership without the floor — cross-domain consumers use chat's `resolveViewerVisibility` op; a membership-only visibility check in another domain is a defect (the plugin fan-out precedent, F1). The floor is derived in ONE home (`domain/chat/substrate/auth/clamp.ts::resolveHistoryFloorSeq`, minting the branded `HistoryFloorSeq`), stamped at the ONE chokepoint (`guard.ts::requireParticipant`), and projected exactly three ways: SQL `seq >= floor`; per-event `isBelowHistoryFloor` keyed on the closed anchor-carrier set (`view.seq` / `slotSeq` — a bus member carrying canon bytes MUST carry an anchor; the contract test pins the closed key vocabulary); per-span `spanWitnessed(span, [floor, ∞))` — the member floor and character witnessing share the ONE interval algebra `[joinSeq, leftSeq)` (join-INCLUSIVE — the member sees the row AT their joinSeq; founders are `joinSeq 0`). **Default visibility is `full`** (`chat_participants.joinHistoryVisibility`, `packages/db/src/schema/chat.ts`): an invited member reads the room's entire history by default; `from-join` is a host OPT-IN restriction, never the baseline (owner ruling — inviting someone into a group chat means they can see prior turns). The `from-join` clamp mechanism is complete (chokepoint + resolver + all three projections); the host-facing setter to opt a member INTO it is a separate, in-progress piece. **Authority implies visibility**: `role === "host"` resolves floor 0 (a handoff-promoted host is not viewer-clamped — the host commands the room-plane machinery). **The prompt is the room's; the transcript is the reader's**: turn assembly is deliberately unclamped — the floor is a transcript right, not a knowledge wall; real secrecy is a floored fork (a new room), never a per-reader prompt. On a floored fork, invisible history collapses into a visible present-state baseline (the compaction checkpoint for prose; the synthetic baseline standalone batch for variables) — never carried verbatim, never half-carried. Live and durable delivery MUST return one verdict for one seq (one emit = one logged + fanned row). Homes: clamp + resolver `substrate/auth/clamp.ts`; chokepoint `guard.ts`; matrix `substrate/auth/matrix.ts` (member-classified verbs may not call room-plane canon readers — the matrix-keyed gate); firehose `transport/trpc/chat-events-bus.ts` (importable only by the compose root); cross-domain op `resolveViewerVisibility` (compose-wired). Full ruling + findings: `docs/history/reviews/stickler/2026-07-25-join-history-visibility-model.md`.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
