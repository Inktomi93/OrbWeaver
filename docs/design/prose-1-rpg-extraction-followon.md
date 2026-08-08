# PROSE-1 — the rpg EXTRACTION seam (follow-on to the reminder-seam lane)

**Status:** brief material for a dedicated lane. Written by the RPG-PROSE lane (2026-08-07), which shipped the
per-GAME steering-REMINDER seam (census rows 1-10) + the `contracts/src/rpg/prose.ts` home + the `config.prose`
storage spine. This doc carries the classification + the core-shape decision the extraction seam needs so the
next lane does not re-run the census.

## What the reminder-seam lane shipped (so you don't redo it)

- `packages/contracts/src/rpg/prose.ts` — the `RPG_PROSE_SLOTS` table (census 1-10), mirroring the other
  domains' `prose.ts`. 11 slots: the 7 teaches (`names-only`) + cast/offstage headers + 2 delta headings
  (`none`). Re-exported from `#rpg`, composed into `PROSE_SLOTS` in `#prose`.
- `config.prose` on `rpgGameConfigSchema` (`proseOverridesSchema`, additive self-heal to `{}`), the
  `updateConfig.patch.prose` write arm, `LiteReminderInput.prose` + `DeltaContext.prose` threading, the
  `mergeConfig` keep-on-omit arm, and the `stripConfigForForker` HOST-PLANE classification (blanked to `{}`
  for a non-host fork — the `steeringNote` class).
- `resolveTeach` in `reminder.ts` — resolves each teach slot against `config.prose` and renders `names-only`
  macros (fast-path verbatim for macro-free defaults, so byte-identical). The cast header is dual-surface
  (reminder + `{{rpgCast}}`/`{{rpgSceneState}}` macro feed), threaded through `buildRpgMacroFeed` →
  `castBlock` → `castHeader`.
- `prose-baseline.json` regenerated (52 slots). Contract + reminder + delta + macro-view + config +
  update-config + fork suites extended and green.

**The `config.prose` storage the extraction seam needs is already built and proven.** This is exactly why
the spec (§9) sequences S4 after S3.

## Why the extraction seam is a SEPARATE lane (the fork the orchestrator ruled)

1. **Rows 11-27 are per-game RENDER-TEMPLATES, not text slots.** They are BUILT per game — `fragment:(ctx)=>…`
   in `EXTRACTION_PLANE_PROMPTS`, `buildRpgToolDescriptions(ctx)`, `partyExample(ctx)` — interpolating the
   game's own tracker defs by name/key/gloss (`packages/contracts/src/rpg/extraction-prompt.ts`). Migrating
   them needs the spec §4.5 `render(ctx)` slot shape, which is a **core-shape change to the SHARED
   `ProseSlotDef`** (`packages/contracts/src/prose-slot/index.ts`) — it touches every domain's table, the
   registry-completeness gate (`scripts/check/gates/no-hardcoded-model-prose.ts`, once its `scanRoot` widens),
   and the baseline-manifest mechanism (`gen-prose-baseline.ts` hashes `.text`; a render slot has no static
   `text`, so the hash target must change). That is an architecture decision, not lane-local judgment.
2. **The client preview surface is fenced.** §4.5's token-expansion live preview lives in
   `packages/client/src/features/rpg/**` (CLIENT-SMALLS territory) — the reminder-seam lane could not build it.
