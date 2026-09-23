---
kind: adr
status: active
updated: 2026-09-23
---

# Model-facing prose is a REGISTRY of slots with exactly ONE storage each, and a TEMPLATE homes on the PRESET

## Context

Not recorded in the ledger row.

## Decision

Owner ruling 2026-08-07, verbatim: *"templates need to have one home in presets not scattered between that and settings or hiding in code."* A TEMPLATE is authorable prompt TEXT — section templates, framings, wrappers — some of which passes through substitution; **templates are not macros** (owner correction, same day): the macro engine is not what this unifies. Homes: `@orb/contracts/prose` (the composed registry + `resolveProse`/`composeProse`) · `#prose-slot` (the slot shape + the closed id tuple) · the per-domain slot TABLES beside the vocabulary they teach (`#preset`, `#chat`, `#imagery`, `#automation`, `#discovery`).

**(A) THE REGISTRY IS THE MECHANISM.** Every string whose bytes reach a model is a SLOT: a shipped default plus the metadata its editor and its gate need. `PROSE_SLOTS` is annotated `Record<ProseSlotId, ProseSlotDef>` (a missing row is a tsc error at that line) and each table `satisfies Partial<Record<…>>` (an unlisted id is a tsc error too) — both directions, no drift. **Resolution is exactly TWO RUNGS: the override for this slot's own home, else the shipped default. There is NO cascade, on purpose.**

**(B) HOME IS PER-SLOT, AND THE SPLIT IS THE RULING.** A slot spliced into the MAIN turn's prompt homes on the PRESET (`promptConfig.prose`, authored in the preset Templates tab) — currently the two injection note frames, the continuation cue, and (F4 re-home, 2026-08-08 — the amendment below) the seven GROUP-ROUND framings; the tuple is the truth, not this list. Prose that resolves where **NO PRESET IS IN SCOPE** homes per-USER and resolves against the ROOM HOST: the side generations (arbiter, compaction, memory digest/consolidation, the recovery ask, the anchor identity lead-in) and the imagery templates whose `/imagine` door carries no preset at all — **\[\[D107]]'s imagery HOME RULING is unchanged**, and its reasoning is this clause's tie-break: preset-scoping a read with no preset in scope would be DISHONEST. That question — does this text resolve where a preset is in scope? — is the whole test for a new slot.

**(B-amendment) THE F4 RE-HOME (2026-08-08 — the group-round framings move USER → PRESET).** The stickler group-chat-coherence review (F4, `docs/history/reviews/stickler/2026-08-08-group-chat-coherence.md`) found this clause's original enumeration self-contradictory: it listed "the group-round framings" on the per-USER side as "side generations", but they are neither — the seven `chat.group.*` slots (the merged/narrator co-speaker headings `alsoPresent`/`characterHeading` — spelled `castMember` until the #1737 vocabulary rename of 2026-09-05, which re-keyed every stored override in a boot data migration — plus `scenarioHeading`/`exampleHeading`, the per-speaker/narrator round nudges `roundNudge`/`narratorNudge`, and the speaker-tag instruction `speakerTags`) are wrappers spliced into the MAIN turn's prompt, resolved during the turn's own context build (`composeProse` at `domain/chat/assembly/context.ts`) where `input.promptConfig` — the resolved preset — IS in scope. The clause's own test ("does this text resolve where a preset is in scope?") therefore answers YES for them, exactly as it does for the injection frames and the continuation cue of identical delivery class. Owner-ruled arm (a): re-home them to the PRESET. Pre-launch NO-LEGACY — clause (D) leaves any stale `UserSettings.prose` key inert, and each framing gains a Templates-tab row (a new `group` template kind, "Group rounds" kicker, the teach/extract surface-cohort precedent). This amendment does NOT touch the anchor-identity lead-in: the F4 review's arm-(a) sketch named it too, but the ruling as recorded on the board (retro-workboard RULINGS, 2026-08-08) is "group framings" — narrower on purpose — so `chat.assembly.anchorIdentity` stays USER-homed until re-ruled.

**(C) HARDCODED IS NOT A HOME.** A framing living as a source `const` is \[\[D107]]'s dead-switch class with an extra insult: it is unreachable without a redeploy. The founding instance is the continuation cue (`chat.assembly.continuationNudge`, D69's trailing cue) — the only sentence in a delivered prompt that nobody said, which is exactly why its wording is a preset's business.

**(D) A RE-HOME LEAVES ITS OLD KEY INERT, BY CONSTRUCTION.** `composeProse` merges the per-home blobs FILTERED TO THE SLOTS THAT ACTUALLY HOME THERE, which is what makes it a merge and not a cascade: a key can only survive from its own storage, so two homes carrying the same id cannot produce a precedence question — the wrong one is DROPPED, never "loses". That is what makes a re-home a NO-MIGRATION move under the pre-launch NO-LEGACY posture: an override written against a since-re-homed slot simply stops applying, and the host is TOLD rather than silently healed.

**(E) DEFAULT IDENTITY IS THE MIGRATION DISCIPLINE** (the imagery posture, D107): an ABSENT override MUST produce bytes identical to the pre-registry constant, asserted per slot — which is what makes every stage a no-op until a host actually types something. A BLANK override heals to the default at the READ (a blank frame would delete the injection it was supposed to wrap, and a read-side refusal would fail a whole preset to load over one empty string); the editors additionally drop the key on save, so the read-side heal is the belt.

**(F) EDITOR REACHABILITY IS DERIVED, NEVER HAND-LISTED.** `USER_PROSE_SLOT_IDS` and `PRESET_PROSE_SLOT_IDS` filter the registry by `home` (minus the legacy-ADAPTED slots, whose override is a pre-registry field and whose second door would be a duplicate), so a new slot reaches its editor in the commit it lands — the authored-but-unreachable class cannot re-form on the client side either.

**(G) COMMITTED (not yet built): the PROSE-COVERAGE GATE.** Nothing structural yet stops a new framing being born as a source `const`; that absence is precisely how the continuation cue sat un-slotted through a whole campaign, and the hiding-in-code arm regrows silently without it.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
