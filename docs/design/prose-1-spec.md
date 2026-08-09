# PROSE-1 — model-facing prose becomes host-editable data

**Status:** SPEC — not built, not approved. Owner ruling (`docs/retro-workboard.md:141-145`): *"prose shouldn't live in the code."* This document is the blueprint.
**Scope:** every piece of MODEL-FACING prose the server assembles into a prompt — the rpg teaches/licenses/headings, the extraction + tool-description templates, the chat nudge/voice templates, the app-tier side-generation prompts. It adds ONE registry (`packages/contracts/src/prose/`), TWO override storages (preset · user — the third, per-game, was retired by the 2026-08-08 ruling below), their edit surfaces, and ONE gate. It moves no verb, changes no wire protocol, and adds no table.
**Evidence:** a full literal sweep of `packages/{server,contracts,kit}/src` (long-string-literal scan, comment lines excluded, then hand-classified) — the census in §2 is that sweep, not the board's four-item lean (\[\[audit-lists-are-snapshots]]). Every row carries `file:line` at `e0b9816d`.
**Sibling work (written aware of it):** RV-13's *branch-and-save game modes* is deliberately sequenced AFTER this (`docs/retro-workboard.md:208-213`) — a mode fork is only worth forking once the slots exist. KNOB EDITORS (`:137-140`) is the numeric twin of §5 and shares the GM-console surface.

