# 2026-08-03 — THE REGEX MODEL (stickler design review)

> **Charge (owner, near-verbatim):** "we do regex in a LOT of places, lots of consumers, it's
> semi-close to our CEL and macro engines, idk how to cleanly handle this — but regex should probably
> have the same shape as world-info and tags, since various things can have regex."
> **Deliverable:** full inventory → shape judgment → spec-grade staged proposal with owner forks.
> **Posture:** design review over the standing main tree (no diff under review — the gate battery was
> not run for this review; every claim below is receipted from files read/swept THIS session).
> Review-and-propose only; nothing was changed.

---

## §0 The doctrinal ground (read first — it decides the whole question)

The reshape the owner hypothesizes is **already ruled, and the built code never landed it**:

- **`Core-0-Architecture-and-Structure.md` §6 (the partitioning table, line 207):**
  “**Regex** | a regex *library* + scope junctions (global/character/preset), assembled + executed by
  placement | **the world-info pattern — one store, attached at scopes**.” Line 208 (World info):
  “the canonical scope-junction pattern (**regex reuses it**).”
- **`Core-0` §2 (engine vs data, lines 81–92):** “the engine is `kit`; the *data* it runs on comes from
  domains — … the regex *script library* (**the world-info-style scoped store of user scripts, its own
  feature**).” Echoed in `AGENTS.md` §1: “the *data* they run on (`MacroContext` values, the regex
  script library) **is a domain**.”
- **`Core-Path-Registry.md` D53** rules what was actually BUILT: “THREE sources joint-attached
  (per-character `characters.regexScripts`, preset-embedded, owner-global `fetchOwned`) — never
  polymorphic,” plus the authority/tier model (host-owned shared-prompt legs; per-user `markdownOnly`
  display tier client-side; the flags ARE the tier discriminant; the kit/server-kit ReDoS split).
- The ledger wins on conflict, so the current embedded shape is law today. The reshape therefore needs
  **a new D-entry amending D53's *storage* clause** while explicitly PRESERVING its authority/tier and
  ReDoS clauses (those are correct and unaffected). D53's “never polymorphic” is satisfied by D24
  per-type FK junctions — it bans a `(type, untyped_id)` store, not the library.
- **D114/D120 S5** already minted `features/regex` as the pane owner (`packages/client/src/features/regex/`,
  commit `0072e598` per the workboard §1634–1636) — the client home for the library surface exists.

**Conclusion up front:** the owner's hypothesis is not a new idea to evaluate — it is the pre-ratified
partitioning-table shape. The judgment questions are only: how big the home is, which attach scopes,
lift/re-embed mechanics, and what dies (the dead vocabulary the census found).

---

## §1 THE INVENTORY — every regex-adjacent plane, classified

### §1a The script-library plane (the D53 machinery)

**The wire shape** — `packages/contracts/src/regex/index.ts` (`regexScriptSchema`/`RegexScript`):
`id` (client-minted UUID, 1–128 chars) · `name` · `findRegex` (≤2048, cap shared with the executor) ·
`replaceString` (≤10k) · `placement: RegexPlacement[]` (z.enum over the kit tuple) · `enabled` ·
`markdownOnly` · `promptOnly` · `runOnEdit` · `trimStrings` (≤100×2000) · `substituteRegex`
(0/1/2, ST numeric wire) · `minDepth`/`maxDepth` (nullable ints). Alignment with the kit executor is a
`satisfies` pin (contracts header lines 1–4; kit `RegexScriptInput` at `packages/kit/src/regex/index.ts:35-52`).

**The three EMBED-BY-VALUE carriers (verified — copies, no references, no cross-carrier picking):**

| Carrier | Home | Receipt |
| - | - | - |
| Owner-global | `UserSettings.regex.scripts` | `packages/contracts/src/settings/index.ts:821-831,854` (own section so it can be section-patched; v2→v3 lift at :928-933 moved it from top-level `regexScripts`) |
| Preset | `PromptConfig.regexScripts` | `packages/contracts/src/preset/index.ts:1078` (`.max(500)`), default `[]` at :1383 |
| Character card | `characters.regexScripts` | `packages/db/src/schema/character.ts:112-113` (typed JSON column, always-a-list, D28 promotion); contracts card at `packages/contracts/src/character/index.ts:130,165` (≤500); read-seam heal `packages/server/src/domain/character/persistence/queries.ts:27,350` (`.catch([])`) |

**The engine** — `@orb/kit/regex` (`packages/kit/src/regex/index.ts`, isomorphic, imports `#macro`):
- `REGEX_PLACEMENTS = ["USER_INPUT","AI_OUTPUT","SLASH_COMMAND","WORLD_INFO","REASONING","DISPLAY"]` (:14).
- **Macros DO substitute inside `findRegex`** when `substituteRegex` is `raw`/`escaped`
  (`compilePattern` :123-136, `processMacros` on the pattern; `escaped` regex-escapes each substituted
  value via `sanitizeRegexMacro` :85-87). `trimStrings` are macro-resolved too (:89-101).
- **Load-bearing ordering** (:157, :192-208): the replacement template is macro-evaluated FIRST, then
  `$N`/`$<name>`/`{{match}}` splice the raw captured text VERBATIM — model output re-emitted through an
  `AI_OUTPUT` script can never smuggle `{{setvar}}` into evaluation.
- `g` flag forced; `/pattern/flags` literal syntax parsed (:109-119); ReDoS pre-compile heuristic is
  occurrence-counting defense-in-depth only (:54-74).
