---
kind: adr
status: active
updated: 2026-09-23
---

# A canon row's PURPOSE is a DECLARED per-row fact (`messages.kind`), never inferred from role × attribution × the room's current config; and a row held out of the prompt is held out of every plane DERIVED from canon

## Context

Not recorded in the ledger row.

## Decision

Design: commit `09cd25525` §R1/§R2; owner rulings.

**(A) THREE ORTHOGONAL AXES, ONE HOME EACH.** DRIVE (who runs the seat) = `chat_participants.kind`; AUTHORSHIP (whose voice or hand it is) = the slot's attribution stamps + the per-chat name producer; PURPOSE (what sort of row it is) = `messages.kind`. Collapsing any two re-creates the overload this axis unwinds. The non-obvious constraint that forces the split: all three attribution FKs are `onDelete:'set null'` BY DESIGN (history preservation), so **attribution is designed to degrade and purpose must not** — deleting the synthetic group character or a user reclassified a narrator row into an indistinguishable standard one across render tint, speaker split, memory label and export, and a per-room `output` dial flip re-classified every historical row the instant it moved. Deliberately NO `agent` kind: an agent's room speech is `standard` + `authorUserId` (real canon, D60) and its out-of-band, unseated reaction is `comment`.

**(B) KIND NEVER DECIDES THE CANON `role`** (owner amendment to the design seed). Narrator rows stay `role:'assistant'` in canon; the "ship a narrator row as a wire `system` row on a capable model" mapping is a SHAPE-TIME dispatch on kind × capability, never a stored fact — otherwise canon stops being provider-independent. That mapping is COMMITTED (not yet built): rows stay assistant-voiced everywhere until a live wire probe sets the per-model capability fact, never a model-name regex (D69). **(BUILT. The capability fact `ModelCapability.turns.historySystemRows` + its ONE read `acceptsHistorySystemRows` (`@orb/contracts/inference` since the extraction, `@orb/contracts/connection` when this was written — the `coEmitsProseWithTools` precedent); the `(model × wire-shape)` derivation, which is CURATED DATA since that extraction: `packages/inference/src/capability/sources/curated/anthropic.ts` through `packages/inference/src/capability/sources/curated/loader.ts`; the SHAPE dispatch `assembly/shape.ts::deliveredRoleFor`/`toDeliveredRow`, total over `MESSAGE_KIND_POLICY[kind].prompt` with `assertNever`, running BESIDE the existing gates per (G); the live measurement `pnpm probe:history-system-rows` (`scripts/probes/history-system-rows.ts` — ACCEPTED × HONORED against an assistant-voiced control, declared-not-written: a human lands the measured cell in `packages/inference/src/capability/sources/measured/anthropic.ts`, the `silencesProse` seam). The cell is `false` for EVERY (model × wire-shape) today because nothing has been measured, so the wire is byte-identical to before. The dispatch is gated on the row still being ASSISTANT-voiced: the egocentric scoped fold rewrites another character's narrator row into a participant `user` line and deliberately keeps its kind, and a folded participant line does not belong in the operator channel.)** Kind also does not replace D55's synthetic group character — kind is purpose, attribution remains voice. **REVERSED (owner ruling, verbatim: "the cheap mode narrator that speaks for multiple characters does not write as system and should not") — the dispatch is deleted at `7bb5e3e4f`; narrator-kind rows deliver `assistant` on every wire, measured (tokenize before/after in the commit). The mid-array system CHANNEL survives for the injection splice only.**

**(C) ONE HOME, ONE POLICY RECORD.** `MESSAGE_KINDS` (`standard|narrator|comment`), `messageKindSchema`, `DEFAULT_MESSAGE_KIND` and `MESSAGE_KIND_POLICY` live together in `@orb/contracts/chat` (`chat/participants.ts`) beside the sibling role axis — NOT kit (no kit engine dispatches on it; `MESSAGE_ROLES` sits in kit only because the ST bimap needs it there, D32), and NOT the two-file `content-classes.ts` split (that split exists because ITS axis is kit-homed — do not "fix" this back). `MESSAGE_KIND_POLICY` is the ONE home for per-kind cross-plane behavior — `prompt: conversation|system-channel|never` × `memory: ingest|exclude` × `reading: show` — annotated `Record<MessageKind, …>` so a fourth member does not build until it declares its row, and every derived set (`MEMORY_INGEST_KINDS`) is FILTERED from it, never re-spelled. A new kind waits for its WRITER (D41's no-code-without-an-emit-site); `aside` is a NAMED DOORWAY, not minted. DB: `messages.kind` NOT NULL DEFAULT `'standard'` + the tuple CHECK (D34) + `messages_kind_shape` (`narrator ⇒ assistant`), landed on one squashed baseline (D124's regen posture).

**(D) HIDDEN MEANS HIDDEN EVERYWHERE DERIVED** (owner ruling). `excludedFromPrompt` gates MEMORY INGEST, not just compaction. The three exclusions — the `excludedFromPrompt` drop, the hidden-class SPAN strip (`projectBodyForSummary`, the D110 §3.6 class), and the kind filter — live at the ONE canon load `domain/chat/memory/persistence/queries.ts::loadCanonThroughSeq`, which every memory-derived artifact (digests, segments, the speaker joins, and therefore `{{memory}}` recall) comes through, rather than at N knob-reads downstream. Before it, a row the host had hidden FROM THE PROMPT was digested anyway and recall could re-surface its content into the very prompt it was held out of. The staleness machinery needs no help: hiding a row changes the block's content, so `blockHash` changes and the consolidation cascade re-derives.

**(E) THE ABSENT TRIGGER IS UNREPRESENTABLE, not merely loud.** `TurnTrigger` (`domain/chat/contract/foreign.ts`) is a REQUIRED two-case union — `{kind:"human", userId, personaId|null}` and `{kind:"none"}` — so "no triggering human" has exactly ONE spelling and binds `{{user}}` to the chat ANCHOR (D51 rider, D122), while a live human whose seat holds no persona is its own case taking the kit floor and NEVER the anchor. The superseded `personaIds[0]` fallback resolved a trigger-less read to the first PRESENT human's persona: join-order-nondeterministic, and on a host instrument a cross-member read (a preview could show another member's persona as `{{user}}`). Making the field REQUIRED rather than throwing on absence is the enforcement-ladder call (§2.2) — the missing state becomes unrepresentable instead of loud — and `personaIds` left `ResolveForeignInputsOp` rather than staying vestigial.

Split off for the 8 KiB ADR cap: variant raw content and freeze provenance [ADR 0216](0216-variant-raw-and-freeze-provenance-is-host-plane.md) and the message-kind dispatch fan-out [ADR 0217](0217-message-kind-dispatch-fan-out-committed.md).

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
