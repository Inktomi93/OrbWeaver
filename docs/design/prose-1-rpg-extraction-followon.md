# PROSE-1 — the rpg EXTRACTION seam (follow-on to the reminder-seam lane)

> **✅ LANDED 2026-08-08 (the EXTRACTION-SEAM lane).** Everything below is now HISTORY except where it is
> explicitly contradicted here. What shipped, and the three rulings that shaped it:
>
> - **40 slots**, census rows 11-26 + 29-36, in `contracts/src/rpg/prose.ts` under the `rpg.extract.*` id
>   namespace, mapped **1:1 onto the seam's existing `lines.push`/`return` sites** so absent-override byte
>   identity is checkable by inspection. Row 28 (`TRANSCRIPT_ROLE_FALLBACK`) and row 32 (the three user-prompt
>   block labels) stayed OUT as structural labels (§2.11), as this doc recommended. Row 27
>   (`RPG_STATE_TRACKING_GUIDE`) was **owner-DEFERRED** at S4 — see the ROW-27 banner immediately below, which
>   supersedes that and the "wire or delete" section further down.
> - **The §4.5 core-shape decision resolved to arm (a) WITHOUT widening `ProseSlotDef`.** The spec's own words
>   for arm (a) — "the override being a template string resolved against the SAME ctx … with a slot-declared
>   token vocabulary … the shipped default is expressed in that same vocabulary" — describe a mechanism that
>   already shipped: `resolveProseText(id, overrides, tokens)`'s PRE-SUBSTITUTION splice (the `{{note}}`
>   injection-frame precedent), with `requiredMacros` as the declared vocabulary. So a per-game TEMPLATE is an
>   ordinary `text` slot whose token VALUES the domain computes off `ExtractionPromptContext`. Consequently
>   **none** of the three coupled changes this doc predicted were needed: the baseline manifest still hashes
>   `.text`, the registry-totality/no-dup-text invariants are untouched, and no domain's `prose.ts` changed
>   shape. The ONE structural move: the precedence rule + the token splice moved DOWN into `#prose-slot` as
>   `resolveProseFrom` / `spliceProseTokens`, because `contracts/rpg/extraction-prompt.ts` cannot import
>   `#prose` (that closes the `#prose → #rpg → #prose` cycle the split exists to prevent). `#prose`'s
>   `resolveProse`/`resolveProseText` are thin delegates — still exactly one home for "which text wins".
> - **The threading fork resolved to BOTH arms, keyed by INVOCATION CLASS** (owner ruling, this lane):
>   a post-commit state ROUND rides the **captured** view (`RpgTurnContext.prose`, filled from
>   `prep.assembleContext.prose` — the arm this doc's §"Coupled sites" named); the two **HOST DOORS**
>   (`resyncFromStory`, `populateFromCharacter`) have no turn to capture from and resolve their OWN through a
>   new injected chat op `resolveChatPresetProse(chatId)`, the sibling of `resolvePromptUserMacros`. The op
>   walks the SAME ladder a turn walks (GM-preset redirect → owner-scoped preset read → `composeProse`), which
>   is the inherited-preview rule discharged. Both headers say, in as many words, that unifying the two arms
>   is the bug. The fold mount (`RpgBuildFoldedTurn.prose`) takes the gather's own resolution, so the folded
>   vehicle and the round it replaces teach one vocabulary structurally.
> - Reachability: a new `TemplateKind` `"extract"` (kicker **"State tracking"**) + 40 `TEMPLATE_DEFS` rows, so
>   the two-sided coverage test stays green and every slot is authorable in the preset Templates tab.
> - Ratchets: `prose-baseline.json` 52 → 92 slots; the `no-hardcoded-model-prose` baseline SHRANK
>   `extraction-prompt.ts` 30 → 3 and `compose/rpg.ts` 16 → 8. The residue is NOT census 11-36: it is the
>   POPULATE round's own prose (`POPULATE_SYSTEM_HEADER`, `POPULATE_DOCTRINE`, the identity clause), which
>   post-dates the `e0b9816d` census, plus the six host-facing REFUSAL sentences (toasts, not model prose) and
>   row 27. A follow-on census pass owns those.
> - **LANDED 2026-08-08 (the POPULATE lane).** That residue is gone: the populate census
>   (`prose-1-populate-census.md`) rows 1-7 are the `rpg.populate.*` cohort — 7 slots + 7 `TEMPLATE_DEFS` rows
>   under the `round` band — and the seam baseline shrank again, `extraction-prompt.ts` 2 → **0** (row dropped)
>   and `compose/rpg.ts` 8 → **6**. What remains at those two seams is host-facing refusal copy and structural
>   grammar, not model prose. Row 27 was WIRED the same day (`rpg.extract.stateTrackingGuide`).

**Status:** brief material for a dedicated lane. Written by the RPG-PROSE lane (2026-08-07), which shipped the
steering-REMINDER seam (census rows 1-10) + the `contracts/src/rpg/prose.ts` home. This doc carries the
classification + the core-shape decision the extraction seam needs so the next lane does not re-run the census.

> **⚑ RE-TARGETED 2026-08-08 — owner ruling, Nate live: "we are putting everything in presets."** The rpg prose
> HOME is the PRESET's `promptConfig.prose`, authored in the preset **Templates tab**. The per-GAME
> `config.prose` spine this doc was written against (config field · `updateConfig.patch.prose` arm · fork strip
> arm · the `"game"` member of `PROSE_HOMES`) is **DELETED** — the extraction lane must NOT re-create it.
> Everything below that says "per-game storage" now means: a slot row with `home:"preset"`, a `TEMPLATE_DEFS`
> row so it is reachable in the tab, and the overrides threaded in from CHAT (`GatherTurnContextArgs.prose`)
> rather than read off the game row.

## What the reminder-seam lane shipped (so you don't redo it)

- `packages/contracts/src/rpg/prose.ts` — the `RPG_PROSE_SLOTS` table (census 1-10), mirroring the other
  domains' `prose.ts`. 11 slots: the 7 teaches (`names-only`) + cast/offstage headers + 2 delta headings
  (`none`). Re-exported from `#rpg`, composed into `PROSE_SLOTS` in `#prose`.
- ~~`config.prose` on `rpgGameConfigSchema` + the `updateConfig.patch.prose` write arm + the `mergeConfig`
  keep-on-omit arm + the `stripConfigForForker` HOST-PLANE blank arm.~~ **ALL DELETED by the 2026-08-08
  re-home.** What SURVIVED and is what you build on: `LiteReminderInput.prose` + `DeltaContext.prose`
  threading (unchanged signatures — the builders never knew the source), fed from
  `GatherTurnContextArgs.prose`, which chat fills with `composeProse({ preset: promptConfig.prose })`. The
  fork's host-plane guarantee moved with the bytes: the copy lives in the GM preset, and `resolveForkGmPreset`
  already nulls a preset the forker cannot read.
- `resolveTeach` in `reminder.ts` — resolves each teach slot against the threaded prose and renders `names-only`
  macros (fast-path verbatim for macro-free defaults, so byte-identical). The cast header is dual-surface
  (reminder + `{{rpgCast}}`/`{{rpgSceneState}}` macro feed), threaded through `buildRpgMacroFeed` →
  `castBlock` → `castHeader`.
- `prose-baseline.json` regenerated (52 slots). Contract + reminder + delta + macro-view + config +
  update-config + fork suites extended and green.

**The storage the extraction seam needs is already built and proven — it is `promptConfig.prose`**, with the
threading seam (`GatherTurnContextArgs.prose` → `LiteReminderInput.prose`) and the Templates-tab reachability
(`TEMPLATE_DEFS` + the two-sided coverage test in `tests/contracts/prose/`) both landed. This is exactly why
the spec (§9) sequences S4 after S3.

## The re-home DROPS data, and that is sanctioned (2026-08-08)

Stated plainly so nobody re-derives it as a bug: any `rpg_games.config.prose` a host authored during the ~one
merge window the field existed (`fa8f944a0` → the re-home) is **GONE**. The field is deleted from
`rpgGameConfigSchema`, so zod strips the key on the next parse of a stored blob — no read, no migration, no
shim. Pre-launch NO-LEGACY: there is no production data and no upgrade path to owe. A host who edited a teach in
that window re-authors it in the preset Templates tab.

The stored bytes are inert rather than fatal — `tests/contracts/rpg/config.contract.test.ts` pins exactly that
("a stale stored `prose` key is stripped rather than fatal"), which is what makes the delete safe to do without
touching a single row.

## The preview path had to be fixed with it (2026-08-08, verifier REFUTED)

The re-home surfaced an OLDER defect it did not create. `chat/verbs/turn.ts` runs the GM-preset redirect
(`ctx.rpg.resolvePresetOverride`) before the foreign read; `resolvePreviewInputs` never did. So on a game chat
every preview surface rendered the HOST'S DEFAULT preset while the turn shipped the GM preset's — sections,
guided prompts, format strings, the turn-wire framings, all of it. It was invisible while the teaches lived in
`config.prose`, because that was ONE storage both paths read: preview and turn agreed by construction. Moving
the teaches to the preset put them on the unfaithful side.

`resolvePreviewInputs` now runs the same redirect, with an EXPLICIT `presetOverride` outranking it (the preset
editor asking "what would THIS preset render here" must still be answered). One fix, every preview surface.
**The extraction lane inherits the same rule:** whatever seam it picks to get preset prose into the post-commit
extraction round, the preview of that round must resolve it the same way, or the instrument lies again.

## Verifier F2 — "the prose write door has no READ door" — is DEAD (2026-08-08)

The RPG-PROSE verifier filed F2 against the shipped spine: `updateConfig.patch.prose` WROTE, and nothing read
the override back to a host — no `getConfigView` arm, no editor, zero client references to an `rpg.*` slot id.
"Host-editable" was true at the verb tier only, and the remedy it named was a host-gated `RpgConfigView.prose`
read arm plus a new GM-console surface.

**The re-home closed it without building either.** The overrides live in `promptConfig.prose`, and the PRESET
EDITOR is the read door: each of the eleven slots has a `TEMPLATE_DEFS` row, so the Templates tab lists it,
ghosts its shipped default, round-trips an edit through `proseTemplateDraft`/`normalizePresetProse`, and shows
the stale/missing-token footer — the same door the three turn-wire framings already used. The two-sided
coverage test in `tests/contracts/prose/index.contract.test.ts` REDs if a preset-homed slot ever loses its row,
so the "authored but unreachable" class F2 named cannot re-form silently.

**Do not build `RpgConfigView.prose`.** It would be the second door the ruling exists to prevent.

## Why the extraction seam is a SEPARATE lane (the fork the orchestrator ruled)

1. **Rows 11-27 are per-GAME-RENDERED templates, not text slots** (the override is authored on the preset; the
   RENDER interpolates the game's data — those are different axes, and the re-home changes only the first). They are BUILT per game — `fragment:(ctx)=>…`
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

## Row-27 — RULED **WIRE** and LANDED (owner, 2026-08-08); this section is now history

`RPG_STATE_TRACKING_GUIDE` (`extraction-prompt.ts`) documented itself as *"Composed onto the write-surface
prompts (the tool round + the structured extraction)"* and was composed onto **nothing** — `pnpm ast refs`
returned only its own declaration, twice verified. Spec §11 owner decision 6 (wire and measure, or delete) was
ruled **WIRE**. What landed:

- The constant is **deleted**, bytes and all, and re-authored VERBATIM as the `rpg.extract.stateTrackingGuide`
  prose slot (`contracts/src/rpg/prose.ts`, `home:"preset"`, `macros:"none"`, v1) — verbatim because the ruling
  was "wire and MEASURE", and a measurement against reworded text measures the rewording. Its Templates-tab row
  is **"Be thorough"** under the `extract` kicker ("State tracking"), so the host can retune it.
- It is pushed by **`composePlaneTeaching`**, not by the two system builders — the same one-home reason the
  RECONCILE doctrine rides there: the shared body is what both write surfaces walk, so the two arms cannot
  drift. Position: after the last plane fragment, **before** the reconcile rule, so "never fabricate numbers,
  items, or events the story does not show" is what closes the be-thorough push.
- Reach, by construction: the STRUCTURED extraction (`extractionSystem`), the CHEAP TOOL ROUND
  (`toolRoundSystem`) and with it the HOST RESYNC's catch-up round. It does **not** reach the populate round
  (whose counterpart doctrine is INVENT-NOTHING) or the folded turn's narration prompt — the exclusion its own
  doc-comment always claimed and never enforced.
- The `no-hardcoded-model-prose` ARM A baseline for `extraction-prompt.ts` **shrank 3 → 2**. ARM B never
  tracked this constant (ARM B scans CATALOG files; `extraction-prompt.ts` is a SEAM file) — the gate merely
  names it as the exemplar of the dead-catalog-prose class, and that class label outlives the constant.
- This is a deliberate **prompt-BYTES change**: the frozen-default fixtures in
  `tests/contracts/rpg/extraction-prompt.contract.test.ts` now carry the guide, with the ruling cited in the
  file header. Every other byte is still `e495855de`'s.

**The measure half is now possible and NOT yet done** — the guide rides the wire; nobody has run the A/B.

## Classification — rows 11-36 (so the next lane doesn't re-census)

### Rows 11-27 (`contracts/src/rpg/extraction-prompt.ts`) — ALL render-templates (27 was dead; wired 2026-08-08)

| census | symbol | class |
| - | - | - |
| 11 | `DECEPTION_SURFACE_CLAUSE` | static text (deception-gated prefix) — the ONE plain-text slot here |
| 12 | `actorTrackerFragment` blocks | RENDER-template (interpolates writable actor tracker defs) |
| 13 | plane `scene` fragment | RENDER-template (mode-aware: dateMode/plotProgression branches, weather/time enums) |
| 14-18 | plane `party`/`inventory`/`trackers`/`quests`/`journal` fragments | RENDER-templates (tracker/journal-type interpolation) |
| 19 | RECONCILE tail on `composePlaneTeaching` | static text |
| 20-25 | the 6 tool descriptions in `buildRpgToolDescriptions` | RENDER-templates (per-game tracker vocab + worked examples) |
| 26 | `partyExample` worked example | RENDER-template (this game's tracker keys) |
| 27 | `RPG_STATE_TRACKING_GUIDE` | static text, was DEAD — **WIRED 2026-08-08** as `rpg.extract.stateTrackingGuide` (see the ROW-27 section above) |

`RPG_BASELINE_TOOL_DESCRIPTIONS` DERIVES rows 20-25 against the empty-config baseline (one home, two consumers)
— it needs no slot of its own.

### Rows 28-36 (`server/src/entry/compose/rpg.ts`) — mixed; migrate WITH 11-27 (same seam)


| census | symbol | class / disposition |
| - | - | - |
| 28 | `TRANSCRIPT_ROLE_FALLBACK` (`You`/`System`/`Narrator`) | STRUCTURAL labels (1 word each, §2.11) — recommend OUT |
| 29 | `EXTRACTION_SYSTEM_HEADER` | static text slot (`macros:"none"`, app-tier-ish — home PRESET per the 2026-08-08 ruling) |
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
- `compose/rpg.ts`: `extractionSystem`/`toolRoundSystem`/`buildExtractionUserPrompt` need the PRESET prose,
  and this is the lane's REAL open problem — unlike the reminder (which rides the turn, where chat has already
  resolved `promptConfig`), the extraction round runs POST-COMMIT inside rpg, which has no preset reach. Do not
  re-open `config.prose` to dodge it. The two honest arms: resolve the game's `gmPresetId` through an injected
  chat op at round time, or capture the turn's composed prose on `RpgTurnContext` (which already carries the
  turn's resolved connection + consent for exactly this class of reason). ESCALATE the pick.
- `RPG_BASELINE_TOOL_DESCRIPTIONS` is built at MODULE LOAD against the empty config — a render-slot override
  has no meaning there (no game in scope), so the baseline consumer reads DEFAULTS only. Keep that invariant.
- The gate `scanRoot` widens to `rpg/substrate/**` + `compose/rpg.ts` + `contracts/rpg/extraction-prompt.ts`
  (`scripts/check/gates/**` is NODE26-GATE-fenced — coordinate).
- The client GM-console token-expansion preview (`features/rpg/**` — CLIENT-SMALLS-fenced).
- The live-drive bar (§10): edit an extraction template on a model-populated game, fire a turn, read the wire
  capture to confirm the override rode the extraction system prompt.