- **The guarantee** is `@orb/server/kit/regex` (`packages/server/src/kit/regex/index.ts`): a fixed
  `vm.Script("text.replace(regex, replacer)")` in a bare context, 50 ms V8 watchdog, codeGeneration off,
  injected at compose (`packages/server/src/entry/compose/chat.ts:654`). Never browser-bundled (D75:
  client preview runs unwatched by design — the neo debug eval routes are by-design-out).

**The D53 resolution seam** — `packages/server/src/domain/chat/contract/regex.ts`
(`HostTierRegexSources`: hostGlobal/preset/cast, each pre-resolved under the frozen `runAsUserId`;
member exclusion is structural — a non-host has no parameter on the surface) +
`packages/server/src/domain/chat/substrate/regex-tier.ts` (`resolveHostTierRegexScripts`: ordered
global → preset → cast-in-roster-order, deduped by `id` first-wins; resolves, never filters).
Sources feed from ForeignInputs: `contract/foreign.ts:50,73` (`globalRegexScripts`), compose
`entry/compose/chat.ts:1024` (`us.regex.scripts`); union built at
`substrate/assemble-gather.ts:356-359`; carried onto the immutable AssembleContext
(`assembly/context.ts:820-821`; contracts twin `packages/contracts/src/chat/assemble.ts:381-383`).

**The SIX execution legs (the complete `executeRegexScripts` call-site census):**

| # | Placement | Site | Script set | Watchdog |
| - | - | - | - | - |
| 1 | `USER_INPUT` (SEND, pre-persist — WI haystack + persisted row see the same text) | `assembly/context.ts:741-748` | full host-tier union | yes |
| 2 | `WORLD_INFO` (per WI entry: macro render → regex → wiFormat wrap) | `assembly/context.ts:202-208`, fed at **:771 = `input.promptConfig.regexScripts` ONLY** | **preset slice only — see F2** | yes |
| 3 | `AI_OUTPUT` (RECEIVE, canon-mutating pre-persist) | `engine/pipeline.ts:281-290` | union (`ctx.hostTierRegexScripts`) | yes |
| 4 | `REASONING` (RECEIVE, reasoning channel) | `engine/pipeline.ts:296-305` | union | yes |
| 5 | edit re-run (assistant→AI_OUTPUT, user→USER_INPUT, filtered `runOnEdit===true`) | `verbs/edit.ts:160-218` | union (rebuilt: global ∪ preset ∪ cast, :202-206) | yes |
| 6 | `DISPLAY` (client render: row-macros → DISPLAY regex → fixMarkdown) | `packages/client/src/lib/message-render.ts:87-96` | `ctx.displayScripts` — **never supplied anywhere — see F1** | n/a (browser, by design) |

Receive order as-built (`pipeline.ts:247-308`): think-demux → AI_OUTPUT regex → postProcess →
per-speaker clean → REASONING regex.

**Client surfaces:**
- `features/regex` (D114/D120 S5): settings pane in `surface` mode
  (`lib/regex-pane.tsx`, `surfaces/regex-settings-surface.tsx` — autosave section-patch of
  `regex.scripts`; new-script default `placement: [...REGEX_PLACEMENTS]`, i.e. ALL six).
- Preset editor Regex tab: `features/preset/components/regex-tab.tsx` (array CRUD; default placement =
  all six).
- Character facet editor: `features/character/components/character-regex-scripts-field.tsx` — surfaces
  ONLY name/find/replace/enabled; new script `placement: []`; header comment: “the rest of each
  script's options (placement/depth/substitution flags) round-trip untouched.” **See F3.**
- The ONE shared editor dialog: `packages/client/src/components/regex-editor-dialog.tsx` (binds any
  form with `regexScripts: RegexScript[]`; placement multi-toggle; no trimStrings/substituteRegex/
  min-max-depth controls anywhere in the app).
- Shared placement vocabulary: `client/src/lib/regex-placement-labels.ts` (`REGEX_PLACEMENT_LABELS`/
  `regexPlacementStep` — the side-eye F-23 one-vocabulary map).
- Pipeline readout: `features/preset/components/readout/transforms-readout.tsx` — prints the two lanes
  “in EXECUTION ORDER”; its own header admits “the ORDER today lives only in engine file headers.”
  **See F4/F6.**

**Serde/import/export (ST parity):**
- `packages/server/src/kit/serde/card/index.ts:81-182,214,293,322`: reads V3
  `data.extensions.regex_scripts` OR V2 root `data.regex_scripts`, each candidate individually
  `regexScriptSchema.safeParse`d (bad ones dropped); export re-encodes the typed column back into
  `extensions` (stale keys stripped first).
- `domain/import/substrate/card.ts:157` carries `regexScripts` into `createCharacterSchema`;
  `domain/export/verbs/export-character.ts:154` emits from the typed row.
- The ST **profile** import (`entry/import/*`) carries NO global-regex-settings mapping (swept — zero
  hits); the only regex import path is per-card. Presets have no export verb at all
  (`domain/export/verbs/` = character + chat only), so `PromptConfig.regexScripts` has no portability
  wire today.

**Dead/inert vocabulary found by the census (details in §2):** `SLASH_COMMAND` placement (no leg),
`minDepth`/`maxDepth` (stored, never executed), the DISPLAY leg (built, unwired), the WI leg's
preset-only source set.

### §1b Regex-AS-SYNTAX planes (NOT library material — do not fold into the reshape)

