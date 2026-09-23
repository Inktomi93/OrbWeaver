---
kind: adr
status: active
updated: 2026-09-23
---

# A mid-flight HAND EDIT and the turn's own state write RECONCILE; the reconciliation is a three-way REBASE of the round's PATCHES onto the hand head, and the hand row's AUTO-LOCKS are the arbiter

## Context

Not recorded in the ledger row.

## Decision

The human keeps every field they claimed, the turn keeps every field they did not, and data a round merely CARRIED can never resurrect a removal. Homes: `domain/rpg/snapshot-edit.ts` (`resolveHead`, `writeHandState`, `foldTurnWriteIntoHandHead`) · `domain/rpg/substrate/merge.ts` (`applyLockedPatch`, `rebasePatchOntoHead`) · `domain/rpg/chat-ops/flush.ts`.

**(A) THE RACE, AND WHY BOTH VICTIMS WERE REAL.** A flush resolves its write base at flush START and its state round then runs 0.8–2.9s, so a host hand-editing the panel inside that window writes a hand row stamped at the flushing turn's own slot — and by D124 a hand row OUTRANKS the turn row at the same seq (you edited on top of that beat). That ranking is CORRECT and stays. One race, two victims: the turn's writes were shadowed on every plane including the ones the human never touched, and — through a different door — the hand edit itself was clobbered.

**(B) THE IN-PLACE DOOR DEMANDS THE LADDER'S TURN STEP.** "An uncommitted turn row" does NOT mean "this turn's own draft", and the gap is reachable in ordinary play: while a round is in flight its slot has no snapshot yet, so the ladder's turn step comes back empty and the game-wide fallback walk answers with the PREVIOUS speaker's still-uncommitted draft at an EARLIER slot (the live shape is a group round — two assistants back to back, no `onUserCommit` between them). Editing that row in place put the host's edit where the in-flight flush's own row then outranked it, and it vanished silently, auto-lock and all. `inPlace` is now non-null ONLY for an uncommitted row that IS the ladder's turn step; everything else clones forward as a hand row, where the step protects it.

**(C) THE FOLD REPLAYS PATCHES, REBASED — never the composed state.** A turn's composed state is `preSlotBase + writes`, and the base half is STALE the instant a hand edit lands; folding the whole state re-asserted it over the human's gesture, and the REMOVAL verbs are where it bit (`dismissActor`/`deleteQuest` deliberately CLEAR the locks of what they removed — the symmetric grammar, a deleted element leaves no ghost lock — so nothing stopped the base's copy of a dismissed actor being re-inserted). Patches alone are still not enough: EVERY applier is a read-modify-write over its own base (the presence applier emits the whole `presentCharacters` + `actorState` arrays the moment the model mentions the scene), so a round that merely MENTIONED the scene carried the removed element back. `rebasePatchOntoHead` is therefore a three-way merge over base/patch/head across ARRAY planes only — multiset difference for flat arrays, the keyed-element grammar for keyed ones: what the round ADDED, CHANGED or REMOVED lands; what it merely CARRIED leaves the head's own contents alone. Records and scalars are deliberately left to the lock grammar.

**(D) THE ARBITER IS THE LOCK, AND IT WAS ALREADY LAW.** The hand doors auto-lock every field the hand touched precisely so a later model write can never overwrite it; each rebased patch is replayed with `applyLockedPatch` against the hand head's CURRENT locks, in the identical grammar and order the staging accumulator applied to compose them. **The fold rides `writeHandState`, so it derives INSIDE its own head resolve** — a hand edit landing between the check and the write is the base it replays onto (never a stale image), and one landing after produces a strictly later step that outranks the fold.

**(E) WHAT IS AND IS NOT FOLDED.** A NEWER hand head is still folded into (the state planes are cumulative and the round's patches are the newest MODEL knowledge whatever beat produced them; the human's locks arbitrate exactly as they do at the same beat). NOT folded: a flush for a slot that is no longer the story's current beat — a REGEN of an old message, whose row is legitimately superseded by the beats after it. Injecting an old beat's consequences into the present would be the resurrection bug wearing the fix's clothes.

**(F) EVERY LOSING CASE IS LOUD, AND THE OUTCOME IS TOTAL.** `TurnWriteFoldOutcome` is `head | folded | refused | shadowed`; EVERY case answers with the row that is actually head (including the two losing ones, where it is not the row this flush wrote — emitting our own id there points the panel at a row it cannot resolve), and both losing cases fire `onFlushDropped` with the distinguishing reason. `refused` is a merge attempted and rejected by the contract boundary; `shadowed` is a write that never had a merge to attempt — the case that had been staying silent while the turn's writes were erased.

**(G) TWO DECLARED LIMITS — boarded, defensible as-is, not defects to re-discover.** (1) **The removal-tombstone fork:** if the round's delta names the exact datum the human removed inside the window, the delta wins — dismissal CLEARS locks by design (so the model may reintroduce the thing later) and a cleared lock structurally cannot express "removed just now". The honest arbiter is RECENCY, and a tombstone needs a lifetime rule only the owner can set. (2) **The regen-vs-later-flush classification collision:** the fold's regen guard classifies "a later turn flushed while we were in flight" as a regen, silently; it is reachable only through lock-free `generate` concurrency (the flush barrier covers sequential sends) and closing it needs ladder state that does not exist today. Both are owner-timed design, not bugs.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