> **⚑ AMENDMENT — OWNER RULING 2026-08-08: THE PER-GAME HOME IS RETIRED. THERE ARE TWO STORAGES, NOT THREE.**
>
> Nate, live: *"we are putting everything in presets."* Every slot this spec classifies **per-GAME** — the
> reminder teaches/headings (rows 1-10, 28-36) AND the extraction templates S4 has not built yet (11-27) —
> homes on the **PRESET's `promptConfig.prose`** and is authored in the preset **Templates tab**. The ruling is
> the standing one already recorded at `packages/server/src/domain/chat/assembly/injections.ts` and D132
> ("templates have ONE home and it is PRESETS"); S3 shipped against the older per-game reading and was
> re-homed in the same week.
>
> **What actually changed on the tree** (`rpg_games.config.prose`, the `updateConfig.patch.prose` write arm,
> the `stripConfigForForker` blank arm, and the `"game"` member of `PROSE_HOMES`): **deleted**, no shim
> (pre-launch NO-LEGACY). The reminder/delta/macro-feed builders kept their signatures — chat resolves
> `promptConfig.prose`, composes it by home, and threads it on `GatherTurnContextArgs.prose` exactly as it
> threads `steerIdentity`. A game turn assembles its `gmPresetId`, so "this table's own copy" is authored on
> that table's GM preset, which is also what keeps a non-host FORK from resolving it (a preset the forker
> cannot read is nulled by `resolveForkGmPreset` — the guarantee the deleted strip arm used to give).
>
> Rows below still reading "per-GAME / `config.prose`" are corrected in place; where a row's REASONING was
> per-game (§3.2's "a horror game and a heist game want different deception copy"), the ruling's answer is
> that they want different GM PRESETS. Decision 7 is superseded outright.

---

## 1. Motivation — say it honestly

**The prose IS the product, and today only Nate can change it — by editing TypeScript and redeploying.** Three concrete costs, all measured on this tree:

1. **The prose is the highest-leverage tuning surface we have and it has no dial.** R4b measured a tracker gloss moving steering from Δ −0.12 to −1.00 (`packages/contracts/src/rpg/extraction-prompt.ts:55-58`). §4h measured the card-teach worked example taking a hosted model from drift to 10/10 rendered (`packages/server/src/domain/rpg/substrate/reminder.ts:82-88`). Every one of those wins was an agent editing a string constant. A host running a horror table who wants the deception teach to read differently has no move at all.

2. **A prose constant with no consumer is invisible.** `RPG_STATE_TRACKING_GUIDE` (`packages/contracts/src/rpg/extraction-prompt.ts:369`) documents itself as *"Composed onto the write-surface prompts (the tool round + the structured extraction)"* — `pnpm ast refs RPG_STATE_TRACKING_GUIDE` returns **1 hit: its own declaration**. It is composed onto nothing. That is exactly the "looked done and silently wasn't" disease the rebuild exists to kill, in the one place nobody thought to look. *(Census-time finding; resolved 2026-08-08 by decision 6 — see the row-27 line in §2.3 below.)*

3. **The pattern is already built — three times, inconsistently.** Imagery did the whole thing properly (shipped catalog in contracts + per-user override + one resolver + an editor that ghosts the default: `packages/contracts/src/imagery/index.ts:41`, `packages/contracts/src/settings/index.ts:596-603`, `packages/client/src/features/chat/components/imagery-templates-section.tsx:128`). Preset guided actions did it (`packages/contracts/src/preset/index.ts:358-369` + the editor at `packages/client/src/features/preset/components/guided-actions-section.tsx:148`). `formatStrings` did HALF of it — the schema has four keys (`packages/contracts/src/preset/index.ts:823-830`), the editor exposes two (`packages/client/src/features/preset/components/preset-structure-tabs.tsx:125,135`), `responseNudge` has no editor at all, and neither field ghosts its shipped default. Everything rpg-side did none of it. **PROSE-1 is not a new idea — it is finishing the one we already have, and making the unfinished version impossible.**

**The cost, stated up front:** every slot is a new thing a host can break. A host who deletes `{{input}}` from the impersonate nudge loses the measured voice-lock. §6 is the mitigation (required-macro lints, never blocks) and is not optional. Second cost: shipped-default revisions become a two-party problem — §4.4 is the answer, and "silently overwrite the host" is not it.

---

## 2. The census — every model-facing prose constant

Sweep method: all string/template literals ≥70 chars containing ≥8 spaces across `packages/{server,contracts,kit}/src`, comment lines excluded, then hand-classified by whether the bytes reach a model. **122 constants** in **17 files**. Line numbers at `e0b9816d`.

### 2.1 rpg — the steering reminder (per-PRESET since 2026-08-08)

| # | constant | file:line | reaches the model as |
| - | - | - | - |
| 1 | `RPG_STEERING_LICENSE` | `packages/server/src/domain/rpg/substrate/reminder.ts:62` | reminder tail, every game turn |
| 2 | `RPG_DECEPTION_TEACH` | `reminder.ts:70` | reminder, gated `features.deception` |
| 3 | `RPG_OFILTER_TEACH` | `reminder.ts:79` | reminder, gated `features.omniscience` |
| 4 | `RPG_CARD_TEACH_EXAMPLE` | `reminder.ts:89` | appended to both card teaches |
| 5 | `RPG_CARD_TEACH_ASK` | `reminder.ts:103` | reminder, gated `immersiveHtml` + `immersiveHtmlInteractive` |
| 6 | `RPG_CARD_TEACH_STATIC_ASK` | `reminder.ts:116` | reminder, the static M3 variant |
| 7 | `RPG_CYOA_TEACH` | `reminder.ts:111` | reminder, gated `features.cyoa` |
| 8 | `RPG_CAST_GUIDE_HEADER` | `reminder.ts:244` | the `Present:` header when a cast guide exists |

### 2.2 rpg — the delta block (per-PRESET since 2026-08-08)

| # | constant | file:line | reaches the model as |
| - | - | - | - |
| 9 | `RPG_DELTA_HEADING` | `packages/server/src/domain/rpg/substrate/delta.ts:31` | the diff block heading |
| 10 | `RPG_SCENE_OPENS_HEADING` | `delta.ts:34` | the first-snapshot heading |

### 2.3 rpg — the extraction plane-teaching registry (per-PRESET since 2026-08-08)

Home: `packages/contracts/src/rpg/extraction-prompt.ts`. Each fragment is a per-game TEMPLATE already (it interpolates the game's own tracker defs) — an override slot must therefore be a template too (§4.5).

| # | constant | file:line |
| - | - | - |
| 11 | `DECEPTION_SURFACE_CLAUSE` | `:48` |
| 12 | `actorTrackerFragment` blocks (resources · states · the not-every-actor rule) | `:86,:93,:96` |
| 13 | plane `scene` fragment (6 clauses: scene · keep-time-moving · weather · day/date · who-is-present · mood-is-a-short-read · emoji · plot) | `:109-156` |
| 14 | plane `party` fragment | `:164-167` |
| 15 | plane `inventory` fragment | `:177-180` |
| 16 | plane `trackers` fragment | `:192-196` |
| 17 | plane `quests` fragment | `:202-209` |
| 18 | plane `journal` fragment | `:217,:220,:223` |
| 19 | the RECONCILE tail on `composePlaneTeaching` | `:243-247` |
| 20 | `update_party` tool description | `:292-297` |
| 21 | `update_inventory` tool description | `:301-305` |
| 22 | `update_scene` tool description | `:311-322` |
| 23 | `set_tracker` tool description | `:326-329` |
| 24 | `upsert_quest` tool description | `:333-339` |
| 25 | `add_journal_entry` tool description | `:343-345` |
| 26 | `partyExample` worked example | `:267-279` |
| 27 | `RPG_STATE_TRACKING_GUIDE` | `:369-375` — was **DEAD** (`pnpm ast refs` found only the declaration); **RESOLVED 2026-08-08** by decision 6 = WIRE: the const is deleted and its bytes are the `rpg.extract.stateTrackingGuide` slot, pushed by `composePlaneTeaching` onto both write surfaces |

### 2.4 rpg — the extraction/tool-round system prompts (per-PRESET since 2026-08-08)

Home: `packages/server/src/entry/compose/rpg.ts`.

| # | constant | file:line |
| - | - | - |
| 28 | `TRANSCRIPT_ROLE_FALLBACK` (`You`/`System`/`Narrator`) | `:137` |
| 29 | `EXTRACTION_SYSTEM_HEADER` | `:194-200` |
| 30 | `RECONCILE_PROMPT_LINE` | `:206-209` |
| 31 | the locked-paths line | `:236` |
| 32 | the three user-prompt block labels (`RECENT STORY` · `CURRENT TRACKED STATE` · `LATEST BEAT`) | `:248,:252-254` |
| 33 | `refEnumerationLines` (6 line templates + the closing never-invent rule) | `:447,:453,:465-470,:474,:480,:482` |
| 34 | `toolRoundSystem` base (the plane-by-plane decomposition checklist) | `:650-662` |
| 35 | the `no_changes` tool description | `:708` |
| 36 | `FOLDED_RECONCILE_NOTE` | `:786-790` |

### 2.5 rpg — the registry tool descriptions (app-tier)

| # | constant | file:line |
| - | - | - |
| 37 | `roll_dice` description | `packages/server/src/domain/rpg/tools/index.ts:215` |

The other six registry descriptions read `RPG_BASELINE_TOOL_DESCRIPTIONS` (`tools/index.ts:104,124,141,159,175,197`) — they DERIVE rows 20-25 and need no slot of their own (one home, two consumers — `extraction-prompt.ts:350-363`).

### 2.6 chat — the nudge / voice templates (per-PRESET)

Home: `packages/contracts/src/preset/index.ts`.

| # | constant | file:line | override today |
| - | - | - | - |
| 38 | `OPENING_DEFAULT_PROMPT` | `:280` | `guidedActions.opening` ✅ |
| 39 | `CONTINUE_DEFAULT_PROMPT` | `:282` | `guidedActions.continue` ✅ |
| 40 | `RESPONSE_DEFAULT_PROMPT` | `:283` | `guidedActions.response`/`.swipe` ✅ |
| 41 | `IMPERSONATE_DEFAULT_PROMPT` | `:284` | `guidedActions.impersonate` ✅ |
| 42 | `REWRITE_DEFAULT_PROMPT` | `:286` | `guidedActions.rewrite` ✅ |
| 43 | `GREETING_REWRITE_DEFAULT_PROMPT` | `:294` | `guidedActions.greeting_rewrite` ✅ |
| 44 | `GREETING_NEW_DEFAULT_PROMPT` | `:296` | `guidedActions.greeting_new` ✅ |
| 45 | `DEFAULT_FORMAT_STRINGS.continueNudge` | `:650` | `formatStrings` ✅ editor ✅ |
| 46 | `DEFAULT_FORMAT_STRINGS.impersonateNudge` | `:659` | `formatStrings` ✅ editor ✅ |
| 47 | `DEFAULT_FORMAT_STRINGS.responseNudge` | `:665` | `formatStrings` ✅ **editor ✗** |
| 48 | `DEFAULT_FORMAT_STRINGS.wiFormat` | `:666` | `formatStrings` ✅ editor ✅ (`section-body-editor.tsx:211`) |
| 49 | `DEFAULT_COMPACT_INSTRUCTIONS` | `:670` | `promptConfig.compaction.instructions` ✅ — SLOTTED `preset.compaction.instructions` (adapted, 2026-08-07); the earlier "✗" was stale (already overridable) |
| 50 | `DEFAULT_MARKER_TEMPLATES.compact_summary` | `:698` | per-section `template` ✅ |
| 51 | `DEFAULT_MARKER_TEMPLATES.memory` | `:699` | per-section `template` ✅ |
| 52 | `DEFAULT_PROMPT_CONFIG` `main_prompt` template | `:967` | per-section `template` ✅ |
| 53-59 | the 7 Rewrite-modal toggle sentences | `preset/prose.ts` `PRESET_REWRITE_TOGGLE_PROSE_SLOTS` | `promptConfig.prose` ✅ editor ✅ — SLOTTED `preset.rewriteToggle.*` (the templating fork's ARM B, owner 2026-08-09: the catalog row now carries a `slot` pointer, the bytes live in the slot table, the wire carries the picked KINDS) |
| 60-73 | the 14 greeting-studio transform sentences | `preset/prose.ts` `PRESET_GREETING_TRANSFORM_PROSE_SLOTS` | `promptConfig.prose` ✅ editor ✅ — SLOTTED `preset.greetingTransform.*` (same ruling) |

### 2.7 chat — the app-tier side-generation prompts

| # | constant | file:line |
| - | - | - |
| 74 | `ANCHOR_IDENTITY_PREFIX` | `packages/server/src/domain/chat/assembly/context.ts:521` |
| 75 | arbiter `SYSTEM_PROMPT` | `packages/server/src/domain/chat/engine/smart-arbitrate.ts:56-59` |
| 76 | arbiter user prompt | `smart-arbitrate.ts:131` |
| 77 | `COMPACTION_SYSTEM_PROMPT` | `packages/server/src/domain/chat/verbs/compaction.ts:67-70` |
| 78 | `DIGEST_SYSTEM_PROMPT` | `packages/server/src/domain/chat/memory/build/substrate/prompts.ts:7-15` |
| 79 | `digestUserPrompt` | `prompts.ts:19` |
| 80 | `CONSOLIDATION_SYSTEM_PROMPT` | `prompts.ts:23-29` |
| 81 | `consolidationUserPrompt` | `prompts.ts:34` |

### 2.8 imagery — the solved precedent (app-tier, per-USER)

| # | constant | file:line | override today |
| - | - | - | - |
| 82-85 | `DEFAULT_PROMPT_TEMPLATES` × 4 | `packages/contracts/src/imagery/index.ts:41-65` | `UserSettings.imagery.templates` ✅ editor ✅ |
| 86-87 | `DEFAULT_CAPTION_INSTRUCTIONS` × 2 | `imagery/index.ts:70-79` | `UserSettings.imagery.captions` ✅ editor ✅ |
| 88 | `DEFAULT_NEGATIVE` | `packages/server/src/domain/imagery/substrate/templates.ts:37-40` | ✗ (user `negative` APPENDS, never replaces) |
| 89 | `REQUIRED_PREFIXES` × 6 | `templates.ts:24-31` | ✗ — **out of scope**, §3.3 |
| 90 | `generate_image` tool description | `packages/server/src/domain/imagery/tool/index.ts:40-42` | ✗ |

### 2.9 automation

| # | constant | file:line |
| - | - | - |
| 91 | `buildAutobgPrompt` (4 clauses incl. the reply-with-only-the-name contract) | `packages/server/src/domain/automation/engine/arm-executors.ts:240-249` |

### 2.10 Out-of-scope classes (enumerated for the gate's cited allowlist)

| # | constant | file:line | why out |
| - | - | - | - |
| 92-107 | `SCOPE_INSTRUCTIONS` × 8 scopes × 2 (`query`/`rerank`) | `packages/server/src/domain/search/substrate/instructions.ts:18-51` | EMBEDDER task hints, not authorial voice — §3.3 (owner decision 4) |
| 108-114 | `GUIDED_GAME_STEERS` templates × 7 | `packages/kit/src/guided/index.ts:100-113` | macro-neutralized TRUSTED templates fired by enum kind — §3.3 (\[\[guided-steer-macro-neutralized]]) |
| 115-122 | packaged `rpg-gm` preset sections × 8 | `packages/server/src/domain/preset/contract/packaged.ts:40,51,70,84,94,104,115,125` | ALREADY data: seeded rows, cloned into the caller's library and freely edited (`verbs/clone-packaged.ts`) |

### 2.11 The count

| bucket | slots |
| - | - |
| total model-facing prose constants | **122** |
| in scope for PROSE-1 | **91** (rows 1-91) |
| out of scope / already-data | **31** (rows 92-122) |
| of the in-scope: already have an override path | **18** (rows 38-48, 50-52, 82-87 — imagery 6 + guidedActions 8 + formatStrings 4) |
| **net-new slots this spec creates** | **73** |

Structural LABELS are deliberately not counted and are out of scope: `Party:` (`reminder.ts:375`), `Present:` (`:264`), `Game trackers:` (`:385`), `Active quests:` (`:389`), `Recent beats:` (`:393`), `Scene:` (`:354`), `Story:` (`:359`), `Trackers:` (`:169`), `Attributes:` (`:373`), `# Game state` (`:398`), `HP`/`carrying:`/`conditions:` (`:180-192`). They are the reminder's GRAMMAR, not its voice: the delta renderers, the macro feed (`chat-ops/macro-view.ts`) and the model's own learned shape key off them, and editing one buys a host nothing. Under the §7 gate they fall below the word threshold and never trip it.

---

## 3. Classification — three homes, one home each

### 3.1 The rule: a slot has EXACTLY ONE home. Never a cascade.

A slot is per-game OR per-preset OR per-user. There is no "game overrides preset overrides user" ladder. Resolution is always exactly two deep: **the override for this slot's home, else the shipped default.** A cascade would recreate the settings-tier debugging class (`Spine-Config-and-Serialization.md` §"Settings / config" already carries four env natures; a fifth ladder over prose earns nothing) and would make "which layer wrote this sentence?" a live support question. Rejecting it now is the whole reason the resolver in §4.3 fits in six lines.

### 3.2 The classification

| class | home | storage | why | census rows |
| - | - | - | - | - |
| ~~**per-GAME**~~ **RETIRED 2026-08-08** — these rows are per-PRESET (see the amendment above). The original reasoning ("a horror game and a heist game want different deception copy, and they may share a preset") is answered by giving them different GM PRESETS: a game already redirects to its own `gmPresetId`. | | | | 1-36 |
| **per-PRESET** | `promptConfig.prose` + the existing `formatStrings`/`guidedActions` | the existing preset blob (COW-forked, versioned) | voice/nudge prose is a property of the PRESET — this is exactly ST's `assistant_impersonation` precedent, which we already import (`preset/index.ts:1502-1506`) | 38-73 |
| **per-USER (app-tier)** | `UserSettings.prose` | the existing user-settings blob | a side-generation prompt (summarizer, arbiter, memory digest) is a property of how YOU run the app, not of one table or one preset — and imagery already proved the shape | 37, 74-91 |

### 3.3 Explicitly NOT in scope (with the reason each stays code)

1. **`GUIDED_GAME_STEERS` — the wand's plot steers** (`packages/kit/src/guided/index.ts:100-130`). These are the macro-neutralized TRUSTED-TEMPLATE arm: the wire carries only an enum KIND, and the template resolves through the FULL macro engine server-side (`chat/assembly/context.ts:489-492`). A MEMBER fires the wand. Making the template host-editable would put full `{{setvar}}`/`{{expr}}` macro power behind a member-fired path — a genuine widening of a trust boundary for a feature nobody has asked for. Stays code; revisit with RV-13's mode fork (owner decision 3).
2. **Security-relevant strings.** Anything whose bytes are a defense, not a voice: `neutralizeMacros`' ZWSP handling, the `{{person}}`/`{{base}}` pre-substitution tokens (`kit/guided/index.ts:144-145`), `REQUIRED_PREFIXES` + `ensurePrefix` (`imagery/substrate/templates.ts:24-31,50-58` — a drift BELT that re-asserts a size-preset contract; a host editing it silently breaks image dimensions), `FORBIDDEN_KEYS` (`preset/index.ts:531`). None of these are prose.
3. **`SCOPE_INSTRUCTIONS`** (`search/substrate/instructions.ts:18-51`). E5/BGE/Qwen3-reranker `Instruct:` prefixes tuned to an embedder FAMILY, with a no-op knob for families that ignore them. A host edit degrades retrieval silently, with no visible feedback loop and no way to A/B it. Owner decision 4 — recommendation: out.
4. **Structural labels** — §2.11.
5. **Error/log/diagnostic messages.** The sweep surfaced \~180 of these (`assets/substrate/mime.ts`, `chat/engine/engine.ts:1304-1312`, …). They face an operator, never a model. The gate exempts them structurally (§7.2), not by allowlist.

---

## 4. The data model

### 4.1 The slot registry — one home, per-domain tables

```
packages/contracts/src/prose/index.ts        # the shape, the merged registry, resolveProse, PROSE_SLOT_IDS
packages/contracts/src/rpg/prose.ts          # the rpg slot table, PRESET-homed (census 1-36)
packages/contracts/src/preset/prose.ts       # the per-PRESET slot table (census 38-73)
packages/contracts/src/chat/prose.ts         # the app-tier chat slot table (census 74-81)
packages/contracts/src/imagery/index.ts      # already holds its table (census 82-90) — adapted in place
```

Per-domain tables live BESIDE the vocabulary they teach (the `EXTRACTION_PLANE_PROMPTS` precedent — `extraction-prompt.ts:1-14`: home the fragment WITH its plane, so a plane cannot be schema-writable and prompt-silent). `contracts/prose` imports them and composes ONE `PROSE_SLOTS`. Cake-legal: all four are `contracts`; `server` and `client` read DOWN.

```ts
/** One model-facing prose slot: the shipped default + everything the edit surface and the gate need. */
export interface ProseSlotDef {
  readonly id: ProseSlotId;
  readonly home: ProseHome;                 // "preset" | "user"  (the "game" member is RETIRED, 2026-08-08)
  /** Bumped in the SAME commit as any `text`/`render` change — pinned by the manifest (§4.4). */
  readonly version: number;
  /** The shipped default. A per-game TEMPLATE slot supplies `render` instead (§4.5). */
  readonly text: string;
  /** Macro context this slot resolves under — §6. */
  readonly macros: ProseMacroMode;          // "none" | "names-only" | "full"
  /** Macros whose ABSENCE from an override is a lint (never a block) — §6.3. */
  readonly requiredMacros: readonly string[];
  /** Editor copy: what this slot is and when it fires (the imagery-card `fires` precedent). */
  readonly title: string;
  readonly fires: string;
}
```

`ProseSlotId` is a closed tuple → `Record<ProseSlotId, ProseSlotDef>` totality (the `RUNNERS` gold standard, `Spine-TypeScript-and-Patterns.md` §"String-union dispatch discipline"). A new slot without a row fails `tsc`; a row without a tuple member fails `tsc`.

### 4.2 Override storage — two additive fields, zero new tables (was three; the game field is retired)

| home | field | schema |
| - | - | - |
| preset | `promptConfig.prose` | same shape on `promptConfigSchema` (`packages/contracts/src/preset/index.ts:849`); the EXISTING `formatStrings`/`guidedActions` fields stay where they are and are ADAPTED as slots (§4.6) — never duplicated |
| user | `UserSettings.prose` | same shape, a new section beside `imagery` (`packages/contracts/src/settings/index.ts:823`) |

```ts
export const proseOverrideSchema = z.object({
  text: z.string().max(PROSE_MAX_CHARS),
  /** The slot `version` this edit was made against — the staleness signal (§4.4). */
  baseVersion: z.number().int().positive(),
});
```

All three are ADDITIVE defaulted fields on existing JSON blobs. rpg self-heals at its parse seam with no version stamp (`config.ts:1-6` — rpg tables carry no versioned column); preset and user settings ride `defineVersionedConfig` (`packages/contracts/src/versioned-config/index.ts:46`) and get one lift each, carrying every namespace through untouched (the `v5→v6` imagery lift is the model — `settings/index.ts:934-936`).

`PROSE_MAX_CHARS = 4000`, mirroring `IMAGERY_TEMPLATE_MAX_CHARS` (`settings/index.ts:565`) — an instruction is a paragraph, not an essay.

### 4.3 Resolution — host edit > shipped default, two deep

```ts
export function resolveProse(id: ProseSlotId, overrides: ProseOverrides): ProseResolution {
  const slot = PROSE_SLOTS[id];
  const override = overrides[id];
  if (override === undefined) {
    return { text: slot.text, source: "default", stale: false };
  }
  return { text: override.text, source: "override", stale: override.baseVersion < slot.version };
}
```

`ProseOverrides` is the ONE record type all three storages produce, so the resolver is home-agnostic and there is exactly one place the precedence rule lives. **Default-identity discipline (the imagery posture, `settings/index.ts:592-598`): an absent override MUST produce bytes identical to today's constant.** That is not a nicety — it is what makes every migration stage a no-op until a host actually types something, and it is a test (§10).

The caller thread per home:

- **game** → the gather already reads the config; `LiteReminderInput` gains `readonly prose: ProseOverrides` beside `features` (`packages/server/src/domain/rpg/contract/params.ts:328-332` — the "pass the slice whole" rule the feature knobs already follow). `entry/compose/rpg.ts` reads it off the `resolveExtractionRefs` config it already resolves (`:357-359`).
- **preset** → `assembleContext.promptConfig` is already threaded everywhere the nudges resolve (`chat/verbs/turn.ts:161`).
- **user** → `deps.loadUserSettings(caller.userId)`, exactly as imagery does at `entry/compose/imagery.ts:146-147`.

### 4.4 The upgrade story — we change a default under a host's override

**Rule: a host override is NEVER silently replaced, and a host is NEVER silently left on a stale copy.**

1. Every shipped default carries a `version`. Revising `text` REQUIRES bumping `version` in the same commit.
2. That requirement is a MECHANISM, not a discipline: a checked-in manifest `packages/contracts/src/prose/prose-baseline.json` pins `{ id → { version, sha256(text) } }` for every slot, regenerated by `pnpm prose:baseline` (the `gen-test-baseline-manifest.ts` precedent, `scripts/check/gen-test-baseline-manifest.ts`). A contract test recomputes the hashes and fails when a slot's text changed without its version bumping. Forgetting the bump is impossible, which is the only reason the staleness signal can be trusted.
3. Resolution ALWAYS returns the override. A revised default never lands behind a host's back.
4. The edit surface renders a **stale** affordance when `override.baseVersion < slot.version`: a quiet chip on the field, the new shipped text ghosted beneath it, and a "take the new default" button (which clears the override) plus a "keep mine" (which re-stamps `baseVersion` to current and dismisses). Both are one click; neither is automatic.
5. A slot whose default is DELETED (the feature retired) is a lift on that home's blob: drop the key. Pre-launch NO-LEGACY — no deprecation arm.

### 4.5 Template slots — the per-game prose that is already a function

Rows 12-26 are not constants; they are BUILT per game (`buildRpgToolDescriptions(ctx)` interpolates this game's tracker defs by name and gloss — `extraction-prompt.ts:251-262`, and R6 ruled they MUST be templates: *"a static `poolDeltas: spend/restore named pools like Mana/Stamina` teaches a vocabulary this game may not have"*). A slot for one of these carries `render(ctx: ExtractionPromptContext): string` instead of `text`, and the override is a template string resolved against the SAME context through the macro engine, with a slot-declared token vocabulary (`{{trackerCatalogue}}`, `{{gameTrackerCatalogue}}`, `{{partyExample}}`) that the render helper exposes. The shipped default is expressed in that same vocabulary, so "reset to default" is byte-exact and the editor can show the host what the tokens expand to for THIS game (a live preview — the assembly-preview precedent, `preset/components/preset-structure-tabs.tsx:100`).

This is the one genuinely new machinery in the spec, and it is why §9 puts these slots LAST.

### 4.6 Adapting the 18 slots that already have an override path

`formatStrings`, `guidedActions` and `UserSettings.imagery` keep their storage shape and their field names — the wire, the ST import mapper (`preset/index.ts:1502-1551`) and the existing editors are untouched. They gain a slot ROW each, and their resolvers are re-pointed at `resolveProse` so precedence, staleness and the required-macro lint come from ONE place. Concretely: `turn.ts:161`'s `?? DEFAULT_FORMAT_STRINGS[key]` and `settings/index.ts:596-603`'s two `??` fallbacks become `resolveProse` calls; their slot's storage adapter reads the legacy field. **No duplicated home** — the slot's `read`/`write` adapter names the existing field, it does not add `prose.impersonateNudge` beside `formatStrings.impersonateNudge`.

---

## 5. The edit surfaces

Three surfaces, each already exists in some form; each gets the same three affordances.

**The three affordances (identical everywhere — this is the point):**

1. **Ghost the shipped default as the field's `placeholder`.** Empty field = "use the built-in." Already correct in imagery (`imagery-templates-section.tsx:128`) and guided actions (`guided-actions-section.tsx:148`); **missing on the two `formatStrings` nudge fields** (`preset-structure-tabs.tsx:125-142`) — fix in S2.
2. **A `Default`/`Customized` state line + the required-macro lint.** Exists for guided actions (`guided-actions-section.tsx:191-207` → `guidedFooterState`, `preset/lib/assembly-model.ts:151-156`). Generalize `guidedFooterState` into the shared footer every prose field renders.
3. **Reset = clear the field.** The write path sends `undefined` for a cleared field so removing an override actually resets (`chat/lib/imagery-templates-model.ts:34-43` — that comment is the whole contract). Plus the §4.4 stale affordance.

| home | surface | where |
| - | - | - |
| **game** | the GM console, a new `Prose` collapsed section under the existing scalar form | `packages/client/src/features/rpg/components/rpg-game-tab.tsx` + a sibling of `rpg-gm-scalars.tsx` (autosave entity form, `createAutosaveEntityForm` — `rpg-gm-scalars.tsx:53-56`). Writes through the ONE config door `rpg.updateConfig` (`packages/contracts/src/rpg/inputs.ts:46-91`) |
| **preset** | the Prompt tab, beside Guided actions | `packages/client/src/features/preset/components/guided-actions-section.tsx` (extend) + `preset-structure-tabs.tsx` (add the missing `responseNudge` field). Edits on the system default COW-fork exactly as today (`packages/server/src/domain/preset/verbs/update.ts:40-73`); `resetToDefault` (`verbs/reset-to-default.ts`) already clears the whole config |
| **user** | a `Prose` settings section, sibling of the imagery templates section | `packages/client/src/features/chat/components/imagery-templates-section.tsx` is the template to clone (its card list is data — `:60-66`); the new section registers per `SET-SEAMS` (`docs/retro-workboard.md:85`) and owns its read+write test (\[\[settings-section-seam-body-only]]) |

**Host-only, all three** (owner decision 1). The GM console is host-gated already; `updateConfig` is a host verb (`contracts/rpg/inputs.ts:43`). A preset is per-user. `UserSettings` is per-user. There is no member-editable prose in v1 — see owner decision 8 for the multi-human consequence.

---

## 6. Macro interaction

### 6.1 Which prose resolves macros, and with what power

| slot class | mode | engine path | why |
| - | - | - | - |
| per-PRESET rpg teaches (1-10, 28-36) | `names-only` | `resolveGuidedInstruction` + `createNamesOnlyRegistry`, exactly as `renderSteeringNote` does today (`reminder.ts:428-449`) | a host teach reaches EVERY member's turn; `{{user}}`/`{{char}}` are the whole ask, and `{{setvar}}`/`{{expr}}`/injection macros are not (the steer-neutralization ruling the steering note already obeys) |
| per-PRESET rpg extraction templates (11-27) | slot-token vocabulary only (§4.5) | the render helper's token expansion | the tokens ARE the game's own tracker vocabulary; a general macro engine has nothing to add and the extraction prompt is not a character context |
| per-PRESET nudges/guided (38-52) | `full` | `resolveNudgeText` (`chat/assembly/macros.ts:237`) / `resolveGuidedInstruction` — UNCHANGED | already full-power today; the user steer is neutralized as `{{input}}` before it lands, which is the actual boundary |
| per-PRESET rewrite/greeting fragments (53-73) | `none` | plain string join in `composeRewriteSteer` (`kit/guided/index.ts`), run SERVER-side since the ARM B ruling (chat assembly / the greeting verbs) | fragments are composed INTO `{{input}}` and therefore neutralized downstream — a `{{user}}` in a fragment renders as literal braces. The slot's `macros: "none"` makes it a typed fact instead of a comment, and the contract test asserts the BYTES obey it |
| app-tier (74-91) | `none` | — | a summarizer/arbiter/digest prompt runs over a transcript, not a character context. A `{{…}}` in an override ships verbatim |

Threading follows \[\[identity-macro-resolution-is-chat-owned]] (Ruling B): chat owns identity-macro resolution and DOMAINS THREAD VALUES. rpg does not learn a macro registry — the reminder already receives `steerMacros: { user, char }` as data (`contract/params.ts:315-321`) and the teaches ride that same binding.

### 6.2 The identity binding a teach gets

Same as the steering note: `user` = the triggering human's ACTIVE persona name, `char` = the game's protagonist. Absent binding ⇒ verbatim (the byte-identical path a test-caller takes today).

### 6.3 Voice-lock drift guards

`requiredMacros` on the slot def, rendered as a WARN in the editor footer — never a block, never a server-side rejection. Concretely:

- `impersonateNudge` requires `{{user}}` and `{{char}}` (`preset/index.ts:652-658` records the measurement: the voice-lock held 6/6 on the weak 8B, and the previous bare `write as the user` let it ramble back into the character's voice). A host who drops `{{user}}` is warned that impersonation may bleed. This is the copy half of IMP-1 (`docs/retro-workboard.md:146-150`).
- every `guidedActions.*` template requires `{{input}}` — the lint EXISTS already (`guided-actions-section.tsx:203-207`, `assembly-model.ts:151-156`) and is generalized, not invented.
- `RPG_CARD_TEACH` requires the literal `:::card` opener and `RPG_CYOA_TEACH` the literal `:::choices` — these are TOKENIZER contracts, not macros, so they ride a sibling `requiredTokens` field with the same warn-never-block posture. Dropping them silently un-renders the feature.

---

## 7. Enforcement — the gate that stops the inventory rotting

Without this, §2 is a snapshot and the next teach lands as a constant. Per \[\[new-gate-four-coupled-sites]] this is FOUR sites: the gate module, the `Core-Enforcement-Active-Gates.md` row, the gate count, and `writeFixtures` in `tests/tooling/check-gates.int.test.ts`.

### 7.1 `no-hardcoded-model-prose` (ts-morph, Layer 3)

**The rule, stated structurally:** at a PROMPT-ASSEMBLY SEAM, a prose-shaped string literal may only be authored inside a prose-catalog file. Everywhere else at those seams it is RED.

`scanRoot` — the closed seam list (each a real assembly path today):

```
packages/server/src/domain/rpg/substrate/**
packages/server/src/entry/compose/rpg.ts
packages/server/src/domain/chat/assembly/**
packages/server/src/domain/chat/engine/smart-arbitrate.ts
packages/server/src/domain/chat/verbs/compaction.ts
packages/server/src/domain/chat/memory/build/substrate/**
packages/server/src/domain/imagery/substrate/**
packages/server/src/domain/automation/engine/arm-executors.ts
packages/contracts/src/rpg/extraction-prompt.ts
packages/server/src/domain/*/tools/**          # every tool `description:`
```

`scanRoot` returns BARE repo-relative paths (\[\[grit-layer-retired]], \[\[gate-scanroot-vs-getfilepath-path-format]] — a path-format mismatch is a silently-GREEN gate, and this gate's whole value is that it bites).

### 7.2 What counts as prose (and the four structural exemptions)

RED = a `StringLiteral` / `NoSubstitutionTemplateLiteral` / `+`-concatenated chain of them whose concatenated text has **≥ 12 whitespace-separated words** and contains a lowercase alphabetic run, UNLESS:

1. it is inside a **prose-catalog file** (`packages/contracts/src/*/prose.ts`, `packages/contracts/src/imagery/index.ts`, `packages/contracts/src/preset/index.ts`) — the cited authoring home;
2. it is an argument to `logger.*` / `getLog().*` / a `new *Error(...)` / a `throw` — the operator-facing class (§3.3 item 5), matched structurally on the call/`new` expression, never on wording;
3. it is a `// biome-ignore`-style cited allowlist entry in the gate's own `ALLOWED` table — one row per out-of-scope constant from §2.10, each carrying its reason string (the gate FAILS if an allowlist row no longer resolves to a real file:symbol — \[\[path-keyed-gates-die-on-rename]]);
4. it is a JSDoc/line comment (ts-morph node kind excludes them; the `commented-code` gate's precedent).

The 12-word threshold is chosen so §2.11's structural labels (max 3 words) and the wire vocabulary can never trip it, and so the shortest real slot (`RPG_DELTA_HEADING`, 4 words) is caught by arm 7.3 instead of by word count. Both arms are needed; neither alone is sufficient.

### 7.3 Second arm — registry completeness (the anti-`RPG_STATE_TRACKING_GUIDE` arm)

Whole-project: every exported prose-shaped const in a catalog file MUST appear as a `PROSE_SLOTS` row. A prose constant that is authored but registered nowhere is exactly row 27 — text nobody composes, documenting a behavior that does not happen. This arm is what makes "dead prose" unmakeable rather than merely fixed.

### 7.4 Third arm — no two slots ship identical default text

The `placeholder-copy-registry` precedent (`scripts/check/gates/placeholder-copy-registry.ts:1-5` — *"every section's pair is DISTINCT (the 'all sections look identical' root cause)"*). Two slots with byte-identical defaults means a copy-paste row nobody finished. Runs as a contract test rather than a gate (it needs the composed registry value, not the AST).

### 7.5 mustFlag / mustPass fixtures

- **mustFlag:** a 20-word instruction assigned to a const in `packages/server/src/domain/rpg/substrate/__probe.ts`; a 20-word `description:` on a tool def in `packages/server/src/domain/rpg/tools/__probe.ts`.
- **mustPass:** the same 20 words inside `packages/contracts/src/rpg/prose.ts`; a 20-word `logger.warn({...}, "…")` message at a seam; `"Party:"` at a seam (below threshold); an allowlisted `SCOPE_INSTRUCTIONS` row.

Prove it bites with a SCRATCH file, then `rm` it — never `git stash`/`restore` (`AGENTS.md` §4).

---

## 8. Homes — the file map

| path | status | what |
| - | - | - |
| `packages/contracts/src/prose/index.ts` | NEW | `ProseSlotDef`/`ProseHome`/`ProseOverrides`, `PROSE_SLOT_IDS`, `PROSE_SLOTS`, `resolveProse` |
| `packages/contracts/src/prose/prose-baseline.json` | NEW | the version↔hash manifest (§4.4) |
| `packages/contracts/src/rpg/prose.ts` | NEW | the rpg slot table (rows 1-36) — PRESET-homed since 2026-08-08 |
| `packages/contracts/src/preset/prose.ts` | NEW | per-PRESET slot table (rows 38-73) |
| `packages/contracts/src/chat/prose.ts` | NEW | app-tier chat slot table (rows 74-81) |
| `packages/contracts/src/preset/index.ts:849` | EDIT | `+prose` on `promptConfigSchema` + one lift |
| `packages/contracts/src/settings/index.ts:823` | EDIT | `+prose` section + one lift |
| `packages/contracts/src/rpg/inputs.ts:48-88` | EDIT | `+prose` patch arm on `rpgUpdateConfigInputSchema` |
| `packages/contracts/src/imagery/index.ts` | EDIT | adapt rows 82-90 into slot rows |
| `packages/server/src/domain/rpg/substrate/reminder.ts` | EDIT | constants → `resolveProse(…, input.prose)`; the file keeps its assembly logic |
| `packages/server/src/domain/rpg/substrate/delta.ts` | EDIT | two headings → slots |
| `packages/server/src/domain/rpg/contract/params.ts:312-345` | EDIT | `+prose: ProseOverrides` on `LiteReminderInput` |
| `packages/server/src/domain/rpg/verbs/game/update-config.ts:43-105` | EDIT | thread `prose` through the keep-on-omit merge (\[\[rpg-updateconfig-rebuilds-features]] — a new `config.*` field MUST thread the merge or it silently resets) |
| `packages/server/src/entry/compose/rpg.ts` | EDIT | rows 28-36 → slots read off the config it already resolves |
| `packages/server/src/domain/chat/{verbs/compaction.ts,engine/smart-arbitrate.ts,memory/build/substrate/prompts.ts,assembly/context.ts}` | EDIT | app-tier prompts → slots |
| `packages/server/src/domain/automation/engine/arm-executors.ts:240` | EDIT | autobg prompt → slot |
| `packages/server/src/domain/{rpg,imagery}/tools/index.ts` | EDIT | tool descriptions → slots |
| `packages/client/src/features/rpg/components/rpg-gm-prose.tsx` | NEW | the GM-console Prose section |
| `packages/client/src/features/preset/components/guided-actions-section.tsx` | EDIT | shared prose-field footer + stale affordance |
| `packages/client/src/features/preset/components/preset-structure-tabs.tsx:125-142` | EDIT | `+responseNudge` field; placeholders on all three |
| `packages/client/src/features/settings/**` (per SET-SEAMS) | NEW | the user Prose section |
| `scripts/check/gates/no-hardcoded-model-prose.ts` | NEW | §7 |
| `docs/architecture/core/Core-Enforcement-Active-Gates.md` | EDIT | the gate row |
| `tests/tooling/check-gates.int.test.ts` | EDIT | `writeFixtures` |

---

## 9. Migration stages — each independently shippable

| stage | lands | why this order |
| - | - | - |
| **S0** | `contracts/prose` (shape + resolver + `PROSE_SLOT_IDS` + the baseline manifest + `pnpm prose:baseline`), with the registry born holding ONLY the 18 already-overridable slots (§4.6) and their resolvers re-pointed. Gate registered but its `scanRoot` scoped to the (empty) catalog dir so it is vacuous. | zero behavior change, proves the resolver + the manifest mechanism against slots whose override path is already tested |
| **S1** | app-tier: rows 37, 74-81, 88, 90, 91 → slots + `UserSettings.prose` + the settings Prose section | the cheapest whole class, one storage, no threading — proves override storage end to end on prompts nobody's game depends on |
| **S2** | preset: rows 49, 53-73 → slots (**LANDED** — row 49 with the §4.6 adapted cohort; rows 53-73 by the ARM B ruling of 2026-08-09, `templating-fork-rows-53-73.md`, which also moved their COMPOSITION server-side so the wire carries kinds); close the editor gaps (`responseNudge` field, placeholders on all nudge fields, the shared footer, `requiredMacros` lints, stale affordance) | no new storage — the blob field and the COW fork already exist. This is the stage that pays IMP-1's copy half |
| **S3** | the rpg teaches: rows 1-10, 28-36 → slots + `promptConfig.prose` + `GatherTurnContextArgs.prose` threading + `LiteReminderInput.prose` + their preset **Templates-tab** rows (LANDED — shipped per-GAME at `fa8f944a0`, re-homed to the preset the same week; no GM-console prose section is built or wanted, the preset editor is the one door) | the biggest threading job (\[\[rpg-writable-field-coupled-sites]] — a new writable field is \~7 sites). Gate `scanRoot` widens to `rpg/substrate/**` + `compose/rpg.ts` here |
| **S4** | the rpg extraction TEMPLATES: rows 11-26 **and 29-36** → 40 template slots (§4.5, PRESET-homed like S3), their Templates-tab rows under a new `extract` kind, and the threading (turn round = the CAPTURED `RpgTurnContext.prose`; the two HOST DOORS = their own `resolveChatPresetProse`). **LANDED 2026-08-08** — see `prose-1-rpg-extraction-followon.md`'s banner for what the §4.5 decision actually resolved to (arm (a), with NO widening of `ProseSlotDef`: the token vocabulary + `resolveProseText`'s existing pre-substitution splice already ARE arm (a)). Row 27 (`RPG_STATE_TRACKING_GUIDE`) was owner-DEFERRED at S4 and is **RESOLVED 2026-08-08 = WIRE** — a 41st slot, `rpg.extract.stateTrackingGuide`, composed by `composePlaneTeaching` onto both write surfaces (decision 6). No per-slot token-expansion preview was built — the Templates-tab row is the read door (the 2026-08-08 re-home), and a richer rendered-with-ctx preview stays a fork nobody has ruled | needs the §4.5 machinery, which needs S3's storage proven |
| **S5** | close-out: gate goes live at full `scanRoot` with the cited allowlist; ledger entry (next free D-number) recording the one-home-per-slot law + the never-silently-replace rule; workboard PROSE-1 closed | the gate goes red-capable only when every seam has a slot to point at |

No stage leaves two homes for one slot. No stage ships a half-migrated seam (the constitution's "no leaving the OLD map beside the new" — `AGENTS.md` §4).

---

## 10. Test plan

**Contract (`tests/contracts/prose/`):**

- `resolveProse` — override wins; **absent override is BYTE-IDENTICAL to the pre-migration constant** (per slot, asserted against a frozen fixture of today's text: this is the default-identity discipline and it is the whole safety story for stages S1-S4);
- the version-lift arm — an override at `baseVersion: 1` against a slot at `version: 2` resolves to the OVERRIDE and reports `stale: true`; at equal versions `stale: false`; a fresh override stamps `slot.version`;
- registry totality — `Record<ProseSlotId, ProseSlotDef>` (a `.test-d` pin, both directions);
- the baseline manifest — recompute every slot's hash, fail on a text change without a version bump (§4.4 mechanism 2);
- §7.4 — no two slots share default text; no slot ships empty text.

**Unit (`tests/server/`):**

- `buildLiteReminder` with an empty `prose` produces bytes identical to today (a golden-string test on a seeded view — the reminder already has this shape of test);
- `buildLiteReminder` with a `steeringLicense` override renders the override in the license position, and the delta/teaches keep their relative order (`reminder.ts:401-425` assembly order is load-bearing);
- macro modes — a `names-only` slot resolves `{{user}}`/`{{char}}` and re-emits `{{setvar::x::1}}` VERBATIM (the existing `renderSteeringNote` test's shape, `tests/server/domain/chat/assembly/macros.test.ts:302-330` is the sibling);
- an app-tier slot with `macros: "none"` ships `{{char}}` verbatim.

**Int (`tests/server/domain/rpg/*.int.test.ts`):**

- `updateConfig` with a `prose` patch persists it AND leaves `features`/`trackers` untouched (the keep-on-omit merge — this is precisely the class `mergeFeatures` exists to guard, `update-config.ts:43`);
- a config blob written before PROSE-1 parses to `prose: {}` (additive self-heal at the parse seam).

**CT — the edit round-trip** (`tests/client/features/rpg/rpg-gm-prose.ct.tsx` + the settings twin):

- mount → the field is EMPTY and its `placeholder` is the shipped default (the honest "not customized" read);
- type an override → autosave fires with `{ text, baseVersion: <current> }` (assert the MUTATION, not the UI reaction — \[\[assert-the-mutation-fired]]);
- clear the field → the write sends the key REMOVED, not `""` (`imagery-templates-model.ts:34-43` — this is the bug class that makes "reset" not reset);
- a stale override (`baseVersion` behind) renders the stale chip and "take the new default" clears the override;
- `mount()` once per test (\[\[ct-mount-is-once-per-test]]).

**Gate (`tests/tooling/check-gates.int.test.ts`):** the §7.5 fixtures.

**Live drive (the bar that actually counts):** on a MODEL-POPULATED game (\[\[seeded-data-never-verification]]), edit the deception teach in the GM console, fire a turn, and read the wire capture (`GET /api/_debug/wire/captures?chatId=…`, `x-debug-token: dbg`) to confirm the override — not the shipped default — rode the system prompt. Then clear it and confirm byte-identity with the pre-edit capture.

---

## 11. Owner decisions — flagged, with recommendations

1. **Host-only vs member-visible editing.** Recommendation: **host-only** for all three homes in v1. Game teaches shape every member's turn; the GM console is already host-gated. A member-visible READ (a "what is my table teaching the model?" panel) is cheap to add later and is not a v1 blocker.
2. **Macro power in per-game teaches.** Recommendation: **names-only**, matching `steeringNote`'s neutralization. Full macro power in a host-authored string that fires on every member's turn is a trust widening with no product ask behind it.
3. **`GUIDED_GAME_STEERS` (7 plot-steer templates) — slots or code?** Recommendation: **code for v1** (§3.3 item 1). They are member-FIRED and would carry full macro power. Revisit as part of RV-13's branch-and-save mode fork, where "your own steer library" is the actual feature.
4. **`SCOPE_INSTRUCTIONS` (16 embedder hints) — slots or code?** Recommendation: **code**. They are model-family tuning with a silent failure mode and no feedback loop.
5. **Delta headings (rows 9-10) — prose or grammar?** Recommendation: **prose, in scope**. `CHANGES SINCE LAST BEAT` / `SCENE OPENS` are voice, and both already carry "a bump = a legible copy revision" docstrings (`delta.ts:29-34`) — which is a version field written in a comment. The structural labels of §2.11 stay out.
6. **Row 27, `RPG_STATE_TRACKING_GUIDE`: wire it or delete it?** ~~It is dead today and its docstring claims otherwise.~~ **RULED WIRE (owner, 2026-08-08) and LANDED.** The const is gone; its bytes are the `rpg.extract.stateTrackingGuide` slot (preset-homed, `macros:"none"`, Templates-tab row "Be thorough"), pushed by `composePlaneTeaching` — one home, so the structured extraction, the cheap tool round and the host resync cannot teach it differently, and the populate round / narration prompts still do not get it. The MEASURE half is enabled but not yet run. Detail: `prose-1-rpg-extraction-followon.md`'s ROW-27 section.
7. ~~**Per-game vs per-mode home for the teaches.**~~ **SUPERSEDED by the owner ruling of 2026-08-08 (see the amendment at the top): PER-PRESET.** The recommendation here was per-game; it shipped that way at `fa8f944a0` and was re-homed. RV-13's mode fork is now a PRESET copy — which the preset editor already does (fork-on-edit), so the mode fork needs no prose machinery of its own at all.
8. **THE GENUINE FORK — whose app-tier prose runs in a multi-human room?** App-tier slots are per-USER (`UserSettings`). In a multi-human room the compaction/memory/arbiter prompts are room-level side generations, but the turn is triggered by whichever member spoke. Two honest options: **(a) resolve against the ROOM HOST's settings** — the same principal whose connection funds the turn, so a room's memory prompts are stable regardless of who speaks; **(b) resolve against the triggering member** — each member's own tuning applies to the turns they trigger, which means one chat's digests are written by up to N different prompts. **Recommendation: (a), the room host.** It matches who owns the room's canon, matches where the connection and consent already resolve (`compose/rpg.ts:130-132` resolves the host by ROLE for exactly this reason — D19/D64), and keeps a chat's memory corpus internally consistent. This one changes a resolver signature (`loadUserSettings(caller.userId)` → `loadUserSettings(hostUserId)`), so it must be ruled before S1 builds.