3. **Rows 28-36 share the extraction seam.** Migrating them without 11-27 ships a HALF-migrated seam
   (`compose/rpg.ts`'s `extractionSystem`/`toolRoundSystem` compose 28-36 AND 11-27 together), which the spec
   §9 and the constitution §4 forbid. So the whole extraction seam moves together.

## Core-shape decision the next lane must get RULED before building (§4.5)

`ProseSlotDef` today carries a static `readonly text: string`. A template slot needs, per §4.5, one of:

- **(a) a `render(ctx: ExtractionPromptContext): string`** on the slot (a discriminated union arm — `text` slot
  vs `render` slot), the override being a template string resolved against the SAME `ctx` through the macro
  engine with a slot-declared token vocabulary (`{{trackerCatalogue}}`, `{{gameTrackerCatalogue}}`,
  `{{partyExample}}`); OR
- **(b) keep the render function in the domain (`extraction-prompt.ts`) and make the slot carry only the
  static SCAFFOLD text + a token vocabulary**, with the domain interpolating.

Whichever arm: it changes (1) the baseline manifest (a render slot's hash target is the template SOURCE, not a
rendered string — `gen-prose-baseline.ts` + the contract test's `sha256(slot.text)` assumption), (2) the
registry-totality/no-dup-text contract invariants (they read `slot.text`), and (3) the gate's "prose-catalog
file" exemption + its second arm. **Recommendation: (a)**, because it keeps ONE resolver and lets the client
preview expand the tokens for a live game (the assembly-preview precedent). But it is an owner/architecture
call — escalate, don't guess.

## Row-27 owner decision — `RPG_STATE_TRACKING_GUIDE` is DEAD today (wire or delete)

`RPG_STATE_TRACKING_GUIDE` (`extraction-prompt.ts:421`) documents itself as *"Composed onto the write-surface
prompts (the tool round + the structured extraction)"* — verified again this lane: **`pnpm ast refs
RPG_STATE_TRACKING_GUIDE` returns only its own declaration.** It is composed onto nothing. Spec §11 owner
decision 6: **wire it** onto `extractionSystem` + `toolRoundSystem` as a slot, then measure (it is the
Appendix-A coverage lifter); if a probe shows no lift, **delete**. Either way it stops lying. This needs an
owner ruling before the extraction lane touches it.

## Classification — rows 11-36 (so the next lane doesn't re-census)

### Rows 11-27 (`contracts/src/rpg/extraction-prompt.ts`) — ALL render-templates or dead

| census | symbol | class |
| - | - | - |
| 11 | `DECEPTION_SURFACE_CLAUSE` | static text (deception-gated prefix) — the ONE plain-text slot here |
| 12 | `actorTrackerFragment` blocks | RENDER-template (interpolates writable actor tracker defs) |
| 13 | plane `scene` fragment | RENDER-template (mode-aware: dateMode/plotProgression branches, weather/time enums) |
| 14-18 | plane `party`/`inventory`/`trackers`/`quests`/`journal` fragments | RENDER-templates (tracker/journal-type interpolation) |
| 19 | RECONCILE tail on `composePlaneTeaching` | static text |
| 20-25 | the 6 tool descriptions in `buildRpgToolDescriptions` | RENDER-templates (per-game tracker vocab + worked examples) |
| 26 | `partyExample` worked example | RENDER-template (this game's tracker keys) |
| 27 | `RPG_STATE_TRACKING_GUIDE` | static text, **DEAD** (owner decision 6 above) |

`RPG_BASELINE_TOOL_DESCRIPTIONS` DERIVES rows 20-25 against the empty-config baseline (one home, two consumers)
— it needs no slot of its own.

### Rows 28-36 (`server/src/entry/compose/rpg.ts`) — mixed; migrate WITH 11-27 (same seam)

| census | symbol | class / disposition |
| - | - | - |
| 28 | `TRANSCRIPT_ROLE_FALLBACK` (`You`/`System`/`Narrator`) | STRUCTURAL labels (1 word each, §2.11) — recommend OUT |
| 29 | `EXTRACTION_SYSTEM_HEADER` | static text slot (`macros:"none"`, app-tier-ish — home per-game per §2.4) |
| 30 | `RECONCILE_PROMPT_LINE` | static text slot |
| 31 | the locked-paths line (`projectStateForModel`) | RENDER-template (interpolates `fieldLocks` keys) |
| 32 | the 3 user-prompt block labels (`RECENT STORY`/`CURRENT TRACKED STATE`/`LATEST BEAT`) | STRUCTURAL labels — recommend OUT |
| 33 | `refEnumerationLines` (6 line templates + closing rule) | RENDER-template (interpolates refs/tracker keys) |
| 34 | `toolRoundSystem` base | static-ish text but composed WITH 11-27 (the plane checklist) |
| 35 | `no_changes` tool description | static text slot |
| 36 | `FOLDED_RECONCILE_NOTE` | static text slot |

Rows 29/30/34/35/36 are plain-text slots; 31/33 are render-templates; 28/32 are structural labels (below the
gate's 12-word threshold — out, like §2.11's reminder labels). Because the SEAM composes all of these together
with 11-27, the extraction lane migrates the whole set in one pass (no half-seam).

## Coupled sites the extraction lane will hit (the ~7-site pattern + the seam extras)

- `#prose-slot` tuple + `#prose` compose + `contracts/rpg/prose.ts` (extend the existing table) + baseline regen.
- The `ProseSlotDef` render-arm (core shape) — see the decision above.
- `compose/rpg.ts`: `extractionSystem`/`toolRoundSystem`/`buildExtractionUserPrompt` thread `config.prose`
  (the config is already resolved in `resolveExtractionRefs` — §4.3 names the seam).
- `RPG_BASELINE_TOOL_DESCRIPTIONS` is built at MODULE LOAD against the empty config — a render-slot override
  has no meaning there (no game in scope), so the baseline consumer reads DEFAULTS only. Keep that invariant.
- The gate `scanRoot` widens to `rpg/substrate/**` + `compose/rpg.ts` + `contracts/rpg/extraction-prompt.ts`
  (`scripts/check/gates/**` is NODE26-GATE-fenced — coordinate).
- The client GM-console token-expansion preview (`features/rpg/**` — CLIENT-SMALLS-fenced).
- The live-drive bar (§10): edit an extraction template on a model-populated game, fire a turn, read the wire
  capture to confirm the override rode the extraction system prompt.