- **World-info entry keys are NOT regex in orbweaver.** `packages/kit/src/world-info/index.ts:79-108`:
  keys compile through `escapeRegExp` into literal whole-word (or boundary-less-script substring)
  matchers, LRU-cached. The ST V3 `use_regex` entry flag is ACCEPTED at the card boundary
  (`contracts/character/index.ts:263-266`, `.catch(undefined)`) and rides into the entry `metadata`
  blob via the `{...entry}` spread (`server/kit/serde/card/index.ts` `loreEntryMetadata`), but **no
  matcher ever reads it** — an imported regex-keyed ST entry silently degrades to literal matching.
  This is an inert ST field, not a bug in the library plane; it belongs on the world-info parity
  ledger, not in this reshape (flagged as fork O-6).
- **Internal `new RegExp` construction sites** (implementation regex, none user-authored; complete
  file list from the sweep): `contracts/prose`, `db/client`, `kit/fix-markdown`,
  `kit/json-schema/lift`, `kit/macro/user-macros` (name shape `MACRO_NAME_RE`), `kit/regex`,
  `kit/speaker-label`, `kit/world-info`, `chat/assembly/assemble.ts`, `chat/engine/select-speakers.ts`,
  `infra/crypto/key.ts`, `infra/providers/backends/kit/openai-compat/body.ts`, `server/kit/reasoning`,
  `server/kit/serde/chat`. Zod `.regex()` validators throughout contracts. No user-typed regex
  search/filter bar exists anywhere in the client (swept). None of these are consumers of the library.

### §1c The adjacent engines (the owner's “semi-close to CEL and macro”)

