---
kind: history
status: superseded
updated: 2026-07-13
---

# ST Feature-Map Archaeology Record

> **Frozen 2026-07-13, extracted from the ST feature-map pair** (`../core/Core-SillyTavern-Feature-Map.md` + `../core/Core-ST-Feature-Gap-Register.md`) during their de-archaeology pass. This holds the narrative those two docs shed: the 2026-06-28 audit provenance, the planning-snapshot essays, and the drift-correction ledger that has since been absorbed into the code + the PD registry. The live docs now carry only verified current-state tables. Nothing here is law — the closed-inventory DISPOSITIONS remain live in the register; only the STATUS narrative and the moot corrections are frozen here.

## 1. Audit provenance (the 2026-06-28 source-level sweep)

The register was compiled 2026-06-28 from a source-level audit: **5 parallel agents** reading ST's real `public/scripts/**` + orbweaver's `packages/**` + docs. Difficulty ratings were grounded in orbweaver's actual seams at that time. Nate's framing that closed the inventory: *"anything we identified is the sum total of what we would want."* That ruling is D49 and stays live in the register header; the audit mechanics are frozen here.

**Cold-read lineage (orientation, still true):** orbweaver is a maximal-rigor remake of *neo-tavern*, itself a remake of *ST*. Neo already cut ST down to a focused chat/character/memory engine, so most gaps were created at the **ST→neo** step — not new orbweaver deletions. This is why the register reads as "what neo dropped," not "what orbweaver refuses."

## 2. Drift-correction ledger (feature-map §5, absorbed)

The feature map carried a "Drift this map corrects" section pinned to 2026-07-01/03. Every item has since been absorbed into the authoritative sources; frozen here as the record of what was reconciled:

1. **imagery's PD flag = PD-93, not PD-54.** The ledger D49 #1 and Core-BUILD-PLAN §7.1 originally tagged imagery `FLAG[PD-54]`, but PD-54 is `tool-use` and PD-93 is imagery. The PD registry (`Core-Audits-and-Debt.md`) now carries PD-93=imagery / PD-54=tool-use correctly.
2. **The `proposed/<x>/` research dirs are gone.** Every "Promoted from `proposed/image-studio/`…`expression-stage/`…`media-surfaces/`…`databank/`…`tool-use/`" ref was a dangling path after promotion. As of 2026-07-13 all unscheduled design sets moved OUT of the repo (D66 eviction) and RETURNED to `../proposed/` the same day once code-verified (`proposed/INDEX.md`); built domains (imagery, gallery, tool-use, hub) have no doc — the code is the doc.
3. **Core-BUILD-PLAN over-listed "PD cleared by this phase."** It named PD-19/20/28/31/46 as chat-phase work while those were already in the cleared set. The build plan has since been slimmed to the phase-state table; cross-check the PD registry, not an inline list.
4. **Marinara is not ST and not in the closed inventory.** The RPG engine is COMMITTED (D58); the non-RPG borrows are decided (D59/D61). Evidence record: `Marinara-Residue-Non-RPG.md`. Nothing marinara awaits re-mining.
5. **The PD registry lagged the early Phase-7 landings.** PD-93 (imagery) and PD-55 (gallery v2) once read "not built" while the code was in-tree. The registry now matches the code.

## 3. Planning-snapshot essays (gap-register §7, stale)

The register's "The shape of it — cheap wins vs big lifts" was a pre-build prioritization snapshot. It is stale — most of its "cheap wins" shipped. Frozen verbatim as the planning record:

**Cheap / fits existing seams (MODERATE or less):** direct model providers (clean D39), sysprompt library, logprobs, translate, standalone caption, gallery, image-gen-in-chat, portrait modes, welcome screen, token-counter, tool-loop on agent-sdk, reasoning `<think>` parse.

**Big lifts / need a subsystem (PAINFUL/ARCHITECTURAL):** any text-completion backend (Horde/NAI/Kobold), expressions/sprites, TTS/STT, the Data Bank doc-store, local SD backends, backgrounds/BGM (VN layer).

**The pre-Phase-5 "now window" — CLOSED, both resolved as planned:** (1) the message-content block union + `MessageMedia` display model landed (D44) and vision INPUT landed as a born-compliant contract axis (D45: `ModelCapability.input.vision` + `ChatHistoryMessage.content` content-parts); (2) tool-calling ownership was decided before the pipeline was built — the chat DOMAIN owns the recurse loop (D48); the loop itself was the last Phase-5 chunk (PD-54, since closed 2026-07-04).

*Post-freeze reality check (2026-07-13):* most cheap wins shipped — direct providers (Anthropic-direct), welcome screen, gallery, image-gen-in-chat, tool loop (both paths), reasoning `<think>` parse, mainstream sampling knobs. Still open: sysprompt library, logprobs, translate, standalone caption, portrait modes, the standalone token-counter panel. The big lifts remain staged. Vision INPUT is the one over-claim: the D45 CONTRACT axis is born-compliant, but the per-backend translator + capability wiring were never turned on — it is not end-to-end functional.