| Engine | Home | What it transforms | When | Data it runs on | Safety envelope |
| - | - | - | - | - | - |
| **Macro** | `@orb/kit/macro` (engine + registry/metadata pair; parser/evaluator/user-macros/row-macros) | `{{…}}` templates → text | every prompt section render; volatile FREEZE at commit (D51); per-view identity resolution client+server (one `resolveRowMacros` atom) | builtin registry (process singleton) + **user macros EMBEDDED in preset/game config** (`promptConfig.userMacros` + `rpg_games.config.userMacros` — owner ruling #20, D110-3 MU: per-render registry, never a global runtime; collision REFUSED) + `MacroEnv` variable planes | `MacroBudget` (depth/op caps), determinism-through-nesting, `neutralizeMacros` splice defense |
| **CEL** | `@orb/kit/cel` (thin seal over `@marcbachmann/cel-js`) | predicates/expressions → values | automation rule dispatch; `{{expr::…}}` INSIDE the macro engine | automation-rule sources (rows in the automation domain) + `CelBindings` (the P6 `celBindings` chat-turn channel: gather → AssembleContext → `{{expr::rpg.…}}`, `assembly/macros.ts:102-106`) | linear-time by construction → the 2 KiB parse cap IS the whole budget (its own header contrasts kit/regex explicitly) |
| **Regex** | `@orb/kit/regex` (+ `@orb/server/kit/regex` watchdog) | find/replace over pipeline text legs | the six legs above | the script library (this review) | node:vm 50 ms watchdog server-side; heuristic-only client-side |

**They already compose, one-directionally:** `kit/regex` imports `kit/macro` (find/replace/trim macro
passes); `{{expr}}` calls `kit/cel`; CEL is “the predicate layer over the same `MacroEnv`” (D46).
There is no circularity and no duplicated engine logic.

**The as-built inter-engine resolution ORDER (per leg — this IS defined, but only in code):**
- SEND (`assembly/context.ts:720-755`, pinned by `tests/server/domain/chat/assembly/context.int.test.ts:215`):
  freeze volatile macros → `promptTransforms("user_input")` (D50; automation/plugin transforms) →
  USER_INPUT regex. Macro-before-regex is also pinned in prose at `Chat-Macro-Resolution.md:26-27`.
- Per WI entry (`assembly/context.ts:191-214`): macro render → WORLD_INFO regex → wiFormat wrap.
- RECEIVE (`engine/pipeline.ts:247-308`): think-demux → AI_OUTPUT regex → postProcess → per-speaker
  clean → REASONING regex. (`assembled_dynamic` transforms run at end of BUILD per D50.)
- DISPLAY (`client/src/lib/message-render.ts`): row macros → DISPLAY regex → fixMarkdown.
- Invariant everywhere: **macros resolve before regex executes on a leg; regex templates get their own
  macro pass; captured text splices verbatim (never macro-evaluated).** CEL never sees regex output
  (it runs inside the macro pass).

There is **no single home** stating this order (the readout's header says so itself), and the one
surface that claims to print it has drifted (F6) — evidence that order-as-prose rots and the reshape
spec should mint the order table + a pinning test, NOT a merged engine.

---

## §2 CONFIRMED FINDINGS (defects in the standing tree, discovered by the census)

Ranked by consequence. All confirmed by direct code reading this session; receipts inline.

- **F1 (P1) — The per-user DISPLAY tier is DEAD: `displayScripts` is never supplied.**
  `client/src/lib/message-render.ts:35,87-96` implements the leg; the ONE `MessageRenderContext`
  construction site `features/chat/lib/message-render-context.ts:55-68` never sets `displayScripts`
  (repo-wide grep: the identifier appears ONLY in message-render.ts). Consequence: D53's per-user
  `markdownOnly` tier — a whole clause of the ruling — does not function; the editor's “Display only”
  switch (`regex-editor-dialog.tsx:83-85`) and the readout's “display-only scripts … run LAST”
  (`transforms-readout.tsx:57-61`) govern nothing; DISPLAY-placement scripts of ANY carrier never run
  for anyone. Classic dead-wire-vs-dead-ended-pair. Fix is independent of the reshape (fork O-4).
- **F2 (P1) — The WORLD_INFO leg runs the PRESET slice only, not the resolved host-tier union.**
  `assembly/context.ts:771` feeds `input.promptConfig.regexScripts` into the WI convert args while the
  full union sits in `hostScripts` at :722 and is used by legs 1/3/4/5. Consequence: a host-global or
  card script with `WORLD_INFO` placement silently never fires — and the settings pane's new-script
  default INCLUDES `WORLD_INFO` (`regex-settings-surface.tsx:41`), so the shipped default advertises a
  leg it never gets. Contradicts the resolver's own doc (“the SEND verb + the RECEIVE engine both
  reference this one named input,” `contract/regex.ts:3-5`) and edit.ts's “the same union a turn
  resolves” (:169). No test pins the WI leg's source set
  (`tests/server/domain/chat/substrate/assemble-gather.int.test.ts:398-425` pins only the union
  resolver; `tests/server/domain/chat/assembly/context.int.test.ts` has no WI-regex source assertion) —
  so this is drift, not a pinned decision. Fold the fix into R3 or fix standalone (fork O-4).
- **F3 (P2) — A card script authored IN-APP can never fire.** The character facet editor creates
  scripts with `placement: []` (`character-regex-scripts-field.tsx:23-39`) and surfaces no placement
  control (by design per its header) — so the only way a character script ever runs is via ST import.
  The three editors have three different capability levels for one schema (settings/preset: full
  dialog, all-placements default; character: 4 fields, no-placement default) — the concrete
  fragmentation cost of three embedded carriers the reshape's ONE library + ONE editor removes.
- **F4 (P2) — `SLASH_COMMAND` is a phantom placement.** Tuple member (`kit/regex/index.ts:14`), UI
  chip (the shared dialog's placement toggle), readout prompt-lane step 3
  (`transforms-readout.tsx:25`), label row (`regex-placement-labels.ts:20`) — and ZERO execution legs
  (repo-wide sweep: no `placement: "SLASH_COMMAND"` call site; the client slash-command module is an
  unrelated command parser). A user can enable a script “on Slash commands” and the readout will print
  it “on” at a stage the pipeline does not possess. D107 dead-switch class (outside the
  knob-wire-coverage registries, which cover settings/format-strings/chatMetadata — not this tuple).
- **F5 (P2) — `minDepth`/`maxDepth` are stored, defaulted, and NEVER executed.** Schema fields
  (`contracts/regex/index.ts:45-46`), client defaults in all three makers — and no consumer: the
  executor's `RegexScriptInput` (:35-52) has no depth fields and no caller filters by them (repo-wide
  sweep; the only maxDepth hits are the macro budget and an unrelated chat ancestor-chain walk).
  Root cause is architectural, not an oversight: ST applies regex per-history-message at PROMPT time
  (where depth gates), orbweaver applies AI_OUTPUT/USER_INPUT at PERSIST time — the depth axis has no
  leg to gate. Honest arms: delete, or build the depth-gated prompt leg (fork O-5).
- **F6 (P3) — The transforms-readout mis-orders the reply lane.** It prints REASONING (step 3) before
  AI_OUTPUT (step 4) (`transforms-readout.tsx:51-52`); execution is AI_OUTPUT first
  (`pipeline.ts:281` vs :296). The two legs act on disjoint channels (content vs reasoning), so no
  output differs — but this surface's whole stated purpose is “the ORDER is the datum,” and its
  prompt lane also renders the F4 phantom. Evidence for the one-home order pin (§4), and a one-line
  fix on its own.

---

## §3 THE RESHAPE (Q1) — shape judgment

### §3.1 Does it need the full domain, or a leaner home? → **A full (small) leaf domain.**

- **The “settings-adjacent library like themes” arm fails the D114 test.** Themes stay settings-owned
  because “the theme model + serde ARE settings-domain” (D114). Regex scripts are read by CHAT
  (assembly/engine/edit) and attach to character/preset/(global) — settings merely skims a pane, and
  D114/S5 already evicted that pane to `features/regex`. A section is owned by the feature that READS
  its knobs; nothing about this library is settings.
- **The “keep the blob, add references into it” arm fails the FK law.** References from
  preset/character rows into ids inside a `UserSettings` JSON blob are soft refs no FK enforces —
  exactly the D24 rot class, and delete-a-script leaves dangling ids everywhere.
- **What remains is the tag/world-info template at smaller scale:** a top-level single-owned entity
  (D23 KEEP `ownerId` — a script is the user's authored artifact with no owned anchor) + per-type FK
  junctions (D24) + CRUD/attach verbs + guard + import/export seams + a tRPC router. That IS the
  8-slot domain template; `domain/world-info` (`verbs/{books,entries,attachments}`, `export.ts`,
  `import.ts`) is the exact structural precedent, minus the matching engine (regex has none — the kit
  executor stays where it is). Small: no substrate beyond maybe a dedup helper, no workloads, no bus
  events beyond a `settingsChanged`-class invalidation (fork O-7).

### §3.2 Schema sketch (contracts + db)

- `regex_scripts` table (producer: `domain/regex`): TypeID PK (`rgs_…`, a new `kit/ids` brand) ·
  `ownerId` FK CASCADE (D23 KEEP; owner-scoped `fetchOwned` index) · promoted hot columns
  `name`, `enabled` · the behavior body as a typed JSON column validated by the existing
  `regexScriptSchema`-minus-id (the world-entries “behavior in JSON, not columns” precedent,
  `db/src/schema/world-info.ts:18`) — or full column promotion; JSON body recommended (the shape is
  ST-inherited and still shedding fields, F4/F5). `placement` stays inside the body; no enum column,
  so no D34 CHECK needed. Timestamps per house style.
- Junctions (each composite-PK, CASCADE both ways, NO ownerId — derive via the owned side, D23):
  - `global_regex_scripts` (one row per script; the `global_books` twin) — “applies to every chat you
    host.”
  - `character_regex_scripts` (characterId, scriptId, position).
  - `preset_regex_scripts` (presetId, scriptId, position).
  - Optional per fork O-1: `chat_regex_scripts` (chatId, scriptId — host-set room state; chats are
    ownerless (D18) so authority is the membership chain like `chat_books`).
- **Ordering:** today's precedence is source-tier order then array order, deduped by id first-wins
  (`regex-tier.ts:17-29`). Junctions carry `position` within a scope; tier order stays
  global → preset → cast (→ chat, if built). Dedup-by-id becomes dedup-by-FK (the same row attached
  at two scopes runs once, earliest tier).
- **Migration:** NO-LEGACY pre-launch — the three carrier fields DIE in the same wave
  (`UserSettings.regex.scripts` section → the settings schema loses the section (schema-version bump,
  lift-to-drop); `PromptConfig.regexScripts`; `characters.regexScripts` column) and the new tables ride
  ONE regenerated `0000_baseline.sql` (the D113 clean-break precedent; the db-structure gate does NOT
  catch a stray `0001` — squash discipline is on the builder). Live-data carryover is fork O-3.

### §3.3 What D53's resolver changes — prior confirmed: **barely**

`HostTierRegexSources` keeps its three (four with chat scope) fields; the CONTENT of each moves from
blob-copies to junction-dereferenced rows, resolved in ForeignInputs/compose exactly where
`globalRegexScripts` resolves today (`compose/chat.ts:1024`) — the union function itself is unchanged.
The authority model is UNTOUCHED: host-resolved under the frozen `runAsUserId` (D19), member exclusion
structural, watchdog injection unchanged, flags keep their leg semantics. R3 folds the F2 fix (the WI
leg consumes the union like every other shared leg — with the new D-entry recording that as the ruled
behavior, since D53 today doesn't specify per-leg source sets).

### §3.4 Import LIFT / export RE-EMBED (ST parity both directions)

Mirror the world-info card path 1:1 (all receipts §1a):
- **Lift:** `parseCardPng/parseCardJson` already yield `card.regexScripts`; instead of copying into the
  `characters` row, `import-character` hands them to an injected `domain/regex` op
  (`importCardScripts({ownerId, characterId, scripts})` — the `importLorebook` twin,
  `import-character.ts:125-126` / `compose/world-info.ts:73`), which creates rows + junction
  attachments.
- **Dedup on lift (the best-book/skip-clone precedent, `import-character.ts:119-123`):** carried
  orbweaver refs win over re-cloning; for foreign cards, content-equality dedup against the owner's
  existing rows (fork O-2).
- **Carried references:** a new namespaced wire key (`orbweaver_attached_regex_scripts`, the PD-144
  `ATTACHED_BOOKS_WIRE_KEY` twin) so a same-install re-import re-links by id instead of duplicating.
- **Re-embed on export:** `export-character` walks `character_regex_scripts` → rows → hands the
  script bodies to the serde exactly as it hands `charRow.regexScripts` today
  (`export-character.ts:154`; serde re-encodes into `extensions.regex_scripts`,
  `serde/card/index.ts:322`) — the ST wire is byte-shape-identical, so foreign portability is
  unchanged. The entries-embed + refs-bundle double (export-character.ts:84-110) is the exact pattern.

### §3.5 Attach surfaces (“various things can have regex”)

Ruled today (Core-0 §6): **global / character / preset**. Candidate additions: **chat-room**
(precedent `chat_books`; host-set; genuinely useful — “this room's transcript quirk”) and **persona**
(precedent `persona_books`; no evidence of demand; ST has no persona regex). Recommendation in fork
O-1: ship the ruled three + chat-room; leave persona as a named doorway (a junction is a one-file
add later — D107 DOORWAY discipline, not speculative build).

---

## §4 THE ENGINE-FAMILY QUESTION (Q2)

**Verdict: one text-transform FAMILY is already real at the kit tier and must NOT become one engine,
one attach model, or one placement vocabulary. Share the PATTERN and the ORDER PIN; nothing else.**

- **What must NOT merge (and why, from measured properties):**
  - *The engines.* Their safety envelopes are load-bearingly different and each engine documents its
    own: regex is superlinear → node:vm watchdog (`server/kit/regex`); CEL is linear → the 2 KiB parse
    cap IS the budget (`kit/cel/index.ts:5-7` says exactly this, contrasting kit/regex); macro is a
    recursive template engine → `MacroBudget` + determinism-through-nesting (D110-3 INVIOLATE list).
    A merged “transform engine” would have to carry the union of three threat models.
  - *The attach models.* User macros are EMBEDDED in preset/game config **by owner ruling** (#20,
    D110-3 MU; `contracts/preset/index.ts:970-977`) — swipe/variant-safety by riding the config plane,
    collision-refused per-render registries. Regex scripts have no swipe coupling (they transform at
    execution time; canon is baked at commit) — reference semantics are safe for them and wrong for
    user macros. CEL sources live on automation rules (their own rows). Three data models, three
    correct answers; “one attach model” would un-rule MU.
  - *The placement vocabularies.* `REGEX_PLACEMENTS`, the D50 transform points
    (`user_input`/`assembled_dynamic`), macro commit points (freeze-at-commit), and `kit/injection`
    depth/role are DIFFERENT axes over the pipeline, not one axis spelled four ways. D32 already rules
    the pattern: consumers share the SHAPE, never the values. A merged “stage enum” would force every
    engine to carry stages it cannot run (F4 is the miniature of exactly that failure — a tuple member
    with no leg).
- **What SHOULD be shared:**
  1. **The attach/reference pattern as a convention, not a machine:** per-type FK junctions + scope
     union + first-wins dedup — world-info's shape, reused by regex (Core-0 §6 says “regex reuses
     it” verbatim). No shared runtime; a shared *test idiom* (junction-CASCADE + union-order suites)
     is the reuse.
  2. **ONE home for the inter-engine resolution order** — the §1c order table goes into the reshape
     spec/D-entry, plus a pinning test per leg (the SEND transform-vs-regex order test at
     `context.int.test.ts:215` is the existing exemplar; RECEIVE and WI legs deserve twins), and the
     transforms-readout is corrected against it (F6) with a comment citing the home. Order-as-prose
     has already drifted once.
  3. **The client vocabulary map stays one home** (`regex-placement-labels.ts`, the F-23 ruling) and
     shrinks with the tuple when F4 lands.
- **Is the order defined anywhere today?** Per-leg in code + one prose pin
  (`Chat-Macro-Resolution.md:26` — macro-before-regex at SEND) + partial D50/D51 clauses. No single
  citable table; the reshape should mint it (it is a spec section, zero runtime change).

---

## §5 WHAT BREAKS (Q3) — per-consumer impact by stage

Stages: **R1** contracts+db · **R2** domain+transport · **R3** chat-resolution flip · **R4**
lift/re-embed · **R5** client takeover · **R6** display-tier wiring (see §7).

| Consumer (receipt in §1) | Impact | Stage |
| - | - | - |
| `contracts/regex` schema | +`RegexScriptRow` wire view (id becomes the TypeID brand on rows; the embedded-shape schema survives ONLY as the card-wire/lift shape) | R1 |
| `contracts/settings` `regex` section (:821-854) | section DELETED (schema bump; the settings pane stops owning storage) | R1/R5 |
| `contracts/preset` `regexScripts` (:1078,:1383) | field DELETED; preset gains nothing (junction is db-side) | R1 |
| `contracts/character` card `regexScripts` (:130,:165) | STAYS on the card WIRE shape (ST parity) — but `createCharacterSchema`'s field routes to the lift, and the `characters` column dies | R1/R4 |
| `db/schema/character.ts:112-113` | column DROPPED (baseline regen) | R1 |
| NEW `db/schema/regex.ts` + junctions | born | R1 |
| `kit/ids` | +`rgs_` TypeID brand | R1 |
| `kit/regex` executor + `server/kit/regex` watchdog | **unchanged** (the engine is not the question) | — |
| NEW `domain/regex` (verbs: CRUD/attach/detach/list; guard `fetchOwned`; injected ops for import/export) + tRPC router | born — the new-domain coupled-site checklist applies (compose, SERVICE_KEYS-class registries, router sweep classification PROBED/EXEMPT per the new-router memory, bus/invalidation wiring, test mirrors) | R2 |
| `entry/compose/chat.ts:1024` (`globalRegexScripts`) + ForeignInputs (`contract/foreign.ts:73`) | resolve from `global_regex_scripts` ∪ junctions instead of `us.regex.scripts`/`promptConfig` | R3 |
| `substrate/assemble-gather.ts:356-359` | sources swap; union call unchanged | R3 |
| `substrate/regex-tier.ts` + `contract/regex.ts` | shape unchanged (+optional chat source; dedup keyed on row id) | R3 |
| `assembly/context.ts:722,741,771` | **:771 flips to the union (F2 fix)**; else unchanged | R3 |
| `engine/pipeline.ts:269-305` | unchanged (reads the ctx union) | — |
| `verbs/edit.ts:194-217` | sources swap (same ForeignInputs seam) | R3 |
| `contracts/chat/assemble.ts:381-383` | unchanged | — |
| `serde/card` (:81-182,:322) | unchanged wire; import consumer re-routes | R4 |
| `import-character.ts` | +`importCardScripts` injected op + carried-refs re-link + dedup (the :119-126 lorebook twin) | R4 |
| `export-character.ts:154` | reads junction→rows instead of the column; wire byte-identical | R4 |
| `features/regex` pane (`regex-pane.tsx`, surface) | becomes the LIBRARY surface (CRUD over rows; global-attach toggle); loses the settings-blob autosave form | R5 |
| Preset Regex tab (`regex-tab.tsx`) | becomes a PICKER over owned rows (+ per-preset order); the embedded editor dies — cross-carrier picking becomes possible (the owner's stated gap) | R5 |
| Character facet `regexScripts` (`character-regex-scripts-field.tsx`, facets :33,:109-111, facet editor :153-154) | becomes a PICKER; **fixes F3 by construction** (a picked row was authored in the one full editor) | R5 |
| Shared `regex-editor-dialog.tsx` | binds the library row form instead of `regexScripts[i]` array paths; one editor, one capability level | R5 |
| `transforms-readout.tsx` | counts from the preset's ATTACHED set (a resolve, not a blob projection); F4 row dies with the tuple member; F6 order fix | R5 |
| Settings shell partition (`assertSettingsKeyPartition`, D120) + the two door mirrors (`settings-pane-registry.test.ts`, `ct-data-providers`) | the `regex` owns-claim dies with the section; mirrors updated | R5 |
| `message-render.ts` + `message-render-context.ts` | display sourcing (F1): viewer's owned DISPLAY-placement scripts (± room carriers per fork O-4) threaded into the ONE construction site | R6 |
| Tests | `tests/{contracts,kit,server/kit}/regex*` largely survive (engine/wire unchanged); `regex-tier.test.ts` + `assemble-gather.int` source fixtures re-plumb; NEW: domain CRUD/attach mirrors, junction-CASCADE suite, lift/re-embed round-trip, WI-leg-union pin, order pins | all |
| ST gap register / feature map rows (“Regex scripts … BUILT”) + Core-0 §6 row + a new D-entry amending D53 | doc wave | R0 |

Nothing else imports the carriers (the §1a file list is the complete `regexScript`-referencing set,
36 files, all classified above or in §1a).

---

## §6 OWNER FORKS (Q4a) — each with a recommendation

- **O-1 · Attach scopes at birth.** (a) The ruled three (global/character/preset); (b) +chat-room;
  (c) +persona too. **Recommend (b):** chat-room is the `chat_books` twin, host-gated by the
  membership chain, and is the first honest answer to “various things can have regex”; persona stays
  a named doorway (one junction file later).
- **O-2 · Dedup policy on lift.** (a) Always-new rows per import; (b) content-equality reuse
  (hash of the behavior body, owner-scoped) + carried-refs-win (PD-144 twin). **Recommend (b)** —
  re-importing card packs is the norm and (a) breeds hundreds of identical rows; the best-book/
  skip-clone precedent is exactly this call.
- **O-3 · Live-data carryover.** NO-LEGACY kills lift machinery; the owner's real
  `UserSettings.regex.scripts`/preset/card scripts on the live db: (a) accept loss / re-author;
  (b) a one-shot boot seed reading the old blobs ONCE (deleted next wave); (c) manual re-entry from a
  backrest snapshot. **Recommend (c)** — the D113 clean-break posture; a one-shot lift is exactly the
  shim class the posture bans, and the library is small.
- **O-4 · The two live defects vs the program.** F1 (display tier dead) and F2 (WI leg preset-only)
  are defects of the STANDING tree, not of the reshape. (a) Fix now, standalone, pre-program;
  (b) fold into R3/R6. **Recommend (a) for F2** (a two-line source swap + a pin test; users are
  silently losing configured behavior today) and **(b) for F1** (display sourcing policy — viewer-only
  vs viewer ∪ room carriers — is a real design fork D53 doesn't settle; deciding it inside the
  program's D-entry beats a quick guess. If the owner wants ST parity now: room carriers' DISPLAY
  scripts render for every viewer, viewer-global on top).
- **O-5 · `minDepth`/`maxDepth` (F5).** (a) Delete from the active schema; accept-and-drop on card
  import; record an accepted ST delta (the D75/D76/D77 “do not re-flag” idiom) — orbweaver's
  persist-time application has no depth axis by architecture; (b) build the ST-style depth-gated
  prompt-leg application to give them meaning. **Recommend (a)** — (b) is a new assembly leg built to
  justify two fields nobody asked for; D107's dead-switch law says a stored knob that governs nothing
  is the defect.
- **O-6 · `SLASH_COMMAND` (F4).** (a) Delete the tuple member (+UI chip, readout row, labels);
  card-import accepts-and-drops the value from placement arrays; (b) keep as a doorway. **Recommend
  (a)** — orbweaver has no server slash pipeline and none is planned (the client palette is a command
  launcher, not a text leg); a doorway needs a plausible graft, and D75 already shows the neo regex
  surfaces this vocabulary came from are by-design-out. Re-add is one tuple member if ever real.
- **O-7 · Invalidation/bus surface for the new domain.** (a) Piggyback the settings-style
  `*Changed` invalidation event only; (b) full per-entity bus events. **Recommend (a)** — the library
  is a low-churn owner surface; the D50 no-deletion-events discipline and FK CASCADE carry the rest.
- **O-8 · Scripts-as-JSON-body vs full column promotion (§3.2).** **Recommend JSON body** with
  `name`/`enabled` promoted — the shape is still shedding ST fields (O-5/O-6) and a body-blob change
  is schema-bump-free; world-entries is the precedent.

---

## §7 THE R-STAGED PROGRAM (Q4b)

Sizes: S ≈ half-day lane · M ≈ 1–2 day lane · L ≈ multi-day. Stages are sequential; R4/R5 can lane in
parallel after R3. The standalone F2 fix (O-4a) rides BEFORE the program as a defect patch.

- **R0 (S) — The ruling + the spec.** Mint the D-entry (amends D53's storage clause; cites Core-0 §6
  as the realized shape; records the §1c order table + the per-leg source-set rule (all shared legs
  consume the union); disposes O-1…O-8). Update the ST-map/gap-register rows. Docs only.
- **R1 (M) — Contracts + db.** `rgs_` brand; `regex_scripts` + the O-1 junctions; carrier fields
  deleted (settings section lift-to-drop, preset field, characters column); ONE regenerated
  `0000_baseline.sql` (squash discipline — no `0001`; no gate catches this); contract tests +
  junction-CASCADE suite.
- **R2 (M) — `domain/regex` + transport.** 8-slot leaf domain (CRUD/attach/detach/list verbs,
  `fetchOwned` guard, injected-op contracts for import/export), tRPC router (every proc classified
  PROBED/EXEMPT in the cross-tenant sweep), compose wiring (+ the new-domain coupled-sites checklist:
  compose stub, service keys, invalidation map, test mirrors), client codegen keys.
- **R3 (S/M) — The resolution flip.** ForeignInputs/compose resolve the three (four) scopes from
  junctions; `regex-tier` sources swap; **the WI leg consumes the union** (F2, if not already patched);
  edit.ts re-plumb; pins: union-order test re-fixtured, WI-leg-source pin, RECEIVE/WI order pins
  (§4-2).
- **R4 (M) — Lift + re-embed.** `importCardScripts` injected op (dedup per O-2, carried-refs key);
  `import-character` re-route; `export-character` junction walk; round-trip tests (ST V2 root + V3
  extensions in; byte-shape-identical extensions out; same-install re-import re-links, zero dupes).
- **R5 (M/L) — Client takeover.** `features/regex` library surface (rows CRUD + global attach);
  preset tab + character facet become pickers (F3 dies); ONE editor dialog; readout resolves the
  attached set + F6 order fix + F4 row removal; settings partition/mirror updates; CT coverage for
  picker + library + readout.
- **R6 (S) — The display tier lives (F1).** Per O-4's ruling: thread the resolved display set into
  `resolveMessageRenderContext` (the one construction site), CT-pin that a `markdownOnly` script
  transforms the rendered body and NEVER the composer/edit textareas or any wire payload.

Total: ~2 weeks of laned work; R1 is the one baseline-touching stage and should land alone.

---

## §8 Verified clean / how this review was grounded

- **Law read IN FULL this session:** `.claude/agent-doctrine.md`; `docs/architecture/core/AGENTS.md`;
  `Core-Laws-and-Precedents.md`; `Core-Path-Registry.md` (all 329 lines, paged); Core-0 §2 + §6
  excerpts; D53/D46/D50/D51/D75/D107/D110/D113/D114/D116/D117/D120 studied against the code.
- **Code read IN FULL:** `contracts/regex`, `kit/regex`, `server/kit/regex`,
  `domain/chat/contract/regex.ts`, `substrate/regex-tier.ts`, `assembly/context.ts:686-830`,
  `engine/pipeline.ts:240-315`, `verbs/edit.ts:155-229`, `client/lib/message-render.ts`,
  `features/chat/lib/message-render-context.ts`, `features/regex/*` (all four files),
  `components/regex-editor-dialog.tsx`, `features/preset/components/regex-tab.tsx` +
  `readout/transforms-readout.tsx`, `features/character/components/character-regex-scripts-field.tsx`,
  `domain/import/substrate/card.ts`, `kit/cel/index.ts`, `kit/macro/index.ts` barrel +
  `user-macros.ts:1-45`, `kit/world-info/index.ts` (matcher), db schemas `world-info.ts` (head),
  `tag.ts` (head), `character.ts` (regex region).
- **Sweeps run (receipts inline above):** repo-wide `regexScript|RegexScript|regex-script` (the
  36-file consumer census); `executeRegexScripts|resolveHostTierRegexScripts|applyReplace|placement`
  (the six-leg census); `displayScripts` (F1 — zero writers); `SLASH_COMMAND` (F4 — zero legs);
  `minDepth|maxDepth` (F5 — zero executors); `use_regex` (inert); `new RegExp(` (the §1b syntax-plane
  census); import/export/profile-import regex paths; `celBindings` threading; test-tree regex census
  (`tests/{contracts,kit,server,client}` regex suites located and greps of the union/order pins).
- **Confirmed intact (no finding):** the kit↔contracts `satisfies` alignment pin; the
  macro-before-regex + template-then-verbatim-splice ordering and its `{{setvar}}` injection defense
  (`kit/regex/index.ts:157,192-208`); the watchdog seam (fixed vm script, no user code, throw-not-
  swallow); member exclusion structural at the sources surface; the serde V2/V3 both-directions
  handling with per-candidate safeParse; the edit-path union + `runOnEdit` filter + no-PRNG stability
  note; D75 compliance (no debug eval routes).
- **NOT read (scope boundary, declared):** the macro engine internals (`parser/evaluator/registry`
  bodies), `Chat-Macro-Resolution.md` beyond the regex-ordering lines, world-info verb bodies,
  automation engine bodies beyond the prompt-transform header, the full preset contracts file, test
  suite bodies (greps only), and no CT/gate battery was run (design review; no diff).

## §9 Unconfirmed suspicions (deliberately NOT findings)

- The `id` dedup in `resolveHostTierRegexScripts` keys on client-minted UUIDs; two carriers could in
  principle collide only by copy-paste of a whole script (same UUID), which is arguably the intended
  shadow. Not a defect; the row-FK dedup in R3 makes it moot.
- `tests/client/features/preset/components/regex-tab.ct.tsx` and the regex-pane CTs were located but
  their bodies not audited for assertion strength (out of scope for a design review).
