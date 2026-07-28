# PARITY-PLUS — the seven-feature "make it first-class and better" program spec

> **Deliverable of the max-effort DESIGN pass commissioned 2026-07-27** (owner greenlight, verbatim:
> "skip spotify and skills and dynamic weather vfx — the rest needs to become first class, in full,
> properly, and even better — I am giving the green light on a max level Fable 5 executor to design and
> build the tits off it"). Seven features, each FIRST-CLASS and measurably BETTER than the marinara
> reference (`neo-tavern/references/rpg-companion-sillytavern`), whose mechanisms are the FLOOR, never
> the ceiling. Produced against the constitution, the lite-substrate spec pattern
> (`reports/lite-plus-guided-substrate-spec.md`), the ALREADY-BUILT rpg-lite domain (W1–W4) + chat
> content pipeline (D44/D45/D51), and the marinara source read where useful (cited per read). Every
> load-bearing tree claim was verified against the working tree this session by direct read.
>
> **Status: DESIGN v2.1 — owner-RATIFIED (v2, 2026-07-27); W4 COMMITTED (fc85f1c0).** v2.1 folds the
> marinara-engine audit's curated STEAL/ADAPT verdicts (`reports/marinara-engine-parser-macro-audit.md`,
> Opus, file:line-evidenced) — a DELTA FOLD onto the ratified v2 body, NOT a redesign (the audit validated
> §12A: no design choice contradicted). House doc style: every non-obvious call carries its WHY + the
> rejected alternative. Same completeness bar — zero build-time improvisation.
>
> **Two owner steers folded in v1 (2026-07-27), recorded verbatim in §4 and §5:**
> - Feature 7 (immersive HTML): *"The fun IS the model making whatever in its HTML — we don't really
>   need to be nazis about it… Treat it like inline artifacts… there's no huge structure for what it
>   makes."* → permissive freeform tierB by default; security at the sandbox boundary, not content
>   policing; scripts-allowed posture argued for the security pass; the ONLY structure is a thin fence.
> - Feature 7 addendum (the card hider): *"That and a hider — so the card doesn't get submitted each
>   turn eating context."* → this GENERALIZED the whole hidden-channel design into a **content-class
>   visibility registry** (§3), which is now the spec's core new machinery.

---

## v2 → v2.1 CHANGELOG (the marinara-audit delta fold — diff-read this first)

The marinara-engine audit (Opus, read-only, file:line-evidenced) VALIDATED §12A — no design choice
contradicted; marinara's `{{macro}}` engine is a less-capable predecessor (staged regex passes, no AST/CEL,
no typed args, no user macros, no variant-scoped vars). Its value is entirely in an ADJACENT output-parser
(D1) + small product/perf patterns. v2.1 folds the curated verdicts; nothing in the ratified v2 body is
rewritten.

- **D1 — the bracket-DSL ROBUSTNESS CONTRACT (STEAL the contract, keep OUR syntax + registry) → §3.2.**
  Marinara's `[tag: attr="value"]` GM-output parser (`game-tag-parser.ts`) is the design cousin of our
  `:::choices`/`:::card`/`<lie>` fences — and it built substantially MORE defensive output-parsing than a
  fence scanner usually has. Ported as a robustness contract on our tokenizer (NOT its syntax): (a) a
  quote/escape/JSON-aware BALANCED walker (survives JSON-in-attributes + streaming-truncated fences); (b)
  ALLOWLIST-STRIP-UNKNOWN (a hallucinated fence/tag drops silently, never leaks into prose); (c) the THREE
  RETENTION VARIANTS — which the audit notes is the SAME idea as our {reading-surface × wire} visibility
  matrix, arrived at independently (the convergence is cited). This is the highest-value fold: it hardens
  the parity-plus fences AND pre-designs full-mode's encounter/skill-check tags (graft doorway #V10).
- **D3 — typed CHOICE-BLOCK input vocabulary (ADAPT onto the FOREIGN-inputs seam) → §12A.5.** The biggest
  §12A enrichment: user-authored typed macro INPUTS — single-select, boolean-toggle, multi-select+separator,
  and RANDOM-PICK-FROM-SELECTED-POOL (a variety mechanic we lack). §12A's user-defined macros get this input
  vocabulary, homed on the FOREIGN-inputs channel (`[[foreign-inputs-seam-for-turn-settings]]`).
- **D2 — strict-author / lenient-render split (ADAPT) → §12A.3.** Folded as the ENFORCEMENT POSTURE:
  `validateTemplate` at the WRITE/author boundary (unknown vars/args = an authoring diagnostic) + lenient
  leave-intact at RENDER (never crash a stale template at generation). Marinara proves the pattern in the
  wild (`prompt-overrides/template.ts`).
- **D5 — var-op-aware memoizing resolver (ADAPT, perf) → §12A note.** Cache-by-template-string with a
  PERMANENT invalidate-on-first-var-op latch (correct because a later READ can observe an earlier WRITE).
  Noted for the hot row-macro resolver.
- **D6 — `{{idle_duration}}` (STEAL) → §12 (P6).** Time-since-last-activity as human text, EXCLUDING the
  in-flight message. Made concrete on the macro-feed list.
- **SKIP (recorded): D4** (var-snapshot commit/rollback — our D46 variant-scoped op-log strictly dominates a
  flat `{...vars}` snapshot); **D7** (WrapFormat xml/markdown/none — assembly-layer, not the macro/parser
  engine; flagged to the assembler owner).
- **Terminology: "narration turn" → "character turn"** throughout (owner-flagged — there is no narration
  round in lite; "narration" collides with group chat's narrator seat). Code-comment rename is a separate
  follow-up.

---

## v1 → v2 CHANGELOG (what moved — diff-read this first)

The owner ratified v1 with rulings that ADD three integration areas and MODIFY five earlier calls. Every
change below is grounded in a tree read this session (the seams named were verified to exist).

**Three NEW integration areas folded in:**

- **(A) The macro × rpg integration — §12 (NEW section).** *WHY it changes the program:* the macro/CEL
  engine is a first-class prompt-authoring surface, and the rpg state should be REACHABLE from it. The
  seam ALREADY EXISTS and is half-built: `MacroContext.rpgMacros` (a staged `Record<string,string>` map,
  `kit/macro/types.ts:167`) with EIGHT registered rpg data-macros (`{{rpgSceneState}}`/`{{rpgCast}}`/…,
  `kit/macro/registry.ts:485`), plus `MacroContext.celBindings` (the `{{expr::…}}` activation,
  `kit/cel`). The rpg gather currently stages `macros: {}` (`chat-ops/gather.ts:48`) — it feeds NONE.
  Ruling A: the gather POPULATES `rpgSceneState`/`rpgCast` (+ the parity-plus planes: relationship,
  quests, delta) from the tracker view, and adds a data-only `rpg` object to `celBindings` so
  `{{expr::rpg.cast.exists(c, c.relationship == "enemy")}}` works. Metadata honesty + cache notes per
  ruling. This is WIRING an existing seam, not new machinery.
- **(B) The regex-engine reconciliation — §3.9 (NEW subsection).** *WHY:* the kit regex engine
  (`kit/regex`) ALREADY has a display-vs-wire split (`DISPLAY` placement + `markdownOnly`/`promptOnly`
  flags) — the SAME two planes my visibility registry (§3) declares. The reconciliation makes the
  relationship explicit: (1) the **markdownOnly-is-leaky argument** — a `markdownOnly` regex hides at
  DISPLAY but NOT on the wire, the exact leak class my hidden-tag server-strip (§3.6) exists to close, so
  the hidden-tag mechanism is NOT "just a markdownOnly script"; (2) **extraction-vs-scripts ordering
  pins** — where the content-span tokenize/filter sits relative to the regex passes; (3) the **display
  choke-point reuse audit** — `renderMessageForDisplay` (`client/src/lib/message-render.ts`: macros →
  DISPLAY-regex → fixMarkdown) is the ONE display pipeline; my render filter composes AFTER it, reusing
  it, never forking; (4) **stub × promptOnly composition** — how the card wire-stub interacts with a
  `promptOnly` regex on the same body.
- **(C) Custom tracked cast-fields — RULED YES, full build (§2.8, NEW).** Previously deferred; the owner
  ruled a full, maximal-reliability build, riding WITH relationship (feature 1). The present-character
  already has `customFields: Record<string,string>` (`snapshot.ts:52`); ruling C makes them FIRST-CLASS
  tracked (host-DEFINABLE field schemas per game, model-written via the enum-constrained `update_scene`
  patch, panel-rendered, delta-diffed) rather than an opaque free record.

**Five MODIFICATIONS to v1 rulings:**

- **M1 — custom-relationship HINTS.** The `{kind:"custom", label}` relationship (§2.1) gains an optional
  host-authored HINT per custom kind (a short prose gloss the reminder + `constrainExtractionSchema`
  enum-description carry), so a custom "vassal" steers as precisely as the five built-ins. (§2.1 updated.)
- **M2 — the card KEEP-LAST-X knob is SHIPPED, not deferred.** v1 argued immediate-total-collapse with
  keep-last-N as a deferred doorway. The owner ruled it a shipped knob: `config.features.cardKeepLastX`
  (default 0 = immediate collapse — v1's argued posture stays the DEFAULT). (§3.5 + §9 updated.)
- **M3 — the interactive-HTML toggle GOVERNS THE ASK.** The `immersiveHtml` knob (§9) splits: a card
  always RENDERS if emitted, but a new `immersiveHtmlInteractive` sub-toggle governs whether the TEACHING
  injection asks for scripts/interactivity (some hosts want static cards only). (§4.2 + §9 updated.)
- **M4 — a HOST-OF-ROOM hidden-content toggle.** The deception/omniscience reveal (§3.6) gains a
  host-of-room toggle governing whether the reveal EYE is offered at all (a host may run pure hidden —
  no reveal surface even for themselves). (§3.6 + §9 updated.)
- **M5 — the GUIDED-WAND re-homing of CYOA + plot (reshapes §5/§6).** v1 homed the plot buttons in a
  bespoke send-area row. The owner ruled they re-home into the EXISTING composer-wand
  (`composer-wand.tsx` — THE guided-generations menu, `[[no-separate-reduced-modes]]` already its law).
  Plot-steers become wand MENU ITEMS; CYOA choices still render inline (they're model output), but the
  "start CYOA mode" affordance and the plot steers ride the wand's guided-action fire path
  (`use-guided-actions` → `chat.generate` with a steer). (§5.3/§5.4 + §6.3/§6.4 updated.)

**Plus: options-first defaults (M6-class) + the D79 delta-heal audit (ruling #10):**

- **Options-first defaults** — where a knob's default was argued as a scalar, v2 re-frames the
  user-facing surface as OPTIONS the host picks at game creation (not buried config), per the ratified
  "options-first" posture. (§9 reframed as a create-time options panel + advanced config.)
- **Delta graceful-degrade via the D79 heal audit (ruling #10)** — the delta block (§2.7) and the
  extraction path get a HEALING arm consistent with D79 (the ONE structured-output stack: the
  zod→JSON-Schema projector + `ResponseFormat` degrade). A malformed/partial extracted delta HEALS to a
  best-effort partial rather than dropping whole. §10 leaves a SEAM for E2E round-4's named cause of the
  reliable empty-delta behavior (the coordinator forwards it if it lands mid-build).

**Section renumbering:** v1 §12 (cover summary) → v2 §13; the new integration sections slot as §2.8 (C),
§3.9 (B), §12 (A). Everything else keeps its number.

---

## 0. The program on one screen

1. **Nothing here is greenfield.** The rpg-lite domain is BUILT (`domain/rpg` — verbs/tools/gather/
   snapshot/extraction, the CP-4 takeover client) and the chat CONTENT pipeline is BUILT (D44/D45/D51:
   `MessageContentBlock` union with a live `html-card` arm, the `SandboxFrame` tierB renderer, the
   `tokenizeContent`→`contentSpansToBlocks` render projection, the `toContentParts` wire projection).
   Every feature OVERLAYS onto existing seams. The graft discipline of the lite spec applies: ADD, never
   re-spell.
2. **Four genuinely-new mechanisms; everything else reuses a built seam:**
   - **§3 — the content-class VISIBILITY REGISTRY** (the substantial new machinery). Two orthogonal
     planes — reading-surface `{show|hide}` × wire `{full|stub|drop}` — declared in an OPEN REGISTRY, one
     row per content class. `<lie>`/`<ofilter>` = `{hide, full}` (features 3+4); `html-card` =
     `{show, stub}` (feature 7); CYOA `choices` = `{show, full}` (feature 5); ordinary prose =
     `{show, full}`. ONE mechanism, driven by generic tag-class (`HIDDEN_TAGS`) + fence-class
     (`DIRECTIVE_FENCE_NAMES`) registries — a future channel is a REGISTRATION, not a build. Spend the
     depth here.
   - **§2.7 — the DELTA BLOCK** (coordinator-identified gap): a deterministic prev→current snapshot diff
     on the selected lineage, rendered before the steering license so "let the change land in the fiction"
     finally has a referent. Per-plane registered renderers; the relationship delta line IS feature 1's
     steering loop. Closes an instruction the input couldn't support.
   - **§2.1 — the closed RELATIONSHIP vocab** (`{kind, label}` — closed enum + `custom` escape) threaded
     through the extraction ENUM machinery so writes are vocabulary-exact — the "better" over marinara's
     free-text relationship string. Extends to per-game vocab without migration.
   - **§5 — the CYOA structural CHOICE grammar** + the click→send wiring — clickable affordances, the
     "better" over marinara's dead prose list; the fence grammar is REUSABLE by any clickable-affordance
     feature.
3. **The other four ride built planes:** relationship badge (§1) on the cast panel; level (§2) a nullable
   int on the sheet; plot progression (§6) a pair of one-shot steering injections fired by a button
   (mechanically the marinara floor, homed on the rpg turn-send path); immersive HTML render (§7) is
   already built — feature 7 is a thin fence + injection + the stub-collapse from §3.
4. **Homes obey the domain map** (§8 states each): injections own delivery; rpg owns the
   relationship/level/plot planes; chat CONTENT owns the html-card + hidden-tag grammar and the two
   projection seams (render + wire); the reading-surface filter is the client message surface.
5. **Applicability:** these are all knobs on the GAME config (`rpg_games.config`), argued per-feature in
   §9 with default postures. They are not preset-level or chat-level — they are rpg-game behaviors, and
   the game config is their one home (the lite spec's `config.lite` precedent). `[[no-separate-reduced-modes]]`:
   one real surface, honest PHASE/PERMISSION/APPLICABILITY arms.
6. **Security:** the html-card scripts posture (§4) and the hidden-content host-reveal surface (§3.6) are
   the two places this program touches a trust boundary. Both are FLAGGED for a `security-executor` pass
   at build time (§10) — policy, not doubt. The persona pin mechanics are untouched (owner-sacred).

---

## 1. Verified tree facts this design stands on

Read with own eyes this session (paths current tree):

- **The chat CONTENT render model is D44/D51, built.** `packages/contracts/src/chat/content-blocks.ts`:
  `messageContentBlockSchema` is a discriminated union `{markdown | media | html-card}`; `html-card`
  carries `{html, css?, trust: "tierA"|"tierB"}` and is EXPLICITLY reserved — the header:
  *"The `html-card` extraction grammar is NOT parsed here — it lands with the chat-content wiring that
  defines how a card is embedded in a stored body (the union member is born-compliant)."* Feature 7 IS
  that wiring.
- **The render projection is `tokenizeContent`→`contentSpansToBlocks`.** `@orb/kit/content` (D51): a
  single-regex `![alt](target)` tokenizer producing text/image spans; DEGRADES never throws on persisted
  content. `contentSpansToBlocks` joins consecutive text → one `markdown` block; the client twin is
  `toContentBlocks` (`features/chat/lib/content-blocks.ts`). This is where the reading-surface plane of
  the matrix operates (§3.4).
- **The wire projection is `toContentParts`** (`domain/chat/engine/pipeline.ts:613`), called at
  `pipeline.ts:369-374` — *"the ONE seam where the shaped string body becomes content-parts."* It
  `tokenizeContent`s each history row's body into `ChatContentPart[]`, resolving/dropping image refs by
  `input.vision`. All six connection modes consume the resulting `TurnMessage[]`, so a transform HERE
  collapses identically on every wire. This is where the WIRE plane of the matrix operates (§3.5). It
  already demonstrates the pattern: a dropped image leaves an alt placeholder (`droppedImagePlaceholder`,
  `pipeline.ts:607`) so a wire-emptied row doesn't 400.
- **The tierB security boundary is TWO files, doored-not-walled.** `packages/ui/src/content/sandbox-frame/`:
  `SandboxFrame` renders tierB inside `<iframe sandbox={SANDBOX_ATTR} srcDoc=…>`; `srcdoc.ts` owns
  `SANDBOX_ATTR = ""` (null origin, NO scripts, NO same-origin) + `CSP = "default-src 'none'; img-src
  'self'; media-src 'self'; style-src 'unsafe-inline'; font-src 'self'"`. The header says it outright:
  *"Interactivity is doored not walled — a trusted card later flips `allow-scripts`, a one-attribute
  change here."* Feature 7's scripts posture (§4) is exactly that flip.
- **Render trust is server-resolved, fail-closed.** `features/chat/lib/render-trust.ts`:
  `resolveRowRenderPolicy` returns `{trust: "trusted"|"untrusted", allowExternal}` from the
  server-resolved `ParticipantView.renderPolicy` (`SAFE_FLOOR = {trustHtml:false, forbidExternalMedia:true}`
  when absent). `message-content.tsx` dispatches `html-card` by `block.trust`: tierB → `SandboxFrame`,
  tierA → sanitized `Markdown trust="untrusted"`. The trust model EXISTS; feature 7 wires INTO it (§4.3).
- **The rpg present-character schema is the relationship home.** `contracts/rpg/snapshot.ts`
  `rpgPresentCharacterSchema = {key, name, characterId?, emoji, mood, appearance?, outfit?, thoughts?,
  customFields}`. Relationship (§1) is a first-class field here, NOT a `customFields` entry.
- **The rpg sheet is the level home.** `contracts/rpg/sheet.ts` `rpgSheetSchema = {className, attributes,
  poolDefs, maxHp, flavor}` — a per-actor IDENTITY plane, `patchSheet`-editable (`verbs/game`). Level
  (§2) is a nullable int here.
- **The extraction ENUM machinery is built and live-verified.** `contracts/rpg/extraction.ts`
  `constrainExtractionSchema(schema, refs)` injects a per-call `enum` into the projected JSON-Schema's
  ref fields so an invalid write is unrepresentable at the token level (LIVE-VERIFIED 2026-07-27: vLLM
  xgrammar + OpenRouter strict json_schema both bind it). Feature 1's closed relationship vocab rides
  this exact mechanism (§1.3). Both delivery modes share `toolCallsToExtraction`→`extractionToStateDelta`.
- **The steering injection is `buildLiteReminder`** (`domain/rpg/substrate/reminder.ts`), delivered as
  ONE depth-0 `role:"system"` `ChatInjection` on `RpgGatherResult.injections` (`chat-ops/gather.ts:40`);
  the char turn is tool-less prose, state captured by a post-commit round. The feature teaching-blocks
  (§3.3, §5.2, §6.2, §7.5) compose here, gated by config. `RPG_STEERING_LICENSE` is a versioned constant
  — the feature teaching-prose follows that pattern.
- **Injections survive assembly wire-agnostically.** `assembly/injections.ts`: injection `content` is
  framed by role + spliced by depth; NO step tokenizes or strips prose, so a `<lie>`/`<ofilter>` tag or
  a card fence in a body/injection passes through untouched (the tags are wire-agnostic prose — §3.7 pins
  the parity). System-injection delivery is capability-gated (`turns.midConversationSystem`); the feature
  teaching-blocks ride the ONE reminder injection, so they inherit its resolved delivery.
- **The rpg config blob is the applicability home.** `contracts/rpg/config.ts` `rpgGameConfigSchema =
  {statProfile, lite: {steeringNote}, extractionMode}` — additive JSON fields self-heal at the parse seam
  (no version stamp; rpg tables carry no versioned-config column). The feature knobs (§9) land in a new
  `config.features` sub-object.
- **New rulings mint at D108+** (`Core-Laws-and-Precedents.md` — D106 highest live; D79–D105 reserved;
  D107 referenced by the lite spec's knob-wire program). This program mints one D-entry at land (§11).
- **Marinara is the FLOOR** (read this session, cited): plot progression = a button firing a one-shot
  injected prompt (Random = a `{{random::…}}` twist roll; Natural = "progress it, reintroduce an
  unresolved plot point") — `src/systems/features/plotProgression.js`; the four teaching prompts
  (`DEFAULT_DECEPTION_PROMPT` `<lie character type truth reason/>`, `DEFAULT_OMNISCIENCE_FILTER_PROMPT`
  `<ofilter event reason/>`, `DEFAULT_CYOA_PROMPT` "a numbered list of 5 options", `DEFAULT_HTML_PROMPT`
  "inline HTML/CSS/JS… do not wrap in code fences") — `src/systems/generation/promptBuilder.js`;
  relationship = a free-text `Relationship:` string on a present character (`utils/presentCharacters.js`);
  level = a hand-edited, model-EXCLUDED field (`excludeFields` set has `'level'`,
  `src/systems/rendering/userStats.js`). Marinara has NO reveal UI for hidden tags — ST swallows the
  unknown self-closing tags at render; the model still sees them in history. Every "better" below is
  measured against these.

---

## 2. SECTION A — the two OTHER-AUTHOR planes: RELATIONSHIP (feature 1) + LEVEL (feature 2)

These two are pure data-plane adds — the smallest features, done first because they shake out the
extraction/panel/sheet seams the rest reuse.

### 2.1 Relationship — a first-class field on the present character (feature 1)

**Home:** `rpgPresentCharacterSchema` (`contracts/rpg/snapshot.ts`), a new `relationship` field — NOT a
`customFields` entry. *WHY first-class:* relationship is the genre's load-bearing steering datum (the
closed loop the directive names as "the point"); a `customFields` string is unlabelled free text the
enum machinery can't constrain and the panel can't badge distinctly. A named field gets the vocab
constraint (§2.3), a dedicated panel badge (§2.5), and its own reminder line (§2.4).

**Vocab shape — CLOSED ENUM with an explicit `custom` escape, NOT free text and NOT a bare closed enum.**

```ts
// contracts/rpg/enums.ts — the genre floor + the escape.
export const RPG_RELATIONSHIP_KINDS = ["lover", "friend", "ally", "neutral", "enemy", "custom"] as const;
export type RpgRelationshipKind = (typeof RPG_RELATIONSHIP_KINDS)[number];
```

```ts
// contracts/rpg/snapshot.ts — the field on rpgPresentCharacterSchema.
relationship: z.object({
  kind: z.enum(RPG_RELATIONSHIP_KINDS).default("neutral"),
  /** Free label used ONLY when kind === "custom" (e.g. "rival", "reluctant employer"). Empty otherwise. */
  label: z.string().default(""),
}).default({ kind: "neutral", label: "" }),
```

*WHY closed-enum-with-`custom`-escape* (the load-bearing vocab decision): marinara's free-text
relationship is the floor and its flaw — the model writes "kind of friendly but suspicious", the panel
can't badge it, nothing steers consistently. A BARE closed enum is the naive "better" but foreclosed —
genres have relationships the five don't name ("rival", "mentor", "captor"). The `custom` arm is the
extensible shape (`[[lock-the-extensible-shape]]`): the panel badges the five known kinds with distinct
color/icon and renders `label` for `custom`; the reminder states the kind (or the custom label); the
extraction enum (§2.3) constrains `kind` to the six tokens so the model can NEVER emit an off-vocab kind,
but CAN reach any relationship through `{kind:"custom", label:"…"}`. Ordering of the five is
lover→friend→ally→neutral→enemy (a warmth axis) so a future gradient render is a sort, not a re-map.
*Rejected:* free text (the floor — unbadgeable, unsteerable); bare closed enum (foreclosed — genres
outgrow five); `customFields.relationship` (unlabelled, unconstrained, un-badgeable — the anti-pattern).

**Extends without migration (owner emphasis).** The `{kind, label}` shape is the extensible one: (1) the
`custom` arm already admits ANY relationship via `label` with zero schema change (the escape valve); (2)
a future PER-GAME vocab OVERRIDE (a game defining its own named kinds — "vassal", "sworn enemy") lands as
an additive `config.features.relationshipVocab?: string[]` that EXTENDS the enum the extraction constraint
binds (the R1 `constrainExtractionSchema` machinery already injects a per-call enum from a dynamic list —
§2.3 — so a per-game vocab is just a longer enum list, no core change), and a stored `{kind:"custom",
label:"vassal"}` is FORWARD-compatible with that game later promoting "vassal" to a first-class kind (the
label is preserved). *This is why `{kind, label}` beats a bare enum:* the per-game-vocab doorway (§8 graft
map #R1) is additive on this shape, migration-free. **Graft doorway #R1.**

**M1 (v2) — custom-relationship HINTS.** A custom kind gains an optional host-authored `hint` (a short
prose gloss, ≤120 chars) defined per game in `config.features.relationshipHints: Record<string, string>`
(a `label → hint` map — e.g. `{"vassal": "sworn to serve the player but resentful of it"}`). *WHY:* a
built-in kind (`enemy`) carries its steering meaning implicitly; a bare custom `label:"vassal"` does not —
the model reads "vassal" and guesses. The hint gives a custom kind the SAME steering precision as the five
built-ins: the reminder's cast line renders `Mari — vassal (sworn to serve but resentful)`, and the
`constrainExtractionSchema` enum-description for the `custom` value carries the hint so a schema-enforcing
backend sees the gloss. The `{kind, label}` on the snapshot is unchanged (the hint is game CONFIG, not
per-cast state — one home, no per-row duplication); a custom `label` with no configured hint renders the
bare label (backward-compatible). *Rejected:* a per-cast hint on the snapshot (duplicates the gloss on
every cast member sharing a custom kind — the hint is a property of the VOCAB, not the instance).

**Per-present-character, not per-actor.** Relationship is a property of a cast member AS PRESENT IN THE
SCENE (marinara's placement — it lives on the present character). It rides the swipe-volatile plane
inside `presentCharacters` (the snapshot), so it is swipe-consistent by construction and clone-forwards
like every cast field. A relationship toward the PLAYER is the default reading (the cast member's stance
toward the protagonist); a future per-pair matrix (character↔character) is an additive `toward?` field —
NOT built (§9 defers it), doorway kept.

### 2.2 The extraction/tool thread — relationship writes ride `update_scene.presentUpsert`

The present-cast patch already flows through `update_scene.presentUpsert[]` (`contracts/rpg/tools.ts`).
Add `relationship` to that patch arm (MA-4 patch semantics: omit = keep, so an unchanged relationship is
never re-sent):

```ts
// tools.ts updateSceneArgsSchema.presentUpsert[] item — add:
relationship: z.object({
  kind: z.enum(RPG_RELATIONSHIP_KINDS),
  label: z.string().optional(),   // only meaningful for kind:"custom"
}).optional(),
```

This threads AUTOMATICALLY through the reliable extraction schema (`rpgExtractionSchema.scene` derives
from `updateSceneArgsSchema` — the shared-plane proof) and the cheap tool round (same schema). Zero
extra wiring: the one schema edit lands in both delivery modes.

### 2.3 The enum constraint — relationship is vocabulary-EXACT at the token level (the "better")

`update_scene.presentUpsert[].relationship.kind` is an `enum` in the projected schema BY CONSTRUCTION
(it is `z.enum` — `z.toJSONSchema` emits the `enum` node with the six tokens). So a schema-enforcing
backend (vLLM xgrammar / OpenRouter strict) can NEVER emit an off-vocab kind — the exact "your enum
machinery makes writes vocabulary-exact" the directive asks for, achieved for FREE by the field being an
enum (no `constrainExtractionSchema` call needed — that function injects PER-CALL ref enums for
dynamic sets like roster names; a static vocab enum is already in the schema). The reminder's teaching
line still enumerates the five + "or a custom label" as the fallback arm for a non-enforcing model.
*This is the measurable "better": marinara's relationship is whatever prose the model felt like; ours is
one of six tokens, enforced.*

### 2.4 Reminder line + the journal-beat surfacing (the "even better")

The `castLine` in `buildLiteReminder` (`substrate/reminder.ts`) gains a relationship segment:
`- 🗡️ Zandik — wary — rival (custom) — …`. The relationship STEERS (the closed loop): the model reads
the current stance and plays it.

**Relationship-change as a journal beat (the directive's "consider" — SPEC'S LEAN: YES, ship it).** We
have a journal (marinara does too, but does not tie relationship to it). When an extraction/tool round
changes a present character's `relationship.kind` from its prior snapshot value, the flush stages an
automatic journal entry (`type: "event"`, title `"<name>: <old> → <new>"`) — a derived beat, not a
model write. *WHY:* the relationship arc IS the story in this genre; a durable, swipe-consistent record
of "when did she turn" is exactly the journal's job, and deriving it at the flush seam (where we already
diff staged-vs-base for the clone-forward) costs one comparison. *WHY derived not model-authored:* asking
the model to ALSO log the change is a second failure point; the flush already has both old and new state
in hand. Gated by the feature knob (§9 #1) AND the journal axis (`MODE_POLICY.lite.journal`, already
true). *Rejected:* no beat (loses the arc record — marinara's gap); model-authored beat (redundant
failure point).

### 2.5 Panel badge (the visible surface — side-eye moment)

The cast display (`features/rpg/components/rpg-scene-tab.tsx` — the Scene tab renders `view.cast`) gains
a relationship badge per cast row: the five known kinds get a distinct token color + icon
(lover=heart/rose, friend=warm, ally=cool, neutral=muted, enemy=danger); `custom` renders the `label`
as a neutral chip. Uses the existing tracker-kit a11y model (`[[tracker-kit-a11y-model]]`: TEXT is the
datum — the badge has a visible/aria label, the color is decoration). This is a `side-eye` surface (§10).

### 2.6 Level — a nullable int on the sheet, HAND-ONLY (feature 2)

**Home:** `rpgSheetSchema.level` (`contracts/rpg/sheet.ts`), `z.number().int().min(0).nullable()`, born
null. **Identity plane** (like `className`/`attributes`), `patchSheet`-editable, rendered on the Sheet
tab + the header band.

**Model-writable? NO — hand-only (the honest call, agreeing with marinara).** *WHY hand-only:* level is a
progression dial the HOST/player owns — it is not a beat-driven fact like HP or location that the narration
naturally produces. Marinara EXCLUDES it from model parsing deliberately, and that instinct is right: a
model bumping "level" off a vibe is exactly the "the model set my STR to 3" class the whole no-`update_stats`
ruling (lite spec §2.5) exists to prevent. Level has no `update_*` tool arm and is ABSENT from the
extraction schema — it is reachable only through `patchSheet` (host any; member their own `user` ref, per
the editable-in-place law). *This is a case where "better than marinara" means MATCHING her restraint, not
adding a capability* — the directive explicitly invited "decide honestly… maybe right." It is right.
*Rejected:* a model-writable level (the progression-inflation footgun; no beat produces it honestly);
level on the snapshot volatile plane (it is identity, not scene-volatile — it belongs with `className`).

**Render:** Sheet tab shows `Level N` (omitted when null — the nullable-honesty posture, no phantom
"Level 0"); the header band (`rpg-header-band.tsx`) shows the viewer's-actor level beside the name. A
future "auto-level-on-milestone" is an additive host toggle — not built.

### 2.7 The DELTA BLOCK — a prev→current diff so prose can identify what changed (owner-identified gap)

**The gap has teeth.** `RPG_STEERING_LICENSE` instructs *"when a value changes, let the change land in
the fiction"* — but the reminder carries only ABSOLUTES (the current tracker view), and the state round is
EPHEMERAL (the tool round / reliable extraction runs post-commit; its calls NEVER enter the transcript —
`chat-ops/flush.ts`). So the model is told to react to changes but is given no input that says WHAT
changed: it can only guess from the absolute state vs its own fading memory. We shipped an instruction the
input can't support. This section closes it.

**The mechanism: a deterministic prev→current SNAPSHOT DIFF on the SELECTED lineage, rendered compact in
the reminder.** The gather already resolves the current snapshot (the resolution-ladder head); it
additionally resolves the PREVIOUS committed snapshot on the same selected-variant lineage (the ladder
already walks the selected-variant chain — supplying "the snapshot one committed beat back" is a second
ladder read, same chain). The pure diff fn (beside the reminder, `substrate/delta.ts`, ZERO I/O — the
gather hands it both snapshots, matching the reminder's purity comment) produces a compact block:

```
CHANGES SINCE LAST BEAT: You HP 12→16 (+4) · potions ×2→×1 · +Bleeding (Zandik) · location → Village of
Dunmoor · Mari: friend → wary · quest "The Missing Key" completed
```

**Swipe-consistency falls out** (the owner's own observation): a swipe re-resolves BOTH ends on the newly
selected lineage, so the delta is always prev→current for the CURRENTLY selected variant chain — the same
resolution machinery that makes the absolute view swipe-consistent makes the delta swipe-consistent, for
free.

**Diff coverage — every write source uniformly.** The diff compares two SNAPSHOTS, so it is agnostic to
what produced the change: a tool round, a reliable extraction, AND a HAND EDIT all land in the snapshot,
so a GM tweak lands in the fiction next turn (a feature, per the owner — the host nudges state and the
model reacts). Per-plane rendering rules (a REGISTERED per-plane renderer, §2.7.1 — not a monolith):

| Plane | Diff rendering |
|---|---|
| HP / pools | numeric delta with sign: `HP 12→16 (+4)`, `mana 5→2 (-3)` |
| conditions | added/removed set: `+Bleeding`, `-Poisoned` (per actor) |
| inventory | added/removed/qty: `+Rope`, `-Torch`, `potions ×2→×1` |
| wallet | numeric delta: `gold 40→55 (+15)` |
| ambient | scene transitions: `location → Village of Dunmoor`, `time → night`, `weather → storm` |
| present cast | joined/left: `+Zandik enters`, `-Mari leaves` |
| **relationship** (feat 1) | `Mari: friend → wary` — the relationship-change delta line IS the steering loop feature 1 wants (designed together, per the coordinator) |
| quests | status flips: `quest "X" completed`, objective `X: 1/3 → 2/3` |
| journal beats | **EXCLUDED** — beats already ride the reminder's "Recent beats" absolute list; a beat is an append, not a mutation, so a delta line would double it |
| widgets | numeric/set delta like pools |
| level | EXCLUDED — hand-only identity, not a beat-driven change the prose reacts to |

**First-snapshot arm (no prev):** label as INITIAL STATE, not everything-changed noise —
`SCENE OPENS:` + a one-line setting summary (or omit if the born state is empty), NOT `HP →12 · potions
→×2 · …` (which would read as "everything just changed" and mislead the prose). *WHY:* turn 1 has no
prior beat; presenting the born state as a delta is a lie about causality.

**No-change arm: OMIT the block entirely (byte-stable), not an explicit "no changes."** *WHY omit (argued
for cache + budget):* an emitted "CHANGES SINCE LAST BEAT: none" line is (a) prompt-budget waste every
quiet turn, and (b) a STABLE line that adds nothing — but more importantly, the delta block sits in the
VOLATILE reminder tail (regenerated every turn anyway, so cache isn't the driver here) — the real reason
is prompt HYGIENE: a "no changes" line trains the model to expect the block and can prompt it to
manufacture a change to fill it. Omission is the honest quiet-turn signal (no delta line = nothing moved).
*Rejected:* an explicit "no changes" (budget waste + a manufacture-a-change footgun).

**Placement in the §4.7 assembly order: BEFORE the license** (the coordinator's steer, correct). New
order in `buildLiteReminder`: (1) state block (absolutes) → (2) **DELTA block** → (3) steering license →
(4) update guidance (tool turns only — but the char turn is tool-less prose, so this is off on the char
turn) → (5) steering note. *WHY before the license:* the license says "let the change land in the
fiction" — placing the delta block immediately before it gives that instruction its REFERENT (here is
what changed; now let it land). *Rejected:* after the license (the instruction would precede its data);
inside the state block (the delta is a different KIND of datum — a mutation, not an absolute — and mixing
them muddies both).

**Freshness semantics match the existing posture** (the one-beat-lag ruling, `[[history-floor-authority-is-clamp-resolver]]`
/ the `RpgGameView.extractionMode` freshness note): the delta is as-of the LAST FLUSH (prev→current
committed snapshots). Under `reliable` mode the tracker lags one beat by construction (extraction runs
after the char turn commits), so the delta describes changes from the beat-before-last to the last
committed beat — exactly the same as-of horizon the absolute view and the freshness indicator already
use. No new freshness concept; the delta rides the existing lag ruling unchanged.

#### 2.7.1 Extensibility — the diff renderer is PER-PLANE REGISTERED, not a monolith

A single `diffSnapshots(prev, cur) → string` monolith would need editing for every new plane. Instead a
REGISTRY of per-plane diff renderers (the `CONTENT_CLASS_POLICY` / `RPG_PLOT_STEERS` registry pattern):

```ts
// substrate/delta.ts — the per-plane diff registry (pure, zero I/O).
export interface PlaneDiffRenderer<T> {
  readonly plane: string;                              // "hp" | "relationship" | …
  render(prev: T | undefined, cur: T | undefined): readonly string[];   // the delta lines this plane emits
}
// The delta block = the ordered concat of each registered renderer's lines over the two snapshots.
export const PLANE_DIFF_RENDERERS: readonly PlaneDiffRenderer<unknown>[] = [ /* hp, pools, conditions, … */ ];
```

A new plane (the incoming relationship field is the FIRST new registrant — designed with feature 1 per
the coordinator; a future full-mode plane like reputation/faction is the next) declares its
`PlaneDiffRenderer` and the delta block picks it up — no monolith edit. **Graft doorway #D1 (§8.5-adj):**
a new tracked plane = a `PLANE_DIFF_RENDERERS` entry; the delta block, gather read, and placement are
byte-stable. *This is where relationship + delta are designed together:* the relationship plane's diff
renderer emits `Mari: friend → wary`, which is BOTH the delta block's steering line AND the closed-loop
signal feature 1's whole point depends on.

#### 2.7.2 Home + wiring

- **Pure diff fn:** `substrate/delta.ts` — beside `reminder.ts`, zero I/O (the gather resolves both
  snapshots and hands them in — the existing `substrate/` purity contract).
- **Ladder read extension:** `chat-ops/gather.ts` resolves the previous-committed snapshot on the
  selected lineage (a second ladder read; `persistence/` supplies it — the ladder already walks the
  chain). The gather passes `{ view, prevSnapshot, curSnapshot }` to `buildLiteReminder`.
- **Renderer:** `buildLiteReminder` calls the delta block builder between the state block and the license.
- **Config:** the delta block is ALWAYS ON (it is not a play-style knob — it is the input the license
  already assumes; shipping the license without it is the bug this closes). No knob. *WHY no knob:* a
  host turning off the delta would re-open the exact gap (the license references changes with no
  referent) — the honest-arms doctrine forbids shipping the instruction without its input.

#### 2.7.3 Tests + wave

- **Diff correctness per plane** (numeric sign, set add/remove, scene transition, relationship flip,
  quest status); **first-snapshot arm** (initial-state label, not everything-changed); **no-change arm**
  (block omitted, byte-stable); **swipe-consistency** (swipe re-resolves both ends → the delta describes
  the selected lineage); **hand-edit source** (a `editSnapshot` change appears in the next delta — the GM
  tweak lands); **per-plane registry** (a new renderer contributes without a monolith edit).
- **Build wave: right after the W4 commit** (NOT the current uncommitted batch — coordinator's
  sequencing). It is rpg-substrate; it slots as **P0** (before P1) since the whole program's steering
  loop (and feature 1's relationship delta) depends on it, and it is self-contained (contracts already
  hold the snapshot shape; it is a pure fn + a gather read + a reminder placement).

#### 2.7.4 Delta + extraction GRACEFUL-DEGRADE — the D79 heal arm (ruling #10)

The owner ruled the delta/extraction path must DEGRADE gracefully, not drop whole, consistent with the D79
"ONE structured-output stack" (`Core-Path-Registry.md` D79 — the zod→JSON-Schema projector + `ResponseFormat`
interactive-axis degrade; the extraction schema already rides it via `projectJsonSchema`). Two heal arms:

- **Delta heal (§2.7):** the diff is a PURE fn over two snapshots — it cannot fail on well-formed state.
  Its degrade is DEFENSIVE: a plane whose prev/cur shape is unexpectedly malformed (a hand-edit or a
  future applier bug slipping a bad shape past the write backstop — which §10's F1 backstop should
  prevent, but the delta must not crash if it doesn't) SKIPS that plane's delta line (the other planes
  still render) rather than throwing in the reminder path. The delta NEVER breaks a turn's assembly.
- **Extraction heal (the D79-consistent arm):** the reliable extraction already drops a NON-CONFORMING
  parse to the empty delta (`buildRunExtraction`, `compose/rpg.ts` — the byte-identical non-writing turn).
  Ruling #10 sharpens this to a PARTIAL heal: a PARSED-but-partially-invalid extraction (some plane
  entries valid, some not) should apply the VALID entries and drop only the invalid ones, not the whole
  object. The fold (`extractionToStateDelta`) already re-validates each entry per-arm and drops a bad one
  (`toolCallsToExtraction` does this for the tool round); the reliable path's `rpgExtractionSchema.safeParse`
  is all-or-nothing at the top level. The heal: parse each plane ARRAY leniently (drop bad elements, keep
  good ones) rather than failing the whole extraction — the same errors-as-data-per-element posture the
  tool round already has, applied to the structured arm for symmetry. *WHY:* an 8B that gets ONE party
  entry's shape wrong shouldn't lose the location write too. This is the D79 "degrade the interactive
  axis, don't fail the turn" posture applied to the extraction plane.
- **§10 SEAM for E2E round 4:** the coordinator flagged that round 4 may name the CAUSE of reliable's
  empty-delta behavior (the diagnosis my fix stint surfaced: the live "NO FLUSH" was the extraction
  returning empty, not the write-boundary dropping). If round 4's finding names a specific healable cause
  (e.g. the extraction needs a JSON-repair arm for a near-miss structured output, or a specific field the
  8B mis-shapes), §10's robustness coverage has a NAMED SLOT for it (§10 "extraction heal — round-4 cause").
  This spec does not guess the cause; it reserves the heal arm's shape so the finding lands additively.

---

### 2.8 CUSTOM TRACKED CAST-FIELDS (feature C — RULED YES, full build, rides with relationship)

The owner ruled a full, maximal-reliability build of custom tracked cast-fields, riding WITH feature 1
(relationship) — they share the present-character plane, the `update_scene` write path, the panel, and the
delta. Previously the present-character's `customFields: Record<string,string>` (`snapshot.ts:52`) was an
OPAQUE free record the model filled ad-hoc. Ruling C makes them FIRST-CLASS: host-DEFINABLE field schemas
per game, model-written vocabulary-exact, panel-rendered, delta-diffed.

**The field-schema definition (host-authored, game config):**

```ts
// config.features.castFields: the host defines which tracked fields cast members carry.
castFields: z.array(z.object({
  key: z.string().min(1),          // the stable field key (e.g. "arousal", "trust", "suspicion")
  label: z.string().min(1),        // the display + reminder label
  kind: z.enum(["text", "meter"]), // text = free string; meter = a 0-max numeric with a bar
  max: z.number().int().min(1).optional(),  // for meter kind — the bar's max
  hint: z.string().max(120).optional(),     // the steering gloss (like M1's relationship hint)
})).default([]),
```

**Why first-class beats the opaque record** (the "maximal reliability" the owner wants): (1) a defined
field schema lets `constrainExtractionSchema` (§2.3) bind the field KEYS to an enum — the model can only
write DEFINED fields, never invent `customFields.randomJunk`; (2) a `kind:"meter"` field renders a bar
(the tracker-kit `TrackBar`, `[[tracker-kit-a11y-model]]`) not a raw string; (3) the `hint` steers; (4)
the delta (§2.7) diffs a meter field numerically (`suspicion 3→7 (+4)`) and a text field as a transition.
The opaque record gave NONE of this — it was unbadgeable, unconstrained, un-diffable.

**The write path (rides `update_scene.presentUpsert[].customFields` — already exists):** the tool's
`customFields` array-of-pairs (`tools.ts:86`) is CONSTRAINED at projection: the pair `name` is enum'd to
the defined field keys (a model writing an undefined field key is unrepresentable under a schema-enforcing
backend — the R1 machinery, applied to cast-field keys). A `meter` field's `value` is validated numeric.
This threads through BOTH delivery modes (reliable extraction + cheap tool round) automatically — the one
schema edit lands in both (the shared-plane proof).

**Storage — the record stays, the SHAPE gains structure at the read seam.** `customFields:
Record<string,string>` on the snapshot is UNCHANGED (zero migration — a meter value stores as its string
form, parsed against the field's `kind` at read). *WHY not re-type the record to a typed union:* the
record is already stored + swipe-consistent; re-typing it is a migration for zero gain — the field SCHEMA
(config) provides the type, the record provides the value, and the read seam (`buildTrackerView`) joins
them. A field the host DELETES from the schema leaves orphan values in old snapshots (harmless — the read
projects only defined fields; the orphan is inert history, the [stamped-id write-boundary] posture).

**Panel + reminder + delta:**
- Panel (Scene tab, `rpg-scene-tab.tsx`): each cast row renders its defined fields — `meter` as a
  `TrackBar` (value/max), `text` as a labelled chip. Host-editable in place (the editable-in-place law).
- Reminder (`castLine`, `substrate/reminder.ts`): `- Mari — wary — suspicion 7/10 — trust: low` (the
  hint-glossed, kind-aware line).
- Delta (§2.7 per-plane renderer): a cast-field renderer emits `Mari suspicion 3→7 (+4)` (meter) /
  `Mari trust: guarded → open` (text) — a new `PLANE_DIFF_RENDERERS` entry (§2.7.1), authored WITH the
  relationship renderer (both are cast-plane diffs).

**Homes (domain map):** rpg owns the field-schema config + the snapshot record + the panel + the delta
renderer; the write rides the existing `update_scene` tool (chat content owns nothing new here — these are
prose-invisible tracked state, not a content-span class). Config-gated by `config.features.castFields`
being non-empty (an empty schema = the feature is off, the opaque-record behavior is GONE — a defined
field or nothing; no half-state).

**Graft doorway #R6 (§8.5):** a `meter`-with-thresholds (color bands at values), a field visibility scope
(host-only fields — a GM-secret suspicion track), or a per-field write-permission are additive on the
field-schema shape — none re-types the stored record.

---

## 3. SECTION B — the CONTENT-CLASS VISIBILITY REGISTRY (features 3, 4, 5, 7 on one mechanism — the core new machinery)

> This is the one genuinely-new mechanism in the program, and the owner's two feature-7 steers
> generalized it into its final shape. Spend the depth here (directive's instruction).

### 3.1 The insight: two orthogonal planes, an OPEN REGISTRY of content classes

A message body is authored prose that may embed structured spans. Two independent questions apply to any
embedded span:

- **Reading-surface plane** — does the human reader SEE it? `{show | hide}`.
- **Wire plane** — what does the MODEL receive on subsequent turns? `{full | stub | drop}`.

Marinara conflates these per-feature (lie/ofilter are hidden-and-remembered by accident of ST swallowing
unknown tags; there is no card-hider at all). Making the two planes EXPLICIT and per-content-class turns
three ad-hoc features into cells of one matrix.

**Design it as an OPEN REGISTRY of content classes, NOT a closed table** (owner emphasis: flexibility +
future-forward extendability). A content class is a REGISTERED entry declaring its two-plane policy + its
projection behavior; the render filter and the wire projection are TOTAL functions over the registry, so
a future class (a thoughts channel, a GM-notes channel, whatever full-mode invents) is a REGISTRATION,
not a build:

```ts
// @orb/contracts/chat/content-classes.ts — the open registry (the D73 clusters-are-registries pattern).
export interface ContentClassPolicy {
  readonly reading: "show" | "hide";
  readonly wire: "full" | "stub" | "drop";
}
// The registry maps a span KIND → its policy. New span kinds register here; the two projection seams
// (§3.4 render, §3.5 wire) read the policy, never a hardcoded per-kind switch. A missing entry defaults
// to {show, full} (the ordinary-prose fallback — an unrecognized span is literal text, D51 degrade).
export const CONTENT_CLASS_POLICY: Readonly<Record<ContentSpanKind, ContentClassPolicy>> = {
  text:   { reading: "show", wire: "full" },   // baseline — reader reads, model remembers verbatim
  image:  { reading: "show", wire: "drop" },   // EXISTING behavior, now declared (drop-if-no-vision → alt)
  hidden: { reading: "hide", wire: "full" },   // <lie>/<ofilter> — user-hidden, model-remembered
  card:   { reading: "show", wire: "stub" },   // html-card — reader sees forever, model gets a stub
  choices:{ reading: "show", wire: "full" },   // CYOA — buttons for the reader, ordinary text on the wire
};
```

Registry as a table (the shipped cells):

| Content class | Reading-surface | Wire | Rationale |
|---|---|---|---|
| `text` (prose/markdown) | **show** | **full** | the baseline — the reader reads it, the model remembers it verbatim |
| `image` (existing) | **show** | **drop→alt** | already built (`toContentParts`) — the registry DECLARES the existing behavior, proving the model is right |
| `hidden` = `<lie>` (feat 3) | **hide** | **full** | user must not see the truth; the model MUST remember its own lie for future consequences |
| `hidden` = `<ofilter>` (feat 4) | **hide** | **full** | user's persona can't perceive it; the model narrates AROUND it and remembers what happened |
| `card` = `html-card` (feat 7) | **show** | **stub** | the reader sees the rich card forever; the model gets a compact stub, not the multi-KB blob |
| `choices` = CYOA (feat 5) | **show** | **full** | clickable buttons for the reader; the model's own one-line choices on the wire |

*WHY a registry not a switch:* a switch+`assertNever` over span kinds is a ratchet trip on every add
(`[[single-arm-dispatch-record-not-switch]]`) AND forces every consumer to re-handle every kind; a
`Record<kind, policy>` makes a new kind a data row the two seams honor for free (`[[lock-the-extensible-shape]]`).
**Graft doorway #V1 (§3.8):** a new content class = a `ContentSpanKind` tuple member + a
`CONTENT_CLASS_POLICY` row + (if it needs a distinct projection) a render/wire arm — additive, the two
seams' total functions compile-force the coverage. `hidden`'s two TAGS (`lie`/`ofilter`) share ONE class
+ ONE policy (they differ only in teaching-prose + reveal-field-labels, §3.2), so a THIRD hidden channel
is a tag REGISTRATION under the existing class, not a new class (§3.2 graft doorway #V2).

### 3.2 One grammar family — self-closing/fenced spans the tokenizer recognizes

All new classes extend the D51 span grammar (`@orb/kit/content`). The tokenizer today recognizes
`![alt](target)` image refs; it gains TWO GENERIC recognizers — a self-closing tag family + a directive
fence family — each driven by a REGISTRY, not bespoke per-feature parsers.

**(a) Generic self-closing TAG-CLASS machinery — lie/ofilter are the first two REGISTRANTS, not two
parsers** (owner emphasis: "a third hidden channel later should be a registration, not a build"). ONE
linear regex recognizes any registered `<name …attrs.../>` self-closing tag; a registry names which tag
NAMES are hidden-channel tags and what fields each carries (for the reveal surface, §3.6):

```ts
// @orb/contracts/chat/hidden-tags.ts — the tag-class registry (first two registrants; a third is a row).
export interface HiddenTagDef {
  readonly tag: string;                       // the tag name the tokenizer matches (<lie …/>)
  readonly fields: readonly string[];         // the attrs the reveal surface displays, in order
  readonly revealLabel: string;               // the host-reveal section heading
}
export const HIDDEN_TAGS: readonly HiddenTagDef[] = [
  { tag: "lie",     fields: ["character", "type", "truth", "reason"], revealLabel: "Deception" },
  { tag: "ofilter", fields: ["event", "reason"],                       revealLabel: "Unperceived" },
];
```

The tokenizer matches ANY `<name .../>` whose `name` is in `HIDDEN_TAGS` → a
`{kind:"hidden", tag, attrs: Record<string,string>, raw}` span; a `<name/>` NOT in the registry stays
literal text (D51 degrade). *WHY the XML self-closing shape:* these tags carry NAMED ATTRIBUTES the
host-reveal surface (§3.6) displays as fields; the self-closing `<tag …/>` form is what models emit
reliably (marinara live-proves it), linear to tokenize (ReDoS-safe like `IMAGE_RE`), visually distinct
from a fence. *WHY a registry:* a third hidden channel (a `<thoughts …/>`, a full-mode `<gmnote …/>`) is
one `HIDDEN_TAGS` row + one teaching constant — zero tokenizer/filter/wire changes (they read the
registry). **Graft doorway #V2 (§3.8).**

**(b) Generic directive-FENCE machinery — cards + choices are the first two REGISTRANTS** (owner emphasis:
"the structural-choices emission should be reusable by anything that wants model-emitted clickable
affordances"). ONE fence recognizer matches `:::<name> …attrs\n…body…\n:::` for any registered fence
name; a registry names the fence names and how each projects:

```ts
// @orb/contracts/chat/directive-fences.ts — the fence-class registry.
export const DIRECTIVE_FENCE_NAMES = ["card", "choices"] as const;   // first two registrants; a third is a member
export type DirectiveFenceName = (typeof DIRECTIVE_FENCE_NAMES)[number];
```

- **`:::card title="…"`** … `:::` — the ARTIFACT FENCE (owner steer: "artifact fences, not a component
  system"). The ONLY structured attr is `title` (optional) — the honest thing the wire STUB says (§3.5)
  and the expand-affordance label (§4.4). Everything between the fences is arbitrary, unparsed,
  model-authored HTML/CSS/JS — the freedom IS the feature. → `{kind:"card", title, html, raw}`.
- **`:::choices`** … `:::` — the structural CHOICE fence (§5.2), lines `N. <text>`. →
  `{kind:"choices", options: string[], raw}`.

  ```
  :::card title="Zandik's letter"
  <div style="…">…arbitrary model HTML/CSS/JS…</div>
  :::
  ```

*WHY a fence not a tag* (for card/choices): bodies are multi-line (HTML; a choice list); an XML attr
can't hold them; `:::name` is the remark-directive convention, unambiguous, won't collide with the
model's own `<…>`. *WHY the choices fence is REUSABLE:* it is a generic "model-emitted clickable
affordance" grammar — CYOA is its FIRST consumer, but full-mode encounter options, guided-gen
suggestions, or any "offer the user structured picks" feature registers a fence name and reuses the same
tokenize→render-buttons→click-send path (§5.3). **Graft doorway #V3 (§3.8):** a new fence name = a
`DIRECTIVE_FENCE_NAMES` member + a render/wire projection arm.

**Version tolerance (owner emphasis: "a v2 fence must not break v1 stored cards"):** the fence grammar is
FORWARD-COMPATIBLE by construction — the recognizer reads only `:::name` + optional `key="…"` attrs +
body; an unknown attr on a fence is IGNORED (not a parse failure), and a future `:::card` v2 that adds
attrs (say `theme=`, `size=`) still matches the v1 recognizer (it just carries extra attrs the v1
projection ignores). A v1 stored card (title + body) parses identically forever. The stub format is
extensible the same way: `[card: title]` is the v1 stub; a richer stub (`[card: title — a letter]`) is
an additive render of the same span — the format is a function of the span, not a stored string, so it
lifts with no migration. **Graft doorway #V4 (§3.8).**

**The tokenizer stays ONE parser, DEGRADE-never-throw** (D51 law). A malformed `<lie …` (no self-close),
a `:::card` with no closing `:::`, an unregistered tag/fence — all fall through to literal text; nothing
crashes. The output span union grows by the three registry-driven members (`hidden`/`card`/`choices`);
`ContentSpanKind` is the tuple the `CONTENT_CLASS_POLICY` registry (§3.1) keys off.

#### 3.2.1 The OUTPUT-PARSER ROBUSTNESS CONTRACT (D1 — steal the contract, keep our syntax)

> **v2.1 fold (the marinara audit's highest-value delta).** Marinara's `[tag: attr="value"]` GM-output
> parser (`game-tag-parser.ts`, 1144 lines) is the design cousin of these fences/tags — a parser for MODEL
> OUTPUT, hallucination-tolerant, stream-tolerant. It built substantially more defensive machinery than a
> fence scanner usually has. We STEAL the robustness CONTRACT (three guarantees), keep OUR syntax + the
> visibility registry. This hardens the parity-plus fences AND pre-designs full-mode's encounter/skill-check
> output tags (graft doorway #V10).

The tokenizer's fence/tag recognizers (§3.2) must satisfy THREE robustness guarantees — the model-output
parsing contract, not just the happy path:

1. **JSON-in-attributes + streaming-truncation survival — a QUOTE/ESCAPE/BALANCE-AWARE walker.** A fence or
   tag may carry structured attributes (a `:::card` with a `title="a {json: value}"`, or a full-mode
   `[skill_check: {"dc":15,"attr":"dex"}]`), and the model STREAMS — so a recognizer must (a) track
   `inString`/`escaped`/`depth` char-by-char so it removes/parses a tag carrying JSON-in-attributes WHOLE
   (the naive "stop at the first `]`/`:::`" leaves `}]` garbage — marinara's `stripUnknownBracketTags`
   :205-256 states exactly this bug), and (b) leave an UNBALANCED / stream-truncated fence IN PLACE (never
   mangle a half-streamed `:::card` — marinara :249). *Our fences already close on a matching `:::`/`/>`,
   but the current recognizer is a simple pair-match; the D1 contract upgrades it to a balance-aware walker
   so a `:::` INSIDE a card's own body/attrs (or a `"` -quoted `:::` in an attribute) doesn't false-close.*
   This is the extraction PRIMITIVE under every fence/tag recognizer — one shared walker, not per-kind.
2. **ALLOWLIST-STRIP-UNKNOWN — the anti-hallucination floor.** A fence/tag whose NAME is not in the registry
   (`DIRECTIVE_FENCE_NAMES` / `HIDDEN_TAGS`) is DROPPED silently, never leaked into rendered prose. Today an
   unregistered fence degrades to literal TEXT (D51) — the D1 refinement: for a fence/tag that STRUCTURALLY
   looks like a command (`:::teleport` / `<gmnote/>` before it's registered), the reading-surface plane
   STRIPS it (drops the span) rather than showing the raw `:::teleport …` to the reader, because a
   hallucinated command tag is model noise, not authored prose. *WHY not just literal-text it:* a model
   inventing `:::combat` we never defined would render the raw directive as visible garbage; the allowlist
   strip is the honest floor (the reader never sees a command the system didn't honor). A NON-command shape
   (a stray `:::` with no valid name, ordinary prose) stays literal text (unchanged). The strip is
   reading-surface-plane only — the WIRE keeps the model's bytes (it emitted them; the transcript is honest).
3. **THE THREE RETENTION VARIANTS = OUR VISIBILITY MATRIX (the convergence, cited).** Marinara built THREE
   strip variants with different retention — display-strip vs re-feed-strip vs keep-for-reader
   (`stripGmTags` / `stripGmTagsKeepReadables` / `stripBalancedTag`). **This is the SAME idea as our
   {reading-surface × wire} visibility matrix (§3.1), arrived at INDEPENDENTLY** — marinara's "which caller
   gets which retention policy" IS our "each content class declares its {reading, wire} planes." The
   convergence VALIDATES the matrix (two teams reached the same two-plane model). *Consequence:* we do NOT
   need marinara's three ad-hoc strip functions — the `CONTENT_CLASS_POLICY` registry (§3.1) already
   expresses all three retentions as data (`{show,full}` = keep-for-reader; `{hide,full}` = display-strip
   but re-feed; `{show,stub}` = keep-for-reader but re-feed-shrunk). The D1 fold is the WALKER + the
   allowlist-strip; the retention model is already ours.

*The `{effect: text}` inline sub-grammar + the angle-line HTML-escape allowlist* (marinara's lighter prose-
styling grammars, :1080/:1085) are NOT folded — our html-card (feature 7) covers inline styling via the
sandbox, and our tokenizer already handles `<lie>`/`<ofilter>` angle tags via the `HIDDEN_TAGS` registry; a
second `{effect}` grammar is surface area for zero capability the card doesn't give. Recorded as considered.

### 3.3 The teaching injections (features 3/4/5/7 — composed into the ONE reminder, config-gated)

Each hidden-channel / card / cyoa feature contributes a teaching BLOCK to `buildLiteReminder`
(`substrate/reminder.ts`), each a versioned constant (the `RPG_STEERING_LICENSE` pattern), each emitted
ONLY when its config knob (§9) is on. They compose in a stable order after the state block, before the
steering note. The blocks (authored fresh, marinara-derived where the tag grammar must match):

- `RPG_DECEPTION_TEACH` (feature 3) — teaches `<lie character type truth reason/>`, states it is hidden
  from the reader but remembered.
- `RPG_OFILTER_TEACH` (feature 4) — teaches `<ofilter event reason/>`, the perception-gate rule.
- `RPG_CYOA_TEACH` (feature 5) — teaches the choice fence (§5.2).
- `RPG_CARD_TEACH` (feature 7) — SHORT + permissive (owner steer): "when it fits the scene — an in-world
  screen, letter, poster, map, UI — you may emit an immersive card: `:::card title=\"…\"` then your HTML/
  CSS/JS, then `:::`. Make whatever fits; embed everything inline; do not use a code fence." (§7.5.)

Because they ride the ONE `role:"system"` reminder injection, they inherit its resolved delivery (the
`turns.midConversationSystem`-gated system-vs-note framing) — no per-feature wire concern.

### 3.4 The reading-surface plane — the render filter (client message surface)

`contentSpansToBlocks` (`@orb/contracts/chat`) + its client twin `toContentBlocks` gain arms for the new
spans:

- **`hidden` span (`{hide, …}`)** — produces NO render block (the reader never sees it). The truth/event
  is simply absent from the displayed body. *This is the render filter* — implemented as "the projection
  emits nothing for a hidden span", the cleanest possible form. It DEGRADES: a malformed hidden tag that
  fell through to text renders as text (the D51 posture) — so a broken `<lie` can leak, which is
  ACCEPTABLE (it is the model's own malformed output, not a security leak; the host-reveal surface §3.6
  is the intended channel, and the reader seeing raw `<lie` is a visible bug not a silent truth-leak).
- **`card` span (`{show, …}`)** — produces an `html-card` render block `{kind:"html-card", html, css?,
  trust: resolved}` — the ALREADY-BUILT union member. The render is DONE (`message-content.tsx` →
  `SandboxFrame`). Trust resolution is §4.3.

The host-reveal surface (§3.6) reads the SAME hidden spans by tokenizing the stored body itself (not the
filtered blocks) — the stored body is the source of truth; the filter is a projection, so the reveal
just projects differently.

### 3.5 The wire plane — the stub/drop transform (server history-projection seam)

`toContentParts` (`pipeline.ts:613` — "the ONE seam where the shaped string body becomes content-parts")
gains arms for the new spans. This runs over EVERY history row on EVERY turn for EVERY backend, so the
collapse is uniform across all six connection modes (§3.7).

- **`hidden` span (`{…, full}`)** — emitted to the wire VERBATIM as text (the model remembers its own lie/
  the true event). The tag text becomes a `{type:"text"}` part unchanged. *This is why the wire plane is
  `full` for hidden tags: the whole point is the model keeps the memory.*
- **`card` span (`{…, stub}`)** — collapsed to a compact deterministic STUB text part:
  `[card: <title>]` (or `[card]` when no title). Deterministic (same bytes every assembly → cache-stable,
  the directive's requirement), compact (one line vs multi-KB), and honest (the model knows a card
  existed and roughly what — the `title` the emission grammar carries EXACTLY so the stub has something
  true to say, per the owner addendum). *WHY collapse:* a multi-KB HTML blob riding every prompt = context
  rot + cost + the model imitating its own old markup (owner's stated reasons). The stub is the wire
  truth.

**M2 (v2) — the KEEP-LAST-X knob is SHIPPED; default 0 = immediate total collapse.** v1 argued
immediate-total-collapse and deferred keep-last-N; the owner ruled it a shipped knob. `config.features.
cardKeepLastX: z.number().int().min(0).default(0)` — **X most-recent cards ride the wire FULL; older cards
stub.** Default `0` = v1's argued posture (every card stubs immediately — the cache-stable, budget-honest
default the owner's "each turn" framing wanted). A host who finds the 8B losing card continuity sets X=1
(the just-emitted card rides full one more turn, then stubs). *WHY ship the knob despite the v1 argument:*
the argument was about the DEFAULT (immediate collapse is right by default), not about foreclosing the
choice — some models/hosts want the last card's markup for continuity, and the owner ruled that a real
tuning lever. The determinism concern (v1's #2) is HANDLED by making X count from the CURRENT turn's tail:
"the last X cards" is deterministic PER ASSEMBLY (the same history always yields the same last-X set at a
given turn) — it is non-deterministic only ACROSS turns, which is inherent to a sliding window and
acceptable (a card entering the stub zone as new cards arrive is a one-time cache-break per card, bounded
by X, not a per-turn thrash). *Rejected:* keep-last-X as DEFAULT non-zero (re-opens the budget/cache cost
the owner's "each turn" framing rejected as the default); a per-card keep flag (unbounded — the window is
the honest bound).

**Stub goes to compaction/summarize too.** Any path that reads history to summarize (`summarize`/
`structured` roles, managed compaction) consumes `toContentParts` output (or the same stored body through
the same tokenizer) — so the compaction sees the STUB, never the blob. The wire captures (observability —
`[[agent-sdk-no-observable-wire-body]]`: capture the SDK query input) show the stub, so observability
tells the truth about what the model saw. Verified by a wire-capture assertion (§10 tests).

### 3.6 The host-reveal surface — the GM "eye" (BEYOND marinara — she has none)

**REASONING-CHANNEL RULE (owner-ratified 2026-07-27 — P3 build requirement, folds onto the member-strip):**
the member-strip removes hidden tags from the message BODY, but the model's REASONING/thinking channel is
member-visible (`MessageView.reasoning`, rendered by `reasoning-block.tsx`) and a deceptive model can spill
a lie's truth there ("I'll tell them X but secretly Y"). Owner ruling: **when a game has deception active
(`<lie>`/`<ofilter>` in use — i.e. `config.features.deception`/`omniscience` on), the REASONING CHANNEL IS
HOST-ONLY — members see NO reasoning at all for that game** (not a per-tag scrub — the whole thinking channel
goes host-only, the clean threat-model boundary). The host still sees reasoning. This is a per-game
CONDITIONAL strip at every reasoning-carrying member-reachable surface (commit `MessageView.reasoning`, the
live `reasoning`-channel delta, `reasoningEdited`/`reasoningCleared` bus events, durable replay) — the
security review's reasoning-reachability map (`reports/…` P2-hardening) enumerates them. P3 wires it beside
the body member-strip (`substrate/member-visibility.ts`); the gate is `game deception-active AND
viewer !== host`. Games WITHOUT deception keep reasoning member-visible as today (no regression). The P2
body-strip infra shipped reasoning-unstripped by design; P3 adds this game-conditional reasoning gate.

Marinara hides the tags and offers ZERO reveal UI. Our "better":

- **M4 (v2) — a HOST-OF-ROOM hidden-content toggle governs whether the eye is offered at all.**
  `config.features.hiddenContentReveal` (default true): when true, the host sees the reveal eye (below);
  when false, the host runs PURE hidden — no reveal surface even for themselves (the deception lands fully
  blind, the maximum-immersion posture some hosts want). *WHY a toggle:* the reveal eye is a "peek behind
  the curtain" some hosts love (see what your companion hides) and others find spoils the tension; the
  owner ruled it the host-of-room's choice. Default on (the "beyond marinara" surface is the point, but
  optional). When off, the hidden content STILL rides the wire (the model remembers) and is STILL
  server-stripped from members — only the host's own eye is withheld.
- **A per-message reveal affordance on the message surface** (when the M4 toggle is on) — a small eye
  control on any assistant message that CONTAINS hidden spans (the client knows: it tokenized the body and
  saw `hidden` spans it filtered out). Clicking it reveals an inline panel listing the hidden content of
  THAT message, parsed into its fields: for `<lie>` → character / type / truth / reason; for `<ofilter>` →
  event / reason. This is a READ surface over the stored body — no new storage, no new wire, just a
  different projection of spans the render filter already dropped.
- **Who can reveal — the visibility rule (load-bearing, argued):** the MODEL always (wire=full); the
  HOST via the eye; MEMBERS never (the eye is host-gated). *WHY host-only reveal:* the truth/hidden-event
  is a GM-plane secret — a member revealing it defeats the deception/omniscience mechanic for the table.
  In a SOLO lite chat the user IS host, so the common case is unaffected (the solo player can peek at what
  their companion is hiding — which is the fun). In a multi-human room, only the host peeks. The gate is
  the roster host check the rpg verbs already use — the reveal affordance renders only when the viewer is
  the game host (a `getGame`-derived flag the panel already holds; no new proc). *Rejected:* everyone can
  reveal (defeats the mechanic in multi-human rooms); nobody can reveal (marinara's gap — the whole
  "beyond her" is the eye).
- **Per-character active-lie inventory (BEYOND marinara)** — a host-only panel section (Scene tab or a
  dedicated "GM eye" affordance) aggregating the CURRENTLY-STANDING lies per character across the visible
  transcript: "Zandik is lying about X (told you Y)". *WHY:* deception's payoff is future consequences
  (marinara's own teaching prompt says so); a standing inventory makes "when does this lie get exposed"
  a surface the host can drive. Derivation: tokenize the visible message bodies, collect `<lie>` spans
  grouped by `character` attr, most-recent-wins per (character, truth). Lineage-consistent by
  construction (it reads the selected-variant transcript). Host-gated like the eye. This is a v1
  "better"; a lie-resolution/reveal-moment affordance (mark a lie as "exposed in-fiction") is an
  additive doorway (§9 #7), not built.

**Multi-human perception (`<ofilter>`) — v1 ships single-perception, the doorway is DESIGNED not
foreclosed** (directive requirement; owner-emphasis extensibility). Marinara is single-player: `<ofilter>`
hides from "the player". We have multi-human chats. The v1 posture: `<ofilter>` hides from ALL members
(the reading-surface `hide` is uniform — no member sees an unperceived event), and the model narrates
around it for the whole room. But the mechanism is DESIGNED so per-player perception is additive: the
`<ofilter>` tag CAN carry an optional `who` attr (`<ofilter event="…" reason="…" who="Mari"/>`) naming
WHOSE persona can't perceive it. In v1 `who` is IGNORED (uniform hide); the doorway is that the
reading-surface filter's SERVER arm (§3.6, the member-strip) is already per-VIEWER (it strips for
non-host) — extending it to per-PLAYER perception is: strip an `<ofilter who="X"/>` span only from the
viewer whose persona is X, show it to others (an evolution of the SAME server-side per-viewer projection,
not a new mechanism). *WHY design the seam now:* the member-strip is already per-viewer server-side (it
must be, for the host/member split — §3.6 security); making it per-PLAYER-perception later reads one more
attr in the same projection. **Graft doorway #V7 (§3.8):** per-player perception = honor the `who` attr
in the existing per-viewer server strip + a persona↔player resolve (which the chat roster already holds).
v1 tokenizes `who` (it is just another attr) but the filter ignores it. *Rejected:* foreclosing it (a
uniform hide with no `who` attr would need a tag-grammar change later — designing `who` in now costs one
optional attr and keeps the mechanism additive).

*Security note (§10):* the host-reveal surface exposes GM-plane secrets to the host only. The gate is an
EXISTING trust boundary (the roster host check), so no NEW boundary is created — but the reveal-surface
data path (host-only projection of hidden content) gets a `security-executor` confirmation pass that the
host gate is enforced server-side where the data is served, not just hidden client-side (a client-only
hide would leak the truth in the network payload to a member). **This forces a design point:** the hidden
content must be served to the client ONLY when the viewer is the host — i.e. the reveal is a SEPARATE
host-gated read (`rpg.revealHidden(messageId)` → the parsed hidden spans), NOT bundled into the message
payload every member receives. The member's message payload carries the body with hidden spans present
(the render filter drops them client-side for display) BUT — wait: that WOULD leak to a member who reads
the raw payload. **Resolved (the honest design):** the stored body keeps the hidden tags (the model needs
them via the server-side wire projection, which never reaches the client); the CLIENT message payload has
the hidden spans STRIPPED SERVER-SIDE for non-host viewers (a member never receives the truth bytes), and
the host fetches them through the dedicated host-gated `revealHidden` read. This means the reading-surface
filter (§3.4) has a SERVER arm (strip-for-non-host at the message-read projection) AND a client arm (the
render filter for defense-in-depth + the host's own display). This is the one place the matrix touches a
real security boundary — FLAGGED for §10. *WHY server-strip not client-only:* client-only hiding leaks
the truth in the payload to anyone who opens devtools — unacceptable for a deception mechanic in a shared
room. Server-strip-for-members is the honest boundary.

### 3.7 Per-backend wire honesty (all six modes collapse identically)

The wire plane operates at `toContentParts` (`pipeline.ts`), which produces `TurnMessage[]` consumed
IDENTICALLY by all six connection modes (the array wires — chat-completions/responses — and the stateful
agent-sdk wire both take `history: TurnMessage[]`). So:

- A `<lie>`/`<ofilter>` rides the wire as verbatim text on every mode (full).
- An `html-card` collapses to `[card: title]` on every mode (stub) — deterministic, cache-stable.
- **Squash/role-handling interaction:** the stub/verbatim transforms run at `toContentParts`, which is
  DOWNSTREAM of `shape.ts`'s squash/role-handling (squash joins bodies with `\n\n` BEFORE tokenization —
  verified: `assembly/shape.ts` operates on the string body; `toContentParts` runs after in `pipeline.ts`
  at line 369, post-`shapeHistory`). So a squashed multi-message run's bodies are already joined when
  tokenized — the fence/tag spans survive the join (the `\n\n` separator doesn't break a `:::card` fence
  or a `<lie/>` tag; pinned by a squash-parity test §10). The stub is a normal text part, so downstream
  role-handling treats it as ordinary text.
- **Cache-break honesty:** the card stub being deterministic means an old card row's wire bytes are
  STABLE across assemblies → it stays inside the cached prefix (no cache break from a card in history).
  A freshly-emitted card in the just-committed message is already a stub on its first re-send (§3.5), so
  it never enters the cache as a blob then shrinks (which WOULD break cache). This is why immediate-stub
  is cache-correct and keep-last-N is not.

### 3.8 The content-class GRAFT MAP (the D86-style extensibility discipline — full/later only ADDS)

Every extensibility doorway this mechanism cuts, named. The invariant (D86 discipline): a future content
class / hidden tag / fence / stub-format ADDS a registry row + (if needed) a projection arm — it renames,
re-types, or migrates NOTHING shipped.

| # | Doorway | What a future class/feature ADDS | Never |
|---|---|---|---|
| **#V1** | a new CONTENT CLASS (a thoughts channel, a full-mode GM-notes channel) | a `ContentSpanKind` tuple member + a `CONTENT_CLASS_POLICY` row + (if a distinct projection) a render/wire arm — the two total-function seams compile-force coverage | re-shape the two-plane policy shape; hardcode a switch |
| **#V2** | a THIRD hidden TAG (`<thoughts …/>`, full's `<gmnote …/>`) | a `HIDDEN_TAGS` row (tag name + fields + reveal label) + a teaching constant | a new tokenizer/filter/wire path (all read the registry) |
| **#V3** | a NEW directive FENCE (encounter options, guided-gen suggestions) | a `DIRECTIVE_FENCE_NAMES` member + a render/wire arm; the choices grammar itself is REUSED, not rebuilt | a bespoke choices-like parser (the §5.2 fence + §5.3 click-send is the shared path) |
| **#V4** | a FENCE v2 (card `theme=`/`size=`; choices with metadata) | new optional attrs the recognizer already ignores on v1; a richer projection reading them | break a v1 stored card/choices (the recognizer is forward-compatible; extra attrs are ignored, not fatal) |
| **#V5** | a richer STUB (per-class stub format, size hints) | an additive stub render off the same span (the stub is a function of the span, not a stored string) | a stored stub column (it is derived at the wire seam every assembly) |
| **#V6** | a per-class WIRE policy change (a class that stubs on some backends only) | the policy could grow from a scalar to `{wire, backendOverrides?}` — an additive field on `ContentClassPolicy` | today's scalar `wire` is byte-stable; an override is opt-in |
| **#V8** | `structural_tag` EMISSION enforcement (vLLM-only) — token-force schema-valid JSON inside a `<lie …/>` tag or a `:::card`/`:::choices` fence, AND the prose+state-together mode-3 doorway (guaranteed-valid embedded state in one generation) | a capability-keyed wire arm that, on a `structural_tag`-capable backend, sends the tag/fence grammar as a structural_tag constraint — an ENHANCEMENT over the portable prompt-taught base (the base works everywhere; §10.1) | replace the prompt-taught base (it stays the portable floor); build it into the v2 waves (doorway, not a wave) |
| **#V10** | FULL-MODE encounter/skill-check OUTPUT tags (`[skill_check: …]`-class command tags in model prose — marinara's D1 registry has ~23) | new `HIDDEN_TAGS`/`DIRECTIVE_FENCE_NAMES` registrants that RIDE the §3.2.1 robustness contract (the balance-aware walker + allowlist-strip + the visibility-matrix retention) — full's engine parses them into structured actions; the parser machinery is ALREADY built by the parity-plus fences | a bespoke full-mode output parser (the §3.2.1 contract is the shared home — a full-mode tag is a registry row, not a new parser) |

These are DESIGNED seams (named registries + total functions), not speculative code — the machinery
ships with the registry it reads, so an add is a data row, matching the D72 machine-ships-with-its-seal
rule.

### 3.9 The REGEX-ENGINE reconciliation (feature B — the display/wire split ALREADY exists in kit/regex)

The kit regex engine (`kit/regex`) already implements a display-vs-wire split — the SAME two planes my
visibility registry (§3) declares. This section reconciles them (verified against `kit/regex/index.ts` +
`client/src/lib/message-render.ts` this session).

**The existing split:** `REGEX_PLACEMENTS = [USER_INPUT, AI_OUTPUT, SLASH_COMMAND, WORLD_INFO, REASONING,
DISPLAY]` — `DISPLAY` is render-time/frontend-only; the rest are prompt-side. Plus two flags:
`markdownOnly` (skip on any non-DISPLAY placement — a display-only script) and `promptOnly` (skip on
DISPLAY). So a regex script CAN be display-only or prompt-only, exactly the reading-surface × wire axes.

**(1) The markdownOnly-is-LEAKY argument (why hidden-tags are NOT "just a markdownOnly regex").** A host
COULD write a `markdownOnly` regex that strips `<lie …/>` at DISPLAY — and it would hide the tag from the
reader. BUT `markdownOnly` only affects the DISPLAY placement: the tag still rides the WIRE on the next
turn (no `promptOnly` twin strips it there — and even if paired, a prompt-side strip would DELETE the
model's memory of its own lie, defeating the mechanic). More critically, `markdownOnly` is a CLIENT-side
render transform — the stored body + the server-sent payload still CONTAIN the tag, so a member reading
the network payload sees the truth (§3.6's exact leak). **Conclusion:** the hidden-tag mechanism (§3) is
NOT expressible as a regex script — it needs (a) the model to KEEP the tag on the wire (wire=full, the
opposite of stripping), and (b) a SERVER-side member-strip (not a client render transform). The visibility
registry is a distinct, first-class mechanism; a `markdownOnly` regex is a leaky user-authored approximation
the registry supersedes for the deception/omniscience classes. *This is the reconciliation: the two
mechanisms COEXIST — regex scripts stay the user's general-purpose find/replace; the registry owns the
security-bearing hidden channels.*

**(2) Extraction-vs-scripts ORDERING pins.** The content-span tokenize (§3.2, the `:::card`/`<lie>`/
`:::choices` recognizer) runs at TWO seams with a fixed order relative to the regex passes:
- **Render (client):** `renderMessageForDisplay` runs macros → DISPLAY-regex → fixMarkdown FIRST
  (`message-render.ts`), THEN `MessageContent` tokenizes the result into spans → blocks (§3.4). So the
  span recognizer sees POST-regex text. *Pin:* a DISPLAY regex that rewrites a `:::card` fence's bytes
  could break recognition — but that is the user's own script on their own view (a foot-gun they authored,
  not a system bug); the recognizer degrades a broken fence to text (D51). The registry's server-side
  member-strip (§3.6) runs on the STORED body BEFORE any client regex, so a member never receives hidden
  bytes regardless of their display scripts.
- **Wire (server):** `toContentParts` (§3.5) tokenizes the STORED body into parts; the prompt-side regex
  placements (`AI_OUTPUT` etc.) run in the assembly pipeline. *Pin:* the card STUB (§3.5) is produced at
  `toContentParts`, and a `promptOnly` regex on `AI_OUTPUT` runs on the shaped history body — the ordering
  is that stub-collapse happens at the content-part seam (downstream of the string-body regex passes), so
  a prompt-side regex sees the FULL card bytes, and the stub replaces them for the wire. This is
  intentional: a user's prompt-side regex operates on the authored body (its contract), and the stub is a
  wire-transport optimization below it. (§3.5 note updated to cite this ordering.)

**(3) The display CHOKE-POINT reuse audit.** `renderMessageForDisplay` (`message-render.ts`) is the ONE
display pipeline every text-showing surface routes through (macros → DISPLAY-regex → fixMarkdown). My
render filter (§3.4) does NOT fork it — it composes AFTER it: `MessageContent` calls
`renderMessageForDisplay` then tokenizes → filters → blocks. The hidden-span DROP and the card/choices
block projection happen in the tokenize→blocks step, downstream of the choke-point, so every display
surface that uses `renderMessageForDisplay` + `MessageContent` gets the filter for free. *Audit result:*
zero duplication — the registry filter is a projection stage appended to the built pipeline, not a second
render path.

**(4) Stub × promptOnly COMPOSITION.** If a host has a `promptOnly` regex that matches inside a card's
HTML (e.g. stripping a phrase), it runs on the FULL card body in the assembly string-pass (before
`toContentParts`), THEN the card stubs for the wire — so the regex's effect on the card body is MOOT for
the wire (the stub replaces it) but the regex's effect on NON-card body still applies. This is
consistent: a `promptOnly` regex shapes what the model sees, and a stubbed card is a `[card: title]` line
the regex could ALSO match (if the host wrote a regex targeting the stub form). No special-casing needed —
the stub is ordinary text by the time any prompt-side regex that targets it could run, and the card-body
regex is harmless-but-moot. *Pin:* a test that a `promptOnly` regex + a card in the same body composes
without error (the regex runs, the card stubs, neither corrupts the other).

> Owner steer (verbatim): *"The fun IS the model making whatever in its HTML — we don't really need to be
> nazis about it. Some of my most fun was seeing what god made. Treat it like inline artifacts (Claude
> Code artifacts) — there's no huge structure for what it makes."* Feature 7 is DELIBERATELY the simplest
> section — the freedom is the spec.

### 4.1 What's already built (feature 7 is mostly wiring, not building)

The `html-card` render block, the `SandboxFrame` tierB renderer, the trust dispatch in
`message-content.tsx` — all BUILT. Feature 7 adds: (a) the `:::card` fence in the tokenizer (§3.2), (b)
the `RPG_CARD_TEACH` injection (§3.3/§7.5), (c) the wire stub (§3.5, from the matrix), (d) the trust
routing (§4.3), (e) the scripts posture (§4.2). No new render machinery.

### 4.2 The sandbox posture — tierB freeform by DEFAULT, scripts ALLOWED (argued for the security pass)

Per the owner steer, the DEFAULT for a model-emitted immersive card is **tierB** (sandboxed iframe,
freeform HTML/CSS/JS), NOT tierA (sanitized inline). *WHY tierB default:* the creative freedom is the
feature; tierA's allowlist strips exactly the animations/interactivity/SVG that make "seeing what god
made" fun. TierA stays for a small inert class if argued (§4.3), but the immersive card DEFAULTS to
tierB-freeform. Do not invert this.

**M3 (v2) — the interactive-HTML toggle GOVERNS THE ASK, not the render.** The card SANDBOX is always
capable of scripts (the `allow-scripts` flip below is a one-time infra change), but whether the TEACHING
injection ASKS the model for interactivity is a per-game knob: `config.features.immersiveHtmlInteractive`
(default true). When true, `RPG_CARD_TEACH` (§7.5) invites "animations, interactive bits"; when false, it
asks for static cards only (an in-world letter/poster, no scripts). *WHY split the ask from the render:* a
card the model emits ALWAYS renders in the script-capable sandbox (the render is uniform — the sandbox is
the wall regardless), but some hosts want a calmer static-card experience and shouldn't have the model
reaching for animations. The toggle shapes the PROMPT, not the security boundary. A model that emits an
interactive card while the toggle is off still renders it (scripts run in the sandbox — the wall holds);
the toggle just doesn't ASK for it. *Rejected:* gating the RENDER on the toggle (a stored interactive card
would break on a later toggle-off — the render must be toggle-independent; only the ASK is gated).

**Scripts inside the card — ALLOWED (the posture I believe in, flagged for security-executor).** Today
`SANDBOX_ATTR = ""` (no scripts) and `CSP` has no `script-src`. The owner steer: *"artifacts allow them;
a sandboxed iframe without allow-same-origin can too… interactive cards are a big chunk of the fun."* The
change:

```ts
// srcdoc.ts — the doored-not-walled flip the header already anticipates.
export const SANDBOX_ATTR = "allow-scripts";           // scripts YES; NO allow-same-origin, NO allow-forms/popups
const CSP = "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src 'self'";
```

*WHY this is safe to argue* (the security reasoning the §10 pass confirms): `allow-scripts` WITHOUT
`allow-same-origin` gives the frame a NULL ORIGIN — scripts run but cannot read cookies/localStorage,
cannot touch the parent DOM, cannot make same-origin requests. The CSP `default-src 'none'` with no
`connect-src` blocks all network fetch/exfil (the script can compute and animate but cannot phone home).
`script-src 'unsafe-inline'` allows the card's own inline `<script>` (the only script source — no
external is reachable anyway with `default-src 'none'`). This is the EXACT artifact-sandbox posture
(Claude artifacts, CodePen sandboxed embeds). *The one boundary this program deliberately changes* — so
it is FLAGGED for `security-executor` (§10) to confirm: null-origin holds (no `allow-same-origin` ever
pairs with `allow-scripts`), no `connect-src` leaks, the `frame` cannot break out via `allow-top-navigation`
(absent). *Rejected:* keeping scripts off (pre-nerfs the fun the owner explicitly wants; the doorway the
header names goes unused); `allow-same-origin` + scripts (THE dangerous combo — would let the card read
the app origin; NEVER pair these — the §10 pass hard-checks this).

### 4.3 Trust routing — model cards are tierB; the existing trust model decides tierA

Feature 7 wires INTO the built trust model (`render-trust.ts` §12.2), does not redesign it. A card
EMITTED BY THE MODEL (an assistant message) resolves to `untrusted` render trust by
`resolveRowRenderPolicy` (assistant content is never trusted unless the character opted into
`trustHtml`). So the card's `trust` field on the stored `html-card` block is set at PROJECTION time from
the row's resolved render policy: an untrusted row's card → `tierB` (sandboxed — the default, correct for
model output); a trusted row's card (the viewer's own input, or a `trustHtml` character) → `tierA` (inline
sanitized) OR tierB by the same policy. *The rule:* the tokenizer emits the card's html/css/title; the
projection (`contentSpansToBlocks`, which has the row's render policy in the client path) stamps `trust`
from the render policy — model output is tierB, and that is the freeform-sandbox default the owner wants.
*This keeps ONE trust authority* (`render-trust.ts`) — the card doesn't invent its own.

### 4.4 How a model-emitted card lands in the STORED body (honestly)

The card is authored by the model as `:::card title="…"` … `:::` in its response prose — it lands in the
STORED body string VERBATIM (D26: the body is one string; the card fence is part of it). Nothing extracts
it into a separate table or column — it stays in the body, exactly like an image ref does. The RENDER
projects it to an `html-card` block; the WIRE projects it to a stub. *WHY store verbatim in the body:*
D26 (one content home) + the D51 grammar posture (structured spans live IN the body string, projected at
render/wire time, never pre-extracted). This means swipe behavior is FREE (§4.6): the card is per-variant
body content, so it rides the variant machinery with zero rpg code — the owner's stated expectation.

### 4.5 Streaming behavior (a card mid-stream)

While a card is mid-stream (the closing `:::` not yet received), the tokenizer sees an UNCLOSED fence →
the whole thing is literal text (D51 degrade). So mid-stream, the reader sees the raw `:::card` + partial
HTML as text (ugly but honest — a half-rendered iframe is worse, and `SandboxFrame` has a `complete`
prop for exactly this: *"a half-rendered flash is worse than a code fence"*). On stream COMPLETE (the
`:::` arrives), the tokenizer recognizes the closed fence → the card renders. *Design:* the streaming
render passes `complete={streamDone}` to any card block so a card only mounts its iframe once its fence
closed. A card whose fence never closes (stream aborted mid-card) stays literal text forever — acceptable
(the model's own truncation; the stored body is honest). *Rejected:* speculatively rendering partial HTML
(the half-rendered flash the SandboxFrame header warns against).

**Wiring reality (scouted 2026-07-27 — P4 builds from these facts, don't re-scout):** the streaming arm
is ALREADY card-safe by construction — the ghost row (`ghost-message-row.tsx`, the only per-token
re-renderer) is pure markdown (streamdown `mode="streaming"` + incomplete-markdown repair) with NO block
projection; `toContentBlocks`/`SandboxFrame` exist only in the committed `MessageContent` path, and
commit is a WHOLE-ROW hard cut (ghost unmounts, committed row mounts fresh) — so the card iframe loads
exactly once, at commit, and the ST flicker/reload/re-execute class is structurally impossible (iframes
are not in the per-token render path at all). P4 hygiene items: (1) memoize `toContentBlocks` on the
body string in `MessageContent` (recompute-per-render today; note React string-prop diffing already
prevents srcdoc reloads on identical content — a reload requires the html to actually change, i.e. a
swipe, where it's correct); (2) keys are index+kind (`message-content.tsx:70`) — stable within a
committed body, keep it that way; (3) the mid-stream reader experience is the raw fence text until
commit — CURED by the ratified forming-card placeholder below.

**The FORMING-CARD placeholder (owner-ratified 2026-07-27: "I want it to look pretty when it's
building" — P4 item, ghost-arm only):** the moment the OPENING fence line completes in the ghost text
(`:::card title="…"` + newline — unambiguous, no speculation about the body), the ghost renderer
suppresses the accumulating raw HTML and shows a PRETTY building-state placeholder: a card-shaped
skeleton frame (existing @orb/ui skeleton/shimmer primitives + the motion tokens — no bespoke CSS, the
motion-token-purity gate applies) carrying "✦ {title}" and a subtle forming animation; body bytes keep
accumulating invisibly behind it. At COMMIT the real card mounts in its place (chip → card, one cut).
ABORTED stream (fence never closes): the committed body renders the honest literal text per the degrade
rule — the chip simply disappears with the ghost row; no false card. NO iframe, NO partial HTML render
ever — the chip is recognition of the completed OPEN marker only, which is why it doesn't violate the
rejected-speculation rule. *Doorway:* the same chip can front the §4.8 lenient arm once its detector
exists (the detector is pure and can run on ghost text; chip fires when the wrap threshold is met
mid-stream) — additive, not required for P4. This is a `side-eye` surface (the prettiness IS the spec).

### 4.6 Swipe behavior (falls out of variant machinery — owner's expectation confirmed)

Cards are per-variant body content (they live in the stored body of a specific `message_variant`). A
swipe selects a different variant → a different body → different (or no) cards. Zero rpg/card-specific
swipe code: the variant machinery already swaps the body, the render re-tokenizes, the cards re-project.
This is the owner's stated expectation ("cards are per-variant content — should fall out of variant
machinery naturally") — CONFIRMED by the D26 body-is-one-string + D51 project-at-render design. No test
beyond a swipe-shows-different-cards assertion (§10).

### 4.7 Card sizing / expand (ergonomics — side-eye moment)

Inline, a card renders in `SandboxFrame` at a caller-controlled height (default 320px; scripts-on lets a
card postMessage its scrollHeight for self-sizing — an additive enhancement now UNLOCKED by §4.2's
`allow-scripts`, since the header notes height was caller-controlled precisely BECAUSE scripts were off).
An expand/fullscreen affordance (click → lightbox the card at full viewport) uses the `title` as the
lightbox label. *SPEC'S LEAN:* ship inline + a fullscreen expand affordance; self-sizing via postMessage
is an additive follow-up (it needs a message-channel contract the §10 security pass should also eyeball —
a card postMessage-ing the parent is a new channel). This is a `side-eye` surface (§10).

**The VIEW-RAW toggle (owner-ratified 2026-07-27, rides P4 with the card chrome):** every `html-card` —
fence-authored AND lenient-wrapped alike — carries a raw-source affordance in the card chrome/lightbox:
flip between the rendered sandbox and the EXACT stored source (the fence body / detected block) in a
code view. WHY: a character can be IN-LORE writing HTML (a hacker's exploit page, an in-world website) —
the rendered card is the right default (the fun IS seeing it), and the toggle serves the reader who
wants the code the character "wrote". It is also the lenient-arm's safety valve: a borderline wrap is
recoverable by the reader, not a dead-end.

### 4.8 The LENIENT-RENDER raw-HTML fallback (owner-ratified 2026-07-27 — v2.2 fold; P4 item)

**The gap (owner-surfaced):** ST/marinara need no fence — they watch for raw HTML in the output and
render it, because raw HTML is pretraining-native. Our taught `:::card` fence is load-bearing (the wire
stub needs a boundary + title; trust routing needs a decision point; watch-for-tags false-positives on
in-fiction code/angle-bracket text) — but a SMALL LOCAL MODEL may ignore the taught syntax and emit
naked HTML anyway, which today renders as ugly literal text. That is a [[plan-for-small-hardware]]
honest-arms miss: "dumb models being dumb models — shit works and we handle properly" (owner, verbatim).

**The design — strict fence is the TAUGHT contract; naked HTML gets WRAPPED as an implicit card:**
- Detection is CONSERVATIVE, not watch-for-any-tag: a contiguous block of ≥N lines (start at N=3,
  tunable constant, argued not a knob) that parses as element-majority HTML (opens with a block-level
  tag, balanced-ish by the §3.2.1 robustness walker — the same quote/escape-aware machinery, ONE parser
  family, no second heuristic engine) and is NOT inside a markdown code fence (a ```-fenced block is the
  author showing code, never a card — hard exclusion).
- A detected block becomes an IMPLICIT `card` span: same tierB SandboxFrame, same visibility-registry
  row (`{show, stub}`), same keep-last-X. The stub title is DERIVED (first `<h1-h3>`/`title`-ish text,
  else "untitled card" — the journalTitleFor derive precedent).
- The implicit arm obeys the SAME toggles: immersiveHtml OFF → no wrap (literal text, today's behavior);
  the M3 interactive sub-toggle governs scripts identically. No separate knob for the fallback itself —
  it is the same feature arriving by a lenient door (strict-author/lenient-render, the D2 audit adopt,
  now applied to the feature's own input).
- False-positive discipline, softened by the view-raw toggle (§4.7): the negative corpus — markdown
  ```-fenced blocks (explicit code display, markdown's own semantics), `<lie>`-class registered tags,
  angle-bracket emotes/actions, a single inline `<b>` bold — must NOT wrap, and the corpus is the
  regression floor. But NAKED in-fiction HTML (a character in-lore writing a page) DOES wrap by design
  (owner ruling): render-first is the right default, and the §4.7 view-raw toggle serves the
  read-the-code case — so a borderline wrap is a recoverable preference, not a dead-end bug.
- **The ```html-FENCE exception (owner-ratified 2026-07-27: "that is how we roll"):** assistant-trained
  models habitually wrap HTML in ` ```html ` fences (burned-in coding-assistant behavior) — the second
  dumb-model shape after naked HTML. A fence whose LANGUAGE TAG is `html` or `svg` AND whose body passes
  the same element-majority check is an implicit-card candidate (same sandbox/stub/`origin:"lenient"`,
  same immersiveHtml gate — OFF renders the code block exactly as today). GENERIC fences stay
  hard-excluded (no language tag, or any non-markup tag = code display, period — the exclusion above is
  unchanged for them). The view-raw toggle maps perfectly on this arm: the "raw" view IS the highlighted
  code block the fence would have rendered. Negative-corpus additions: ` ```html ` containing prose/
  pseudo-code (fails element-majority) stays a code block; ` ```js `/` ```css `/untagged never wrap.
- Provenance is visible: an implicit card's block carries `origin: "lenient"` (vs `"fence"`) so the
  reveal/debug surfaces can show WHY something rendered as a card; the wire stub is identical either way.

*Rejected:* teaching harder (more injection tokens for a model that already ignored the syntax);
rendering naked HTML in place without the card wrapper (loses the hider + sandbox — the two owner
non-negotiables). **Wave: P4** (it rides the same tokenizer arm + trust routing); tests join §10's P4
row (detection corpus positive + negative, derived-title, origin tag, toggle-off passthrough).

### 5.1 The "better" — clickable structural affordances, not dead prose

Marinara's CYOA is `DEFAULT_CYOA_PROMPT` = "finish your response with a numbered list of 5 options" —
pure prose the user reads and retypes. Our "better": the choices render as CLICKABLE affordances that
SEND the choice. This needs (a) a structural emission grammar so the choices are parseable, (b) the
click→send wiring.

### 5.2 The choice fence — a structural grammar (parseable, not prose)

The model emits its choices in a fence the tokenizer recognizes:

```
:::choices
1. Draw your blade and demand the truth.
2. Play along, feigning ignorance.
3. Slip out while she's distracted.
:::
```

`:::choices` … `:::` — same directive-fence family as `:::card` (§3.2), so the tokenizer's fence
machinery is shared. Each line `N. <text>` is one choice. The tokenizer emits a
`{kind:"choices", options: string[], raw}` span. *WHY a fence not "parse the trailing numbered list":*
parsing a bare numbered list is fragile (the model numbers other things — steps, quests); a fence is an
unambiguous "these are the CHOICES" signal, and reusing `:::…:::` costs nothing. *Reading-surface:* the
choices render as buttons (a render block `{kind:"choices"}` — a NEW render-block union member, or a
markdown-with-affordances). *Wire plane:* `{show, full}` — the model's choices are ordinary content the
next turn's context legitimately includes (the model offered them; seeing them back is fine and cheap —
they are one line each, not a KB blob; no stub needed). The choices block is on the visibility matrix at
`{show, full}` like ordinary prose.

### 5.3 Click → send wiring

A choice button's click sends the choice TEXT as the user's next turn (through the existing
`use-send-message` path — the choice becomes the user message, exactly as if typed). *WHY reuse the
send path:* a choice IS a user turn; routing it through `use-send-message` means it commits, swipes,
and steers identically to typed input — zero new turn machinery. The button is disabled once the turn is
in flight (the existing send-in-flight state). *Rejected:* a bespoke "choice" turn kind (a choice is
just user text — no new kind earns its keep).

### 5.4 First-class MODE, config-gated (applicability) + M5 wand affordance

CYOA is a first-class knob (`config.features.cyoa`, §9), not a preset. When on, `RPG_CYOA_TEACH`
(§3.3) injects the choice-fence instruction; when off, no injection and the tokenizer still recognizes a
`:::choices` fence if one appears (harmless — the model rarely emits it unprompted). *WHY a game knob:*
CYOA is a play-STYLE for THIS game (some tables want it, some want free prose) — the game config is its
home, matching every other feature knob (§9). *Rejected:* a preset flag (CYOA is game-behavior, not
prompt-assembly config); always-on (many players want free prose — it must be a knob).

**M5 (v2) — the "offer choices this turn" one-shot rides the WAND.** Beyond the standing CYOA mode (the
knob), the composer-wand (§6.3) gains a one-shot **"Offer choices"** guided item in a game chat: it fires a
turn with a one-shot "end your response with a `:::choices` list" steer — the same guided-action path as
the plot steers, for a host who wants choices on THIS turn without turning on always-CYOA. The choices
RENDER (inline buttons, §5.2-5.3) identically whether they came from the standing mode or the one-shot. So
CYOA has two entry points sharing one render: the mode knob (every turn) and the wand one-shot (this turn)
— both `[[no-separate-reduced-modes]]`-clean (one render surface, two triggers).

---

## 6. SECTION E — PLOT PROGRESSION (feature 6): first-class steering entries

### 6.1 The "better" — genre/state-aware steering, authored as first-class entries

Marinara's plot progression = two buttons (Randomized / Natural) firing a one-shot injected prompt
(`plotProgression.js`). The mechanism is the floor; "better" = (a) more than two entries, (b) a twist
that READS the rpg tracker state (genre/state-aware), (c) authored properly with knobs.

### 6.2 The steering-entry set (Randomized + Natural floor, plus the state-aware "better")

`RPG_PLOT_STEERS: Record<RpgPlotSteerKind, PlotSteerDef>` — a homed tuple + record (the `MODE_POLICY`
shape), each entry a versioned steering-prompt constant:

```ts
export const RPG_PLOT_STEER_KINDS = ["natural", "randomized", "twist", "escalate", "deescalate"] as const;
```

- **`natural`** (floor) — "progress the scene; reintroduce an unresolved thread or push toward the current
  goal" (marinara's Natural).
- **`randomized`** (floor) — the `{{random::…}}` twist roll (marinara's Random; the macro engine already
  supports `{{random::a::b}}` — verified `@orb/kit/macro`). Authored fresh (not copied — the twist list
  is ours, genre-broad).
- **`twist`** (the state-aware "better") — reads the tracker: "introduce a complication involving [an
  active quest / a present character with a hostile relationship / a low resource pool]" — the injection
  is TEMPLATED against `buildTrackerView` so the twist is grounded in THIS game's state, not a generic
  roll. *This is the measurable "better": marinara's random twist is context-blind; ours can twist ON the
  standing quest or the character who just turned enemy.*
- **`escalate` / `deescalate`** — tone-steering entries (raise/lower stakes), a fuller set than
  marinara's two.

*WHY a homed record not two hardcoded buttons:* the extensible shape — a new steer is a tuple member +
a def (`[[single-arm-dispatch-record-not-switch]]`); the buttons render from the tuple. *WHY state-aware
twist:* the rpg tracker EXISTS (marinara's does too but it doesn't feed plot) — a twist that reads the
quest/relationship/pool state is the domain-native "better".

**The entry SHAPE admits future variants without changing the surface contract (owner emphasis).** A
`PlotSteerDef` is `{ kind, label, icon, resolve(view: RpgTrackerView) → string }` — the `resolve` fn takes
the tracker view, so a `natural`/`randomized` steer ignores it (returns a constant) while `twist` reads
it (state-aware), and a FUTURE genre-aware or deeper-state-aware steer is a new def whose `resolve` reads
more of the view — the SURFACE contract (the button row renders from the tuple; the proc fires
`resolve(view)` as an injection) never changes. **Graft doorway #P1 (§8.5):** a new steer (genre-aware,
faction-aware, a full-mode encounter-steer) = a `RPG_PLOT_STEER_KINDS` member + a `PlotSteerDef` — the
button row and the fire path are byte-stable.

### 6.3 Home + wiring — M5 (v2): RE-HOMED INTO THE COMPOSER WAND

**The owner ruled the plot steers re-home into the EXISTING composer-wand, not a bespoke takeover
send-area row** (superseding v1's separate-row design). *WHY the wand:* `composer-wand.tsx` is ALREADY the
guided-generations menu (`WandSparkles`, `[[no-separate-reduced-modes]]` already its law — "ONE menu
across draft + committed, not-yet-applicable items DISABLED"). It already fires guided actions through
`use-guided-actions` → `chat.generate` with a steer param. A plot steer IS a guided action (steer the next
AI turn with a one-shot instruction) — it belongs in the wand, not a parallel button surface that would
re-invent the wand's fire path, disable logic, and steer-recall.

**The wiring (reuses the built guided-action path):** in a GAME chat, the wand's menu gains a **"Plot"
submenu** (the `MenuSubmenuRoot` pattern the wand already uses for the multi-character speaker submenu):
Natural / Randomized / Twist / Escalate / De-escalate (the `RPG_PLOT_STEER_KINDS` tuple, §6.2). Selecting
one resolves the steer def (`resolve(view)` — templated against the tracker for `twist`) into a steer
STRING and fires it through the SAME guided path (`chat.generate` with the steer as the guidance param, or
the one-shot `in_chat` depth-0 injection the reminder channel uses — whichever the guided path already
threads; the wand's `fireResponse` already carries a steer). The steer does NOT persist (ephemeral,
one-turn). *WHY this is cleaner than v1:* zero new fire surface — the wand's disable-on-turn-in-flight,
steer-recall (F3), and draft/committed handling all apply for free. The plot steer is a guided action that
happens to read rpg state; the wand is the guided-action home.

*The domain seam is unchanged from v1:* the steer DEFS (`RPG_PLOT_STEERS`) + the `resolve(view)` templating
live in `domain/rpg` (rpg owns the steer content + the tracker read); the CLIENT wand reads the available
steers + fires them. The rpg feature contributes the "Plot" submenu items to the wand via the client
cross-feature channel (`trpc.*` cache-first + the contributor registry — the wand renders game-plot items
when the chat is a game). *Rejected:* v1's takeover send-area row (re-invents the wand; violates
`[[no-separate-reduced-modes]]` — two fire surfaces for one intent).

### 6.4 Config-gated (applicability)

`config.features.plotProgression` (§9) gates whether the wand's "Plot" submenu appears (a non-game chat, or
a game with the knob off, shows no Plot submenu — the wand renders its normal items). This is the
applicability arm — the submenu is ABSENT when off, not a disabled twin (`[[no-separate-reduced-modes]]`).
`side-eye` the Plot submenu in the wand (§10).

---

## 7. (folded into §3/§4) — Immersive HTML cross-refs

Feature 7's mechanics are specified in §3 (the wire stub via the visibility matrix) and §4 (the fence,
sandbox posture, trust routing, storage, streaming, swipe, sizing). §7.5 is the one remaining piece:

### 7.5 The card teaching injection (short + permissive — owner steer)

`RPG_CARD_TEACH` (a versioned constant, §3.3), deliberately SHORT and permissive:

> "When it fits the scene — an in-world screen, letter, poster, sign, book page, map, UI panel, or any
> visual the characters would encounter — you may render an immersive card. Open with `:::card
> title=\"a short label\"` on its own line, then your HTML/CSS/JS, then `:::` on its own line. Make
> whatever fits the moment — animations, layouts, interactive bits are all welcome. Embed everything
> inline (no external scripts/fonts/images). Do not wrap it in a code fence."

Gated by `config.features.immersiveHtml` (§9 #7). *The freedom is the spec* — no schema for card content,
no component vocabulary, no allowlist in the teaching. The sandbox is the wall (§4.2).

---

## 8. Homes per the domain map (no junk-drawering — the directive's cross-cutting requirement)

| Feature | Owned by | Specifically |
|---|---|---|
| 1 Relationship | **rpg** (data plane) | field on `rpgPresentCharacterSchema`; vocab in `contracts/rpg/enums.ts`; write via `update_scene`; badge in `features/rpg` scene tab; derived beat at the rpg flush |
| 2 Level | **rpg** (identity plane) | field on `rpgSheetSchema`; `patchSheet` write; Sheet-tab + header render; NO tool/extraction arm (hand-only) |
| 3 Deception `<lie>` | **chat content** (grammar + seams) owns the tag grammar, render filter, wire projection; **injections** owns the teaching delivery; **rpg** owns the config knob + the host-reveal read | tokenizer span + `contentSpansToBlocks`/`toContentParts` arms (chat); `RPG_DECEPTION_TEACH` on the reminder (rpg→injection channel); `rpg.revealHidden` host read |
| 4 Omniscience `<ofilter>` | same as 3 (the shared matrix mechanism) | same seams; `RPG_OFILTER_TEACH` |
| 5 CYOA | **chat content** owns the `:::choices` fence + render block; **client chat** owns click→send; **rpg** owns the knob + teaching | tokenizer fence + render block (chat); `use-send-message` reuse (client); `RPG_CYOA_TEACH` |
| 6 Plot progression | **rpg** owns the steer entries + the fire path; **injections** owns the one-shot delivery | `RPG_PLOT_STEERS` (rpg); `rpg.plotSteer` proc; ephemeral injection (convergence law) |
| 7 Immersive HTML | **chat content** owns the `:::card` fence + the `html-card` block (built) + the wire stub; **ui** owns the sandbox posture; **injections** owns the teaching; **rpg** owns the knob | tokenizer fence + trust routing (chat); `srcdoc.ts` scripts flip (ui); `RPG_CARD_TEACH` (rpg→injection); knob (rpg) |

**The hidden-tag mechanism (3+4) is ONE mechanism (§3), two consumers** — designed once as the visibility
matrix, with the explicit visibility rules (§3.6: model always; host via the eye + server-gated read;
members never — server-stripped). The render filter is client + a server strip-for-members arm; the wire
projection is the server `toContentParts` seam. No per-feature machinery.

### 8.5 The rpg-plane GRAFT MAP (relationship/level/plot full-mode doorways — D86 discipline)

Full-mode arrival + future evolution ADDS the rows below; renames/re-types/migrates NOTHING this program
ships (the lite spec's §C graft invariant, extended to the parity-plus planes):

| # | Doorway | ADDS | Never |
|---|---|---|---|
| **#R1** | per-game relationship VOCAB override | `config.features.relationshipVocab?: string[]` extending the extraction enum (the R1 constraint list); a stored `{kind:"custom", label}` forward-lifts if the game promotes the label to a kind | re-type `{kind, label}`; break a stored custom relationship |
| **#R2** | full-mode CHARACTER↔CHARACTER relationship matrix | an additive `toward?: RpgActorRef` on the relationship field (default = toward the player) — full's faction/reputation engine reads it | re-shape the relationship field; require `toward` on lite rows |
| **#R3** | full-mode LEVEL engine (auto-level-on-milestone) | a host toggle + a full-mode leveling verb reading `rpg_sheets.level`; the column is byte-stable | make lite's level model-writable; add a level tool to lite |
| **#R4** | full-mode/ genre-aware PLOT steers | `RPG_PLOT_STEER_KINDS` members + `PlotSteerDef`s whose `resolve(view)` reads more state (#P1) | change the button-row / fire-path contract |
| **#R5** | relationship in a full-mode NPC entity | the relationship field rides `presentCharacters` (scene) today; full's `rpg_npcs` entity carries its own via the existing `npcId` linkage doorway (lite spec §4.1) — additive | move relationship off the present-character plane |
| **#R6** | richer custom cast-fields (§2.8) — meter thresholds/color-bands, a host-only (GM-secret) field scope, per-field write-permission | additive fields on the `castFields` schema shape; the stored record is untouched | re-type the stored `customFields` record |
| **#R7** | STRICT-tools on the `auto` path (the constrained-decoding truth table, §10.1) — the D48/general-chat tools that route through `tool_choice:"auto"` are UNCONSTRAINED today; strict makes them schema-enforced | an AUDIT of each tool-def schema for strict-style compliance (§10.1 authoring law), THEN `strict:true` set per tool at the wire projection (a backend seam, capability-keyed; `strict` is on all 3 vLLM surfaces + the OR OpenAI-style analog). The AUDIT gates the flip — not a blind flag-flip (strict requires strict-style schemas). `VLLM_ENFORCE_STRICT_TOOL_CALLING` defaults true — leave it | flip `strict` before the schema audit passes (a non-strict-style schema breaks under strict) |

| **#V9** | OR reasoning-echo for interleaved-thinking + tools (§10.1) — the OR chat-completions recurse loop must ECHO the `reasoning` field on the continued assistant tool-call message | a small change at the recurse-loop seam (`[[per-backend-wire-vocab-differs]]`): thread `reasoning` back on the continued message | drop `reasoning` silently on the recurse (breaks the reasoning chain for a reasoning+tools OR model) |

*WHY #R7 is a DOORWAY not a v2 wave (argued):* the parity-plus features that emit through the
extraction/tool-round path are ALREADY on the constrained path (`required` / `json_schema` — §10.1 truth
table), so they are safe without #R7. #R7's beneficiary is the GENERAL-chat D48 tool surface on `auto`
(and future plugin tools) — OUTSIDE this program's scope, and its opener is an audit of tool-def schemas
against the strict authoring style (§10.1). A doorway with a concrete opener (the audit) is the honest
shape; folding a cross-cutting tool-strictness pass into a rpg-feature program's waves would scope-creep it.

---

## 9. Knobs — OPTIONS-FIRST (create-time picks + advanced config), defaults argued

**M6 (v2) — OPTIONS-FIRST framing.** The owner ratified an options-first posture: the feature choices are
OPTIONS the host picks at game creation (a visible options panel), NOT scalars buried in config. The
storage is still a `config.features` sub-object on `rpgGameConfigSchema` (additive JSON, self-heals at the
parse seam — the `config.lite` precedent), but the SURFACE is a create-time options step + an advanced
config editor, so a host consciously chooses their play-style rather than inheriting hidden defaults. The
schema (every field defaulted so an old blob lifts — the values below ARE the create-panel defaults):

```ts
features: z.object({
  // ── the seven feature toggles (create-panel options) ──
  relationships: z.boolean().default(true),              // 1 — relationship field + badge + beat
  level: z.boolean().default(false),                     // 2 — level field + render
  deception: z.boolean().default(false),                 // 3 — <lie> teaching + reveal
  omniscience: z.boolean().default(false),               // 4 — <ofilter> teaching + reveal
  cyoa: z.boolean().default(false),                      // 5 — choices fence + teaching
  plotProgression: z.boolean().default(true),            // 6 — the wand Plot submenu (M5)
  immersiveHtml: z.boolean().default(true),              // 7 — card teaching (render always honors a card)
  // ── the v2 sub-knobs (advanced config) ──
  immersiveHtmlInteractive: z.boolean().default(true),   // M3 — governs the ASK for scripts, not the render
  hiddenContentReveal: z.boolean().default(true),        // M4 — offer the host the reveal eye at all
  cardKeepLastX: z.number().int().min(0).default(0),     // M2 — X newest cards ride the wire full (0 = collapse all)
  // ── the v2 vocab/schema config (§2.1 M1 / §2.8 C) ──
  relationshipHints: z.record(z.string(), z.string()).default({}),   // M1 — custom-kind → steering gloss
  castFields: z.array(rpgCastFieldSchema).default([]),               // C — host-defined tracked cast fields
}).default({ /* the field defaults above */ }),
```

Each is WIRED both ends at birth (`[[knob-wire-coverage]]` / D107): the write door is `updateConfig`
(the one config write, host-gated) + the create-time options panel; the read end is the gather (teaching
injection) / the panel (render). No dormant switches.

**Default postures, argued (the create-panel option defaults):**
1. **`relationships: true`** — the genre floor; a companion chat wants relationship steering by default.
   Low-risk (a field + a badge).
2. **`level: false`** — opt-in progression flavor; a phantom "Level" on a slice-of-life chat is noise.
3. **`deception: false`** — the hidden-channel mechanic changes how the model narrates (it starts hiding
   truths); a deliberate play-style the host opts into (and the reveal eye is a real UI they enable).
4. **`omniscience: false`** — same as deception (a narration-discipline mechanic opted into).
5. **`cyoa: false`** — a strong play-style (numbered choices every turn) many players don't want.
6. **`plotProgression: true`** — the wand Plot submenu is unobtrusive (fires only on click, no always-on
   cost) and broadly useful for un-sticking a scene.
7. **`immersiveHtml: true`** — a card ALWAYS renders if emitted (the knob gates only the TEACHING ask);
   the permissive teaching + the sandbox wall make default-on the "seeing what god made" experience the
   owner wants.
- **`immersiveHtmlInteractive: true` (M3)** — when `immersiveHtml` is on, the ask INCLUDES interactivity
  by default (the fun); a host wanting calm static cards turns just this sub-toggle off.
- **`hiddenContentReveal: true` (M4)** — when deception/omniscience is on, the host gets the reveal eye by
  default; a host wanting pure-blind hidden play turns it off.
- **`cardKeepLastX: 0` (M2)** — immediate total collapse (v1's argued cache/budget-honest default); a host
  seeing the 8B lose card continuity sets X=1.
- **`relationshipHints: {}` (M1)** — no custom hints until the host authors a custom relationship kind.
- **`castFields: [] ` (C)** — no tracked cast fields until the host defines a schema (empty = the feature
  is off; a defined field or nothing, no half-state).

**Still recorded as doorways (NOT shipped):** the lie-resolution/reveal-moment "mark exposed" affordance
(§3.6 — the standing-inventory is v1); the card postMessage self-sizing (§4.7); `structural_tag` emission
enforcement (§8.5 #V8); strict-tools on the `auto` path (§8.5 #R7).

*Per `[[no-separate-reduced-modes]]`:* each option is an APPLICABILITY arm on ONE real surface (the game),
not a separate mode. An option-off feature is ABSENT (no teaching, no render affordance), not a degraded
twin.

---

## 10. Tests / gates plan + security-executor flags (per the whole-tree gate classes)

**Gate classes to pre-pay** (the classes the coordinator's recent whole-tree pass surfaced):
- **mirrors** — every new source file gets its test mirror (`[[new-test-file-trips-layout-and-fabrication]]`:
  fold into existing test files where a mirror would trip layout/fabrication; a NEW test file needs a
  source mirror).
- **membership** — new tuple members (`RPG_RELATIONSHIP_KINDS`, `RPG_PLOT_STEER_KINDS`, the new content-span
  kinds, the `config.features` keys) each get their satisfies-belt / exhaustive-consumer coverage; a new
  router proc (`rpg.plotSteer`, `rpg.revealHidden`) gets cross-tenant sweep classification (PROBED)
  (`[[new-router-needs-sweep-classification]]`).
- **fabrication** — test factories/`satisfies` for the new schemas; a deliberate invalid-input probe gets
  `// FABRICATION-OK: <reason>`. The new content-span shapes get typed fixtures.
- **suppressions** — the visibility-matrix dispatch is a `Record`/total function (no switch+assertNever
  ratchet trip — `[[single-arm-dispatch-record-not-switch]]`); the tokenizer arms are linear regex (no
  ReDoS suppression). Aim for zero new suppressions; any genuinely warranted one uses the sanctioned
  baseline regen (shrink-only).

**Per-feature test obligations:**
- **1 Relationship:** the enum-exact write (an off-vocab kind is rejected/unrepresentable); the
  `presentUpsert` patch (omit = keep); the derived relationship-change beat (staged at flush, swipe-
  consistent); the badge render (a `side-eye` snapshot). Swipe-consistency: a relationship change on
  variant A rewinds on swipe to B.
- **2 Level:** `patchSheet` writes it (host + member-own); it is ABSENT from the extraction schema (a
  model cannot write it — pinned by a "extraction schema has no level field" assertion); render omits
  null.
- **3+4 Visibility matrix (the depth):** the tokenizer recognizes `<lie/>`/`<ofilter/>` + degrades a
  malformed one to text; the render filter emits NO block for a hidden span (client) AND the server
  strips hidden spans from a MEMBER's message payload (the security pin) but keeps them for the host
  read; the wire projection emits the tag VERBATIM (`{full}`) — pinned by a wire-capture assertion the
  model sees the truth; the host-reveal read is host-gated (a member gets 403/empty); the standing-lie
  inventory groups by character across the selected-variant transcript.
- **5 CYOA:** the `:::choices` fence tokenizes to a choices span; the render is buttons; a click sends the
  choice text through `use-send-message` (assert the send fired — `[[assert-the-mutation-fired]]`); wire
  = full.
- **6 Plot:** each steer def resolves; the `twist` templates against a real tracker view; `rpg.plotSteer`
  fires a turn with the steer injection (ephemeral, not persisted — assert no `chat_injections` row);
  cross-tenant PROBED.
- **7 Immersive HTML:** the `:::card` fence tokenizes to a card span + degrades an unclosed fence to text
  (streaming pin); the render is an `html-card` block (built); the wire STUB is `[card: title]`
  deterministic (same bytes across two assemblies — the cache-stability pin); the stub reaches compaction/
  summarize + shows in wire captures; trust routing (model card → tierB); swipe shows different cards.
- **Per-backend parity:** the wire stub/verbatim collapse is IDENTICAL across all six modes (one
  `toContentParts` seam — a parity test over the connection matrix, the `[[per-backend-wire-vocab-differs]]`
  lens: the COLLAPSE is wire-agnostic even though the wire vocab differs).
- **Squash parity:** a squashed multi-message run's card fence / hidden tag survives the `\n\n` join
  (§3.7).

**Security-executor flags (build-time pass — policy, not doubt):**
1. **The `allow-scripts` sandbox flip (§4.2)** — confirm null-origin holds (no `allow-same-origin` ever
   pairs with `allow-scripts`), the CSP `default-src 'none'` blocks fetch/exfil, no top-navigation
   escape. THE boundary this program changes.
2. **The host-reveal data path (§3.6)** — confirm hidden content is SERVER-STRIPPED from a member's
   message payload (never leaked in the wire to a non-host) and the `rpg.revealHidden` read is
   host-gated server-side (not a client-only hide). A deception mechanic whose truth leaks in the payload
   is broken.
3. **(if built) card postMessage self-sizing (§4.7)** — a card messaging the parent is a new channel;
   validate origin/shape if that follow-up lands.
These ride EXISTING trust designs (the sandbox, the roster host gate, the render-trust resolver) — the
pass CONFIRMS the wiring, it does not design new boundaries.

### 10.1 Robustness coverage — the D79 heal pattern (round-5 LIVE-VALIDATED) + the small-model reality

The parity-plus program leans on schema-constrained generation on capable backends. Two robustness truths
from the vLLM docs (owner-supplied 2026-07-27) shape the coverage — and the W4 fix stint's `journalTitleFor`
derive is the D79-heal pattern's FIRST live validation (round-5, 2026-07-27: 3/3 flush landed, all failure
logs zero, the sync-barrier race closed with the quest-progression proof).

**The constrained-decoding TRUTH TABLE (the capability doctrine, made precise):**
- `tool_choice: "required"` + a named tool = **schema-constrained ALWAYS** on vLLM. The rpg tool round
  (§ cheap mode) is on this STRONG path — the round-4/5 clean parallel calls now have their documented
  explanation (required forces the schema).
- `tool_choice: "auto"` = **NO constraint** unless the tool sets `strict: true` — args are raw-text-extracted
  and "may occasionally be malformed or violate the schema." *Consequence for this program:* any tool the
  program routes through `auto` (not the rpg round — that's `required`) is UNCONSTRAINED. The parity-plus
  features that emit through the extraction/tool-round path are safe (required/json_schema); a future
  general-chat tool on `auto` is not — see the strict-tools doorway (§8.5 #R7).
- **The nested-required gap (LIVE-MEASURED):** even `json_schema` with `required` set does NOT enforce
  `required` on NESTED ARRAY ITEMS on xgrammar — the `journal[].title` omission the fix stint caught (5/8).
  This is WHY the strict-schema authoring style (below) matters: it converts omission to a forced-null the
  parse tolerates.

**THE STRICT-SCHEMA AUTHORING LAW (every NEW schema this program mints — a §10 authoring rule):** the
vLLM-doc-blessed strict style is `additionalProperties: false` (already the D79 `projectJsonSchema` default)
+ **mark ALL fields required** + **model an optional field as NULLABLE (`type: ["string","null"]`), never
by omission**. Under strict style the model CANNOT omit a field — it is forced to emit `null`, the parse
succeeds, and the code handles null. *THE LAW:* every new schema the program mints — the relationship
`{kind,label}` write, the cast-fields vocab (§2.8), the `:::choices` structural payload, any new tool arg
— is authored strict-style (required + nullable, not optional-by-omission), so the `journal[].title`
omission class is NEVER BORN AGAIN. The `journalTitleFor` optional+derive fix STAYS (it works, round-5-proven,
and it is defense-in-depth for a backend that ignores strict too); the authoring law prevents NEW instances.
*Doorway (not churned now):* migrating the existing `rpgExtractionSchema` fields to required-nullable is
recorded as an additive doorway — the working derive fix ships, the strict migration is a later hardening.

**The extraction HEAL seam (round-4/5 named cause — now KNOWN):** §2.7.4 reserved a slot for E2E round-4's
named cause of reliable's empty-delta behavior. It LANDED: the cause was the `journal[].title` nested-required
omission (xgrammar doesn't enforce nested required) failing the whole `safeParse`. The heal shipped in the
fix stint (title optional + derived; the per-plane lenient parse posture). This is the D79 heal pattern's
concrete first instance; the seam stays open for any further small-model near-miss the strict-schema law
doesn't pre-empt (e.g. a JSON-repair arm for a truncated structured output — a doorway, not built).

**`structural_tag` — the token-enforced emission doorway (vLLM-only, §8.5 #V8):** vLLM's `structural_tag`
family enforces schema-valid JSON INSIDE designated tags amid free prose, in ONE generation. This is the
concrete mechanism for the prose+state-together mode-3 doorway (upgraded from "parse-based like marinara"
to "structural_tag-enforced on capable backends") AND a potential enforcement arm for the hidden-tag
(`<lie …/>`) and `:::card`/`:::choices` fence EMISSION on local. Capability-keyed, vLLM-only (OpenRouter
has no analog) — an ENHANCEMENT over the portable prompt-taught base (the capability doctrine's exact shape:
the base works everywhere, the strong backend does better). NOT built into the v2 waves — a doorway with a
now-known mechanism (§8.5 #V8).

**Interleaved thinking — the THIRD tool-calling axis (capability-doctrine cell, argument not machinery):**
beyond parallel-calls and sequential-calls, some models REASON BETWEEN calls (reason → call → observe →
reason → call). This is the STRUCTURAL cure for the 8B under-decomposition caveat (§6.2 / the tool-round
nudge): a model that natively reasons between calls does what our checklist prompt only APPROXIMATES — it
observes the beat, calls one plane, reflects, calls the next. The agent-sdk skins get it FREE on Claude
models (the SDK owns the loop); vLLM parses it for Kimi-K2-Thinking / MiniMax-M2; Qwen3-VL does NOT support
it (nothing changes locally). *Doctrine consequence:* this is a per-model capability CONSIDERATION, not a
knob — the tool-round prompt (§6.2) stays the portable floor (it works on the 8B that lacks interleaved
thinking), and a model that HAS it decomposes better for free. An argument arm in the capability doctrine,
not machinery to build.

**OR reasoning-echo doorway (the recurse-loop seam, `[[per-backend-wire-vocab-differs]]` class, §8.5 #V9):**
interleaved-thinking models hosted on OpenRouter require the client tool loop to ECHO the `reasoning` field
back on the assistant tool-call message when continuing the recurse — a loop that silently drops it breaks
the reasoning chain. The current OR chat-completions recurse loop does not echo `reasoning` (no current
model needs it). *Doorway (not built):* pointing an OR connection at a reasoning+tools model later is a
KNOWN small change at the recurse-loop seam (echo `reasoning` on the continued assistant message), not a
silent degrade — named here so it is a recognized wire-vocab difference, not a future mystery. Named in the
graft map (§8.5 #V9).

**Cache-discipline hygiene (agent-sdk skins — an all-clear banked 2026-07-27):** the card wire-stub (§3.5)
and the whole program's cache posture depend on the sub + OR agent-sdk skins keeping their prompt caches
warm. A vLLM-doc-flagged risk — Claude Code injecting a per-request git-attribution hash into the system
prompt (churning it every request) — was checked: ALREADY suppressed by the firewall
(`CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT`/`DISABLE_GIT_INSTRUCTIONS`/empty config dir) AND now pinned OFF
explicitly (`CLAUDE_CODE_ATTRIBUTION_HEADER: "0"` in the agent-sdk env, tripwire-tested). No per-turn cache
tax on the surviving skins; the program's cache assumptions hold.

### 10.1a State-round economics — records & stats posture (F5, ACCEPTED-AND-DOCUMENTED, orchestrator-ruled)

The rpg state round (reliable extraction / cheap tool round) is a REAL billed model call per game turn, but
its tool calls fold to an extraction and are DROPPED (`toolCallsToExtraction`) — no `ToolCallRecord` lands
on any variant, and no stats delta is built (the stats plane meters engine/character turns only). The
stickler flagged this as an undocumented spend path (F5). **Orchestrator ruling (2026-07-27):
ACCEPTED-AND-DOCUMENTED for v1.** *WHY it is correct, not a gap:* the state round is an INFRA-ECONOMIC call
of the SAME class as summarize / managed-compaction / memory-digest generation — background model work that
serves a turn but is NOT itself a conversational turn. None of those land a `ToolCallRecord` or a stats
delta either; they are metered by the PER-ITEM PROVIDER LOGS (`provider.structured-item` /
`provider.summarize-item` — success AND failure, tokens + duration + finishReason, tagged by role) + the
wire captures. So the state round's economics ARE recorded — in the provider-observability plane where its
siblings live, not the conversational-turn plane (D46: "cost VISIBILITY is untouched — enforcement died,
not measurement"; the visibility is the per-item log, which this batch built). A `ToolCallRecord` on the
variant would be a category error: the state round's calls are not the character turn's tool exchanges (the
char turn is tool-less), so persisting them on the variant would mislead the transcript reader into thinking
the character called tools. **The doorway (named for parity-plus):** if a future need wants state-round
tokens IN the per-chat/per-user stats rollup (not just the provider log), a `RpgStateRoundEconomics` sink on
`RpgContext` (injected like `emitBus`/`onFlushDropped`) would fold the round's usage into a stats delta at
the flush seam — additive, no variant-record change. NOT built v1 (the provider log is the v1 economics
record). *Coordination note (F5): the argument lives HERE (§10.1a); the sec-exec owns `compose/rpg.ts` and
should fold a one-line pointer into its `buildRunExtraction`/`buildRunToolRound` header when that file is in
their hands — "state-round economics: the per-item provider log is the v1 record; see spec §10.1a / doorway."*

### 10.2 Test obligations for the v2 additions (A/B/C + the mods)

- **(A) macros × rpg (§12):** the gather stages `rpgSceneState`/`rpgCast`/… (a game turn → the map is
  populated; a non-game turn → `{}`, byte-identical); `{{rpgSceneState}}` renders the value / "" off-game;
  `{{expr::rpg.cast.exists(...)}}` evaluates against the `rpg` CEL binding (a game) / errors-to-"" (off-game);
  the volatile-macro cache note (the rpg macros are volatile — the cache-buster scan includes them).
- **(B) regex reconciliation (§3.9):** the display choke-point composition (render filter AFTER
  `renderMessageForDisplay`); the stub × promptOnly composition (no corruption); the ordering pins.
- **(C) custom cast-fields (§2.8):** an undefined field key is unrepresentable under the constrained schema;
  a meter field renders/diffs numerically, a text field as a transition; an orphan value (deleted field) is
  not projected; swipe-consistent.
- **The mods:** M1 (custom hint in the reminder + enum-description); M2 (keep-last-X: X=0 collapses all,
  X=1 keeps the newest full); M3 (interactive toggle shapes the ask, not the render — a card renders
  regardless); M4 (host toggle hides the eye but the wire/member-strip are unaffected); M5 (the wand's
  Plot submenu fires through the guided path; the CYOA one-shot).

---

## 11. Build waves + sequencing (side-eye moments marked)

BUILD begins after the W4 commit lands (orchestrator sequences). Waves sized for executor stints:

| Wave | Contents | Size | Verify |
|---|---|---|---|
| **P0 — the delta block** (§2.7) | the pure per-plane diff registry (`substrate/delta.ts`) + the gather's previous-snapshot ladder read + the reminder placement (before the license) + the D79 delta-heal defensive arm (§2.7.4). Closes the license-vs-input gap the whole steering loop depends on; the relationship + cast-field diff renderers are authored here for P1. | S/M | delta per-plane + first-snapshot + no-change + swipe-consistency + hand-edit-source tests |
| **P1 — the data planes (1 + 2 + C)** | feature 1 (relationship field/vocab/**M1 hints**/`update_scene` thread/reminder line/derived beat/badge) + feature 2 (level field/`patchSheet`/render) + **feature C (custom cast-fields, §2.8 — RIDES HERE with relationship: shares the present-character plane, the `update_scene` write, the panel, the delta renderer)**. Contracts + rpg domain + panel. Strict-schema authoring law (§10.1) applies to every new schema minted here. | M | rpg int tests (relationship write/swipe/beat; cast-field enum-exact write + meter/text render + diff; level hand-only + absent-from-extraction); **side-eye** the relationship badge + cast-field meters + level render |
| **P2 — the visibility registry core** | §3 whole: the tokenizer span grammar (`hidden`/`card`/`choices` — one grammar family, driven by `HIDDEN_TAGS` + `DIRECTIVE_FENCE_NAMES` registries); `contentSpansToBlocks`/`toContentBlocks` render arms; the `toContentParts` wire arms (stub/verbatim, **M2 keep-last-X**); the server member-strip; the render filter. **The §3.9 regex reconciliation lands here** (the display choke-point reuse + ordering pins). The MECHANISM, feature-agnostic. | L | tokenizer degrade tests; render-filter + wire-stub + member-strip pins; per-backend parity + squash parity; §3.9 composition pins |
| **P3 — features 3/4 on the registry** | `<lie>`/`<ofilter>` teaching injections + options + the host-reveal read + **M4 host-toggle** + the standing-lie inventory + the eye affordance. | M | reveal host-gate (cross-tenant) + M4 toggle; wire-verbatim pin; **side-eye** the eye + inventory; **security-executor** flag #2 |
| **P4 — feature 7 (immersive HTML)** | the `:::card` fence (rides P2's grammar) + trust routing + `RPG_CARD_TEACH` + **M3 interactive sub-toggle** + the `srcdoc.ts` scripts flip + expand affordance. | M | card render/stub/swipe/streaming + M3 ask-vs-render; **side-eye** the card + expand; **security-executor** flag #1 (the sandbox flip) — MUST clear before merge |
| **P5 — features 5+6 ON THE WAND (M5)** | CYOA (`:::choices` fence + render buttons + click→send + teaching + option + **the wand one-shot "Offer choices"**) + plot progression (`RPG_PLOT_STEERS` + `resolve(view)` + **the wand "Plot" submenu**, riding `use-guided-actions` → `chat.generate` — NOT a bespoke button row). | M | choices click-send (assert-mutation); plot steer fires ephemeral injection via the guided path; cross-tenant PROBED; **side-eye** the wand Plot submenu + choice buttons |
| **P6 — macros × rpg (A, §12)** | the gather POPULATES `rpgSceneState`/`rpgCast` (+ relationship/quests/delta) into `rpgMacros`; the `rpg` object into `celBindings`; the volatile-macro cache note. LANDS LAST — it reads the tracker view the earlier waves shaped, so it wires a settled surface (argued §12). | S/M | macro renders off-game "" / on-game value; `{{expr::rpg.…}}` evaluates; the cache-buster scan includes the rpg macros |

**WHY macros (A) land LAST as P6 (the "where I argue" — the coordinator left the placement to me):** the
rpg data-macros (`rpgSceneState`/`rpgCast`) feed FROM the tracker view (`buildTrackerView`), and the
parity-plus planes (relationship, cast-fields, quests, the delta) that make those macros WORTH exposing
are shaped in P0–P5. Wiring the macro feed against a settled tracker view means P6 stages a stable surface
(no re-wiring as planes land); doing it early would re-touch the gather-stages-macros seam every time a
plane changed. It is also self-contained (the seam EXISTS — `MacroContext.rpgMacros`/`celBindings` are
built; P6 only populates them), so it slots cleanly at the end. *Rejected:* interleaving macro-feed edits
into each plane's wave (re-touches one seam N times — the exact churn the settled-surface ordering avoids).

**Verification lenses** (`verifier` for logic/data/server; `side-eye` for every rendered surface; both
where a wave spans both). Commit bar per the standing rule: lanes verify scoped; the orchestrator runs
`pnpm check` + the battery on the quiesced tree. A `stickler` pass on the P2 registry diff (substantial,
security-adjacent) before merge.

**Ledger at land:** mint **D110** (erratum fixed 2026-07-27 — this note predated the D108/D109 mints;
D108 = the rpg-lite carve, D109 = the W4 rulings, both live in Core-Path-Registry.md) — the parity-plus
program: relationship as a closed-vocab-with-custom
field; level hand-only; the CONTENT-CLASS VISIBILITY REGISTRY (two planes, an OPEN registry of content
classes, the `toContentParts` wire seam + the client/server render filter); the generic hidden-tag
registry (`HIDDEN_TAGS`, lie/ofilter first registrants) + the generic directive-fence registry
(`DIRECTIVE_FENCE_NAMES`, card/choices first registrants — version-tolerant); the
tierB-freeform-scripts-allowed sandbox posture (null-origin, no `connect-src`); the host-only reveal with
server member-strip + the `who`-attr per-player-perception doorway; the DELTA BLOCK (per-plane diff
registry, prev→current on the selected lineage, closing the license-vs-input gap); plot steers as
ephemeral rpg injections with `resolve(view)` state-aware defs re-homed on the composer wand (M5). **The v2
rulings** also land in D108: custom cast-fields (§2.8), the strict-schema authoring law (§10.1), the
options-first surface (M6), M1–M5, and the macro×rpg feed (§12). All extensibility doorways (§3.8, §8.5,
#D1, #V8/#V9/#R6/#R7) recorded as D86-style additive grafts. Plus the `docs/retro-workboard.md` row.

---

## 12. SECTION A — the MACRO × RPG integration (feature A — wiring an already-built seam)

The macro/CEL engine is a first-class prompt-authoring surface, and rpg state should be REACHABLE from it.
The seam is ALREADY BUILT (verified this session) — feature A only POPULATES it. Nothing new is designed.

### 12.1 What's already built (the seam)

- **`MacroContext.rpgMacros`** (`kit/macro/types.ts:167`) — a staged `Record<string,string>` map the game
  turn's gather populates; EIGHT rpg data-macros are REGISTERED against it (`kit/macro/registry.ts:485`:
  `rpgWorld`/`rpgSecrets`/`rpgContinuity`/`rpgCast`/`rpgSceneState`/`rpgMap`/`rpgPerception`/`rpgMorale` —
  the full-mode set) with DX metadata (`builtin-metadata.ts`). Each macro reads its key from the map or "".
- **`MacroContext.celBindings`** (`kit/cel`) — the `{{expr::…}}` activation, a data-only
  `Record<string,unknown>`.
- **The GAP:** the rpg gather returns `macros: {}` (`chat-ops/gather.ts:48`) — it feeds NONE of the eight,
  and stages NO `rpg` CEL binding. The registered macros render "" today.

### 12.2 What feature A wires (owner-ratified)

- **Populate the lite-relevant rpg data-macros from the tracker view.** The gather builds the same
  `buildTrackerView` projection the reminder reads, and stages: `rpgSceneState` (the ambient + present-cast
  + recent-beats block — the scene the reminder already renders); `rpgCast` (the party sheets + cast, incl.
  the parity-plus planes: **relationship**, **custom cast-fields §2.8**); and the parity-plus additions
  `rpgQuests` (active quests + objectives) and `rpgDelta` (the §2.7 delta block — the changes-since-last-beat
  line, reachable as a macro so a preset can place it). *WHY these:* they are the panel-rendered planes a
  preset author legitimately wants to weave into their OWN prompt shape (a card that says "Current scene:
  {{rpgSceneState}}"). The full-mode-only macros (`rpgMap`/`rpgMorale`/`rpgPerception`/`rpgSecrets`/
  `rpgContinuity`) stay "" in lite (they have no lite plane — the honest empty, byte-identical).
- **The `rpg` CEL object into `celBindings`.** A data-only structured view of the tracker state so
  `{{expr::…}}` predicates can read it: `{{expr::rpg.cast.exists(c, c.relationship == "enemy")}}`,
  `{{expr::rpg.scene.location}}`, `{{expr::rpg.quests.filter(q, q.status == "active").size()}}`. The `rpg`
  binding is the SAME tracker view shaped as a CEL-safe `CelValue` tree (scalars/lists/maps — no functions,
  the `celBindings` contract). A non-game chat stages no `rpg` binding ⇒ an `{{expr::rpg.…}}` errors-to-""
  with an expr-error diagnostic (the built CEL degrade).
- **The path-read set** (`rpg.scene.*`, `rpg.cast[].relationship`, `rpg.quests[].status`, `rpg.delta.*`) is
  the documented reachable surface — the shape is the tracker view, so it stays in sync by construction
  (one projection, two consumers: the panel + the macro/CEL binding).
- **`{{idle_duration}}` (D6 v2.1 fold — STEAL, made concrete).** Time since the last chat activity as human
  text (`8 minutes`, `1 hour 5 minutes`, `2 days 3 hours`) — the "the character notices you've been gone"
  beat. A context-macro (not rpg-specific — it belongs on the general `MacroContext`, so it works in any
  chat, game or not). **The load-bearing subtlety (marinara-proven, `macro-context.ts:130`):** it scans the
  message timestamps and EXCLUDES the in-flight message (else it always reads ~0 — the user just sent). The
  value is computed at assembly (server-side, off the message timestamps the chat already holds) and staged
  onto `ctx.idleDuration`; the macro reads it or "" (a fresh chat with one message = no prior activity =
  ""). Volatile (it changes every turn) — registered `volatile: true` so the cache-buster scan flags a
  preset placing it in a cached prefix (the §12.3 volatility-honesty discipline).

### 12.3 Metadata honesty + cache notes (owner-required)

- **Volatile-macro honesty:** the rpg data-macros ARE volatile (they change per turn as state moves), so
  they register `volatile: true` — the assembly cache-buster scan (`registry.volatileNames()`) already
  includes them (verified: the registration path drives `volatile`, `types.ts:73`). A preset placing
  `{{rpgSceneState}}` in its STATIC half is correctly flagged as a cache-buster (the macro-DX
  `MacroDiagnostic` surfaces it) — the author is told, no silent cache churn. *This is the cache-honesty
  note:* an rpg macro in a cached prefix busts it, and the volatile flag makes that VISIBLE, not silent.
- **The macros are a READ mirror, never a write:** `{{rpgSceneState}}` renders state; it never mutates it
  (unlike `{{setvar}}`). The rpg write path stays the tools/extraction (§ the delivery modes) — macros are
  a display/prompt-authoring convenience over the same tracker view, zero new write surface.
- **Requirement flag:** the rpg macros register `requires: "chat"` (they need the game turn's staged map);
  the preview engine marks them "substituted with a placeholder" off a live game (the built preview path).

### 12.4 Home + wave

Home: the gather (`domain/rpg/chat-ops/gather.ts`) POPULATES `rpgMacros` + the `rpg` CEL binding from the
tracker view; the kit macro/CEL data-feed seam is built (§12 wires it). Wave: **P6**. *NOTE:* the macro
ENGINE itself gets a capability upgrade — the MACRO ENGINE PARITY workstream (§12A), a separate program the
owner commissioned ("I want our macro engine to be on par with theirs in capability and flexibility so I can
build on top of it"). Test obligations for §12: §10.2 (A).

---

## 12A. THE MACRO ENGINE PARITY WORKSTREAM — steal ST's grammar wins, keep ours

> **Commissioned 2026-07-27** (owner: *"I want our macro engine to be on par with theirs in capability and
> flexibility so I can build on top of it"* + the do-it-right-once amendment: *"we haven't launched yet — if
> we're going to build, we might as well do it right and tested"*). Grounded in a full read this session of
> our engine (`kit/macro/{parser,evaluator,types,metadata,registry}.ts` + `kit/cel`) AND SillyTavern's NEW
> chevrotain engine (`references/sillytavern/public/scripts/macros/` — Lexer→Parser→CST→Walker + a
> `MacroRegistry` with typed arg specs + a `MacroFlags` grammar). **The mission phrase is the design
> compass:** every choice optimizes for what AUTHORS can COMPOSE later.

### 12A.0 The comparison, corrected (what leads where)

- **OURS leads** (NON-NEGOTIABLE through the upgrade — the hard constraint): variant-scoped swipe-safe vars
  with the op-log (`VarOp` replay along the selected-variant chain, D46); FREEZE-AT-COMMIT determinism
  (`nowMs`/`random` injected seams); CEL-class expressions (`{{expr::…}}` over `kit/cel`, linear-time,
  2KiB-capped); the ONE shared server/client row atom (`resolveRowMacros`); cache/VOLATILITY honesty
  (`registry.volatileNames()` → the cache-buster scan); the `MacroBudget` recursion/output caps.
- **THEIRS leads** (what we steal): grammar GENERALITY (any macro takes a body; a flags grammar; typed
  arg specs enforced in the execution path) + the AUTHORING surface (user-defined macros with source
  attribution).
- **The program = steal their wins WITHOUT losing ours.** Every wave below re-states the ours-invariants it
  must preserve; the determinism-through-nesting property (§12A.2) is the one that must NEVER regress.

### 12A.parser The PARSER STRATEGY — hand-rolled extension, NOT chevrotain (argued)

Our parser (`kit/macro/parser.ts`) is a hand-rolled recursive-descent scanner over `{{…}}`: depth-aware
brace scanning, block open/close, comment macros, literal-brace escape, `::`/`:`/whitespace arg forms,
degrade-don't-throw (unclosed → literal text). **The parity grammar EXTENDS this parser; it does NOT import
chevrotain.** *WHY (the kit-dependency-lean constraint, argued):* (1) kit is isomorphic + dependency-lean
(the `kit/cel` wrapper pins its ONE parser dep behind a seam precisely to keep the rest hand-rolled);
chevrotain is a ~150KB lexer/parser framework — importing it for the macro grammar would be the heaviest
dep in kit, on the hot render path, client + server. (2) Our grammar is SMALL (a `{{…}}` template language,
not a general programming language) — the constructs the parity adds (flags between braces, content bodies,
typed args) are LINEAR extensions of the existing depth-aware scanner, each a bounded addition to
`readTag`/`scanMacroBody`/`buildBlocks`. (3) The existing parser already has the hard-won posture the
parity must preserve — degrade-don't-throw, byte-exact `raw` re-emit, the literal-brace escape, ReDoS-safe
linear scanning; a chevrotain rewrite would re-litigate all of it. (4) CEL already covers the ONE place we
genuinely need a real expression grammar (`{{expr::…}}`), and it IS behind a swap-seam. *Rejected:*
chevrotain (dep weight + re-litigating the degrade posture for zero capability the hand-roll can't reach);
a parser-combinator lib (same dep-weight objection, smaller). **The strategy: grow `parser.ts` +
`evaluator.ts` + `types.ts` + `registry.ts` in place, each wave a bounded, corpus-tested extension.**

### 12A.stored-content STORED-CONTENT COMPATIBILITY — free-when-cheap; the right design WINS (owner amendment)

> **Owner amendment (2026-07-27):** stored-content compat is DOWNGRADED from hard constraint to
> free-when-cheap. There is no user base — the only stored content is the owner's own seeds/cards
> (migratable). **Design the IDEAL grammar first; if the right design conflicts with legacy parse behavior,
> the right design WINS** (note what breaks + the one-time migration). This is the do-it-right-ONCE moment —
> flags, scoping, escaping, arg syntax all get their FINAL shape now, because post-launch this constraint
> flips permanent.

**The one real conflict this unlocks resolving (the flags/block collision):** our parser TODAY uses
`{{#name}}…{{/name}}` for block open/close, where `#` = block-OPEN and `/` = block-CLOSE. ST's flags
grammar uses `/` = closing-block and `#` = preserve-whitespace, with flags sitting BETWEEN the braces and
the identifier (`{{!name}}`, `{{>name}}`). Under the OLD hard-compat constraint I'd have to shim around
this; under free-when-cheap I design the IDEAL and migrate. **The ideal (argued, §12A.1/§12A.4):** adopt
ST's flag POSITIONS (`/` closing-block, `#` preserve-whitespace, as FLAGS between braces + identifier),
and REPLACE our `{{#name}}…{{/name}}` block syntax with the universal `{{name::args}}content{{/name}}`
form (content-as-last-arg, §12A.1) — where `{{/name}}` stays the closing tag (the `/` flag on an
identifier-matching close). *WHAT BREAKS + THE MIGRATION:* any owner seed using the current
`{{#if}}…{{/if}}` block form re-parses under the new grammar — but the universal grammar SUBSUMES it
(`{{#if}}` → `{{if::cond}}…{{/if}}` or the flag-form), so the migration is a mechanical find-replace over
the owner's seed files (a one-time script, noted in the wave plan). *WHY worth it:* a clean flags grammar
where `/` uniformly means "closing block" (not "block-close-that-conflicts-with-a-future-flag") is the
final shape; carrying the old `{{#…}}` special-case forward would fossilize a pre-flags wart into the
launch grammar permanently. **The pre/post-processor legacy-shim seam (ST's decade-of-content tool) is NOT
adopted as compat debt** — we use it ONLY if it's genuinely the cleanest seam for a specific transform
(e.g. a born-migration of a deprecated form), never as standing legacy support.

### 12A.1 WAVE M1 — the UNIVERSAL SCOPED-BLOCK GRAMMAR (highest-value; grammar-first)

**The win (ruling #1):** ANY macro may take a BODY — `{{name::args}}content{{/name}}` — with the content
becoming the macro's last (unnamed) argument; auto-TRIM + indentation DEDENT by default; a
preserve-whitespace escape (the `#` flag, §12A.4). Today blocks exist ONLY for hardcoded `#`-prefixed forms
(`{{#if}}`); this generalizes bodies to every macro (multiline `{{setvar}}` bodies, block content for
future user macros).

**Design (the parser extension):**
- The parser's `buildBlocks` already pairs open/close tags into a `MacroBlockNode{children}`. Generalize:
  a `{{name::args}}…{{/name}}` opens a scoped block for ANY `name` (not just `#`-prefixed); the CLOSE is
  `{{/name}}` (the `/` closing-block flag on a name-matching tag). The body (the `children` AST) is passed
  to the handler AS the content — the evaluator's `evalBlockNode` ALREADY passes `node.children` to the
  handler; the generalization is that a handler declaring "I take a body" receives the RESOLVED body string
  as its last unnamed arg (the `resolveContent`/`trimContent` seam, §12A.2).
- **Content-as-last-arg + trim/dedent:** the resolved body is trimmed + indentation-dedented by default
  (matching authored indentation to the macro's column), preserved verbatim under the `#` flag. This is a
  new `trimContent(content, {trimIndent})` helper (ST's shape adopted) — pure, on the resolved string.
- **Ours-invariant preserved:** the body's macros resolve through `ctx.evaluateAST` (the depth guard +
  budget fire — `evaluator.ts:113` already routes unknown-block children this way); a body doesn't escape
  the `MacroBudget`. The `raw` re-emit posture holds (an unknown-name scoped block re-emits its original
  bytes, degrade-don't-throw).

**WHY grammar-first (the sequencing argument — see §12A.seq):** the grammar's FINAL shape (flags, bodies,
escaping) must be locked BEFORE any authoring surface (user macros) or any content is written on it. This
wave is the foundation the other four build on.

### 12A.2 WAVE M2 — the GENERALIZED LAZY CONTRACT + determinism-through-nesting

**The win (ruling #2):** promote the hardcoded `{{#if}}` laziness into an author-accessible contract: a
generalized `delayArgResolution`-equivalent + a `resolve()` callback that PRESERVES offset/determinism
through nesting (ST's `globalOffset` discipline).

**Design:**
- `delayArgResolution` ALREADY exists (`registry.ts` option, honored at `evaluator.ts:100`) — a lazy
  handler reads its unresolved args + resolves them itself. Generalize it into the AUTHOR-facing contract:
  a handler receiving unresolved args ALSO receives a `resolve(content, opts?)` callback in its
  `MacroContext` (the `ctx.evaluateString`/`evaluateAST` seam, made a first-class per-call handle).
- **The determinism-through-nesting property (the NON-NEGOTIABLE ours-invariant):** our freeze-at-commit
  seam is `ctx.nowMs` + `ctx.random` (an injected PRNG). Today a nested `{{pick}}`/`{{random}}`/`{{roll}}`
  inside a lazy handler's late-resolved content draws from the SAME injected `ctx.random` — but the ORDER
  of draws must be STABLE across refactors (a swipe/replay re-runs the exact same PRNG sequence). ST solves
  the analogous problem with a `globalOffset` threaded through nested resolution so a `{{pick}}`'s
  position-based determinism survives nesting. **Our equivalent:** the `resolve()` callback THREADS the
  injected `ctx.random`/`ctx.nowMs` unchanged (never re-seeds, never forks a child PRNG) — so a lazy
  handler resolving its body late draws from the parent's PRNG in document order, identically to eager
  resolution. This is the property the determinism pins (§12A.tests) MUST prove never regresses: eager vs
  lazy resolution of the same template + seed = byte-identical output, and the op-log (VarOp) records the
  same mutation sequence.
- **Ours-invariant preserved:** the op-log + freeze-at-commit are UNCHANGED — a lazy handler's late writes
  push to `ctx.opLog` in resolution order (the replay along the variant chain stays deterministic); the CEL
  activation (`celBindings`) is data-only and re-read, not re-seeded.

**D5 (v2.1 fold — ADAPT, perf) — the var-op-aware MEMOIZING resolver for the hot row-macro path.** The
shared server/client row-macro atom (`resolveRowMacros`) resolves the SAME regex-script/trim template
strings repeatedly during one display render (the DISPLAY-regex pass re-runs the same templates per row).
Marinara's `createMessageMacroResolver` (`chat-macros.ts:208-234`) is the correct memoization contract:
cache-by-template-string for ONE display computation, cap the cache to templates ≤2048 chars, and — the
subtle-correct part — **PERMANENTLY invalidate the cache from the FIRST variable WRITE onward** (a
`variablesTouched` latch). *WHY the latch, not "skip var-op templates":* a naive "cache unless this template
writes a var" is WRONG because conditionals and the argument-less `{{NAME}}` env-catch-all can READ a
variable without matching any var-op pattern — so a template cached BEFORE an unrelated write would serve
stale on a repeat AFTER the write (a later read observes the earlier write). The permanent latch is correct
by construction: once ANY write happens, no cached repeat is trustworthy. **ADOPT IF the row-macro resolver
shows up hot** (a profiling gate, not a speculative build — measure first); the correctness argument goes in
the commit. This is a perf pattern, not a capability — noted here so it's in hand when the profile calls for
it. NOT a wave; a documented drop-in.

### 12A.3 WAVE M3 — RUNTIME-ENFORCED TYPED ARGS

**The win (ruling #3):** extend `MacroArgDef` from DX-metadata-only into EXECUTION-PATH enforcement
(ST's `MacroRegistry.executeMacro` + `validateArgTypes` is the reference).

**Design:**
- Today `validateMacroArgs` (`metadata.ts`) checks arity + arg types but ONLY feeds the diagnostics sink
  (DX squiggles); `strictArgs` renders "" on a strict error (`evaluator.ts:56`). Promote this to a full
  runtime contract: per-arg types (string/number/boolean, ST's `MacroValueType`), an
  optional-suffix + defaults model (`unnamedArgs: number | MacroUnnamedArgDef[]` where optional args form a
  contiguous suffix with `defaultValue`s), a LIST spec (`list: {min?, max?}` — variadic args after the
  fixed ones), strict/lenient modes per macro, and proper runtime-error CLASSING (a typed
  `MacroArgError` the fail-open policy degrades legibly, not a bare `bad-arg-type` string).
- **Ours-invariant preserved:** the FAIL-OPEN policy (`evaluator.ts:64` — a bad macro degrades to literal
  `{{name}}`, never crashes a turn) is KEPT as the outer boundary; typed-arg enforcement adds a legible
  error CLASS inside it (the diagnostic carries the arg index + expected/got type), and `strictArgs`
  chooses render-"" vs best-effort. The DX metadata (`MacroMetadata`) and the runtime spec become ONE
  home (the metadata IS the runtime contract — no second declaration to drift, the D51 one-home discipline).

**D2 (v2.1 fold) — the ENFORCEMENT POSTURE is STRICT-AUTHOR / LENIENT-RENDER.** Marinara's `${name}`
prompt-override engine (`prompt-overrides/template.ts`) proves the pattern in the wild: `validateTemplate`
runs at the WRITE path and returns `unknownVariables[]` (surfaced as an authoring diagnostic — a chip
palette of the declared set + an "unknown variable" warning), while `renderTemplate` leaves an undeclared
`${x}` INTACT rather than throwing ("production rendering should never crash on a stale template"). This is
the exact posture for §12A.3's enforcement:
- **STRICT at the AUTHOR/WRITE boundary** — when a preset/game/user-macro template is SAVED, validate it
  against the declared macros + their arg specs and surface unknown macros / bad-arity / type-mismatch as
  AUTHORING diagnostics (the DX squiggle + the macro-browser palette). This is where `strictArgs` bites
  hard: the editor holds new authorship to the bar.
- **LENIENT at RENDER/generation** — a template that is somehow stale at generation time (a macro was
  renamed, a game's vocab changed) NEVER crashes the turn: the unknown macro degrades to literal `{{name}}`
  (the existing fail-open, `evaluator.ts:64`), the render proceeds. A generation is not the place to enforce
  authorship — the author already had their diagnostic at write time.
- *WHY this split, not uniform-strict:* uniform-strict-at-render would let a stale stored template abort a
  live generation (the exact crash marinara's comment warns against); uniform-lenient-everywhere loses the
  authoring feedback that makes typed args worth having. Strict-author/lenient-render gets both — the author
  is told, the turn is safe. This is the POSTURE for the whole §12A.3 typed-arg contract.

### 12A.4 WAVE M4 — the RESERVED FLAGS GRAMMAR (syntax reserved before it's needed)

**The win (ruling #4):** parse-and-CARRY execution-modifier flag symbols between the braces and the
identifier (ST's set: `! ? ~ > / #`). Implement only closing-block + preserve-whitespace INITIALLY (ST did
the same); the point is the SYNTAX is RESERVED before it's needed — retrofitting a grammar later breaks
stored content, and post-launch that's permanent (the do-it-right-once amendment makes this wave
load-bearing).

**Design (the final flag grammar — locked now):**
- Flags sit BETWEEN `{{` and the identifier: `{{<flags><name>::args}}`. The parser's `readTag`
  (`parser.ts:150-158`) already peeks one char for `#`/`/`; generalize to consume a flag RUN (each char in
  the reserved set) before the `MACRO_IDENT` match, parsing them into a `flags` object on the node.
- **The reserved set + initial semantics** (ST's symbols adopted, positions FINAL):
  - `/` = CLOSING_BLOCK (the `{{/name}}` scoped-block close, §12A.1) — IMPLEMENTED.
  - `#` = PRESERVE_WHITESPACE (skip the body trim/dedent, §12A.1) — IMPLEMENTED.
  - `!` = IMMEDIATE, `?` = DELAYED (eager/lazy override on the arg-resolution contract, §12A.2) — RESERVED
    (parse + carry; the default is the registry's `delayArgResolution`, the flag overrides per-call).
  - `~` = REEVALUATE (re-run the macro's output through the parser once) — RESERVED.
  - `>` = FILTER/PIPE (`{{>name::args}}` feeds output through a pipe chain — the `>|` filter form) —
    RESERVED. *The coordinator flags this as the one we'll most likely want* (output filters); reserving
    `>` now means the pipe grammar retrofits additively, never a breaking parse change.
- **THE GRAMMAR COLLISION RESOLVED (the do-it-right-once call, §12A.stored-content):** because `#` becomes
  PRESERVE_WHITESPACE and `/` becomes CLOSING_BLOCK as FLAGS, our OLD `{{#name}}…{{/name}}` block-open/close
  syntax is REPLACED by the universal `{{name::args}}…{{/name}}` form. `{{/name}}` reads as the `/`
  closing-block flag on a name-matching tag (coherent). The owner's seeds migrate via a one-time
  find-replace (noted in the wave plan). This is the permanent grammar; it is locked here.
- **Ours-invariant preserved:** an UNRECOGNIZED flag (a reserved-but-unimplemented symbol) is parsed +
  carried but its semantics no-op until implemented (degrade-don't-throw — an author writing `{{~name}}`
  before REEVALUATE ships gets the un-reevaluated render, not a parse error). The `raw` re-emit carries the
  flags verbatim for an unknown-macro passthrough.

### 12A.5 WAVE M5 — USER-DEFINED MACROS (the authoring surface — the mission's payoff)

**The win (ruling #5):** a registration surface for preset/game-authored TEMPLATE macros with args (ST's
dynamic-macro three-format + source-attribution model is the reference). **This is the "so I can build on
top of it" payoff** — the whole program exists to reach this wave.

**Design (ours-invariants make this SAFER than ST's):**
- **Definitions live in preset/game CONFIG** (not global runtime state): a preset's `userMacros:
  Record<name, {template, args?}>` (+ a game's `config.features`-adjacent slot for game-authored macros).
  A user macro is a NAMED template string (the guided-action template idiom, `kit/guided`) resolved through
  the SAME engine — `{{myMacro::x}}` expands its template with the args bound, through `processMacros`.
- **SWIPE/VARIANT-SAFE BY CONSTRUCTION** (our advantage over ST): because a user macro is a TEMPLATE
  resolved through our engine, its var reads/writes ride the variant-scoped op-log + freeze-at-commit
  automatically — a user macro that does `{{setvar}}` is swipe-safe with zero extra work (ST has no
  variant-scoping, so their dynamic macros can't offer this).
- **BUDGET-BOUNDED RECURSION** (our advantage): a user macro calling another (or itself) recurses through
  `ctx.evaluateString`, which threads the `MacroBudget` (depth + output caps, `types.ts` `MacroBudget`) —
  so a `{{a}}` that expands to `{{a}}` trips the depth cap and degrades, never DoS's the renderer. ST bounds
  this ad-hoc; ours is the existing structural guard.
- **Source attribution:** each user macro carries its source (`preset:<id>` / `game:<chatId>`) so a
  diagnostic names WHERE a macro came from (ST's model adopted) — and the DX metadata (§12A.3) is
  auto-derived from the template's arg placeholders.
- **Ours-invariant preserved:** user-macro NAMES can't shadow a built-in (a collision is a boot/config
  error, the registry's boot-fatal-collision posture); the neutralize-macros defense (`kit/guided`
  `neutralizeMacros`) applies to any untrusted arg spliced into a user template (a user macro can't be a
  macro-injection vector).

**D3 (v2.1 fold) — the TYPED CHOICE-BLOCK INPUT VOCABULARY (the biggest §12A enrichment).** A user macro's
args are not only free-text — a preset/game author defines a macro input as a TYPED, user-facing control
(marinara's "Preset Variables", `preset-variables.md`). The input vocabulary (steal the KINDS, skip the
presentation-style zoo):
- **single-select** — a fixed option list, the user picks one (radio/dropdown at the surface — the surface
  style is UI chrome, not engine; we ship the KIND, the client renders it).
- **boolean-toggle** — a one-option input becomes on/off.
- **multi-select + configurable JOIN SEPARATOR** — the user picks several; the macro resolves to the picks
  joined by the author's separator.
- **RANDOM-PICK-FROM-SELECTED-POOL** — the user pre-selects a POOL; each generation draws ONE at random.
  *This is a genuine variety mechanic we lack* — and it's SWIPE-SAFE + DETERMINISTIC in ours by
  construction: the draw rides `ctx.random` (freeze-at-commit, §12A.2), so a swipe/replay re-draws the same
  pick, and the op-log records it (marinara's is per-generation-fresh with no replay). The random-pick is
  the standout D3 steal.

**Home: the FOREIGN-INPUTS seam** (`[[foreign-inputs-seam-for-turn-settings]]` — per-user turn knobs ride
`ResolveForeignInputsOp`). A typed macro input is exactly a per-user turn knob: the user's picks resolve on
the FOREIGN-inputs channel, so a multi-human room's members each get their own picks (the seam is already
per-user), and the picks freeze at commit like every other turn input. *WHY the FOREIGN-inputs seam, not
config:* the DEFINITION (the input's type + options) lives in preset/game config (the user-macro home,
above); the user's PICK is per-turn per-user runtime state — that is the FOREIGN-inputs channel's exact job.
*Skipped:* the presentation-style zoo (Auto/Radios/Checkboxes/Dropdown/Listbox — UI chrome; the KIND
determines the control, the client owns the rendering). **Cover-summary item (owner eyeball): §13 #24.**

### 12A.6 SKIP (argued) — the variable shorthand (`./$` prefixes)

Ruling #6: SKIP ST's `.`/`$` variable shorthand (`.var`/`$var` as terse getvar/getglobalvar). *Argued
agreement:* CEL already covers the CAPABILITY — `{{expr::var}}` / `{{expr::global.var}}` read vars in a
real expression grammar; a second terse syntax is pure surface area (two ways to read a var = an authoring
footgun + a parser special-case) for zero capability CEL doesn't already give. *If the owner disagrees:* the
counter-argument is ergonomics (`.hp` is terser than `{{expr::hp}}` in prose) — but the `{{getvar::hp}}` /
the argument-less `{{hp}}` env-catch-all (`evaluator.ts:77`) already cover the terse read, so the shorthand
adds a THIRD form. Recommendation: SKIP; the env-catch-all IS the terse read.

### 12A.tests EXHAUSTIVE testing — a LANGUAGE KERNEL, the repo's posture applied (owner amendment)

> **Owner amendment (2026-07-27):** *"tested" = the repo's exhaustive posture applied to a language kernel*
> (`[[exhaustive-testing-posture]]`). ST's e2e suite (`tests/frontend/Macro*.e2e.js`) is a coverage-shape
> reference, not a ceiling.

The macro engine is a LANGUAGE KERNEL — its test bar is a grammar corpus, not example-based spot checks:
- **Grammar corpus suite:** every construct × every nesting depth × malformed inputs × escaping edges —
  each flag, the universal block on every macro class, content-as-last-arg with/without the `#` preserve
  flag, `::`/`:`/whitespace arg forms, the literal-brace escape at every position, unclosed
  block/macro/comment rescue, a flag on an unknown macro (carried + degraded). A shared CORPUS kit (one
  table of `{input, expectedAST, expectedRender}` triples) drives it — new construct = one row (the shared-
  kit-over-per-spec-dodge posture).
- **Golden round-trip pins:** `input → AST → evaluation` STABLE across refactors — the AST shape + the
  rendered output are golden'd, so a parser refactor that changes a byte fails loudly (the do-it-right-once
  grammar is pinned the day it lands).
- **Determinism pins (THE property that must never regress):** seeded PRNG + freeze-at-commit THROUGH
  nested lazy resolution — eager vs lazy resolution of the same template+seed = byte-identical output AND
  identical op-log; a `{{pick}}` nested inside a lazy body draws in document order; a swipe replay
  re-produces the exact sequence. This is §12A.2's non-negotiable, pinned as a property test.
- **Budget/recursion bombs:** `{{a}}`→`{{a}}` (depth cap), a body that expands past the output cap, a
  user macro recursing on itself — each trips the `MacroBudget` and degrades, never hangs/crashes.
- **Server/client shared-atom parity:** the SAME corpus run through `resolveRowMacros` (client) + the
  server assemble path = byte-identical (the one-atom invariant, proven not asserted).
- **Stored-content migration proof:** the one-time `{{#if}}`→universal-form migration script has a
  before/after golden (the owner's seeds parse identically post-migration).

### 12A.seq SEQUENCING — the grammar wave lands EARLY (the sharpened question, argued)

> **The coordinator's sharpened question:** should the grammar wave land EARLIER than post-P6, since
> grammar finality matters MOST pre-launch (the parity-plus features authoring new teaching injections /
> fences might as well be born on the final grammar)?

**Argued answer: YES — WAVE M1+M4 (the GRAMMAR: universal blocks + the reserved flags) lands FIRST, before
the parity-plus P-waves, not after P6.** *WHY:*
- **The do-it-right-once amendment makes grammar finality the highest-priority pre-launch invariant.** Once
  content is authored on a grammar, the grammar's shape flips permanent. The parity-plus program AUTHORS a
  lot of new content on the macro/injection surface — the `RPG_*_TEACH` teaching injections (§3.3), the
  `:::card`/`:::choices` fences (§3.2), the plot-steer templates (§6.2), the reminder license (§4.7). If
  the grammar changes AFTER those are written, they all re-author. Born on the FINAL grammar, they never do.
- **The macro-feed wave (P6, §12) should also come AFTER the grammar** — a preset placing `{{rpgSceneState}}`
  or `{{expr::rpg.…}}` wants the final grammar (bodies, flags) available.
- **BUT the grammar wave (M1+M4) is a KIT change with ZERO rpg dependency** — it can land in PARALLEL with
  P0–P5 (it touches `kit/macro`, not `domain/rpg`). So it doesn't BLOCK the parity-plus waves; it lands
  early + independently, and the parity-plus content authors on it.

**Revised wave order (the macro parity interleaved with the parity-plus P-waves):**

| Wave | Contents | Depends on | Parallel-safe with |
|---|---|---|---|
| **MG (macro grammar) — M1 + M4** | universal scoped blocks + the reserved flags grammar (the FINAL grammar) + the `{{#if}}`→universal migration. KIT-only (`kit/macro`), zero rpg dep. | nothing | P0–P5 (different package) |
| **P0–P5** | the parity-plus features (§11) — authored ON the MG grammar once it lands | MG for the content waves (P3/P4/P5 teaching + fences) | MG |
| **ME (macro enforcement) — M2 + M3** | the lazy contract + determinism-through-nesting + typed-arg runtime enforcement. KIT-only. | MG | P0–P6 |
| **P6 (macro feed, §12)** | the gather populates `rpgMacros`/`rpg` CEL binding — on the final grammar | MG + the rpg planes (P0–P5) | ME |
| **MU (user macros) — M5** | preset/game-authored template macros — the authoring payoff | MG + ME (needs the final grammar + typed args) | — |

**The rule:** MG (the grammar) lands FIRST + EARLY (parallel with P0), because grammar finality is the
top pre-launch invariant; enforcement (ME) + user macros (MU) follow once the grammar is locked; the
parity-plus content is BORN on the final grammar. Each macro wave is corpus-tested (§12A.tests) — a language
kernel gets language-kernel testing.

---

## 13. Cover summary — the load-bearing decisions the owner should eyeball before build

1. **Relationship vocab = CLOSED ENUM `[lover, friend, ally, neutral, enemy] + custom` escape** (§2.1).
   Not free text (marinara's floor — unbadgeable), not a bare closed enum (foreclosed). The enum makes
   writes vocabulary-exact at the token level (the "better"); `custom` keeps any relationship reachable.
   **Eyeball: are these the five + `custom` you want? Is the warmth ordering right?**
2. **Level = HAND-ONLY, not model-writable** (§2.6). Agreeing with marinara's restraint deliberately —
   no beat honestly produces "level", and a model bumping it is the "model set my STR to 3" footgun.
   **Eyeball: confirm hand-only is right (the directive invited "maybe right" — I say yes).**
3. **The hidden-channel machinery = a CONTENT-CLASS VISIBILITY REGISTRY** (§3), two planes
   (reading-surface {show|hide} × wire {full|stub|drop}), an OPEN registry — one row per class.
   `<lie>`/`<ofilter>` = {hide, full}; `html-card` = {show, stub}; CYOA `choices` = {show, full}; prose =
   {show, full}. Your card-hider addendum generalized the whole design into this — it is the spec's core.
   **Eyeball: the registry is the right frame?**
4. **Tag grammar = XML self-closing for hidden tags (`<lie …/>`), `:::fence` for cards/choices** (§3.2).
   Hidden tags keep marinara's attr shape (attributes are right for keyed hidden fields the reveal
   surface displays); cards/choices use a directive fence (artifact-native, multi-line HTML can't be an
   attr). **Eyeball: `:::card` / `:::choices` fence syntax OK?**
5. **Card wire stub = `[card: title]` deterministic; keep-last-X is a KNOB, default 0 = immediate collapse
   (M2)** (§3.5). v1 argued immediate-total; you ruled it a shipped knob — default 0 IS that argued posture,
   X=1 keeps the newest card full for continuity. The `title` in the fence makes the stub honest. **Eyeball:
   default X=0 (immediate collapse) with the knob available — agreed?**
6. **Immersive HTML = tierB FREEFORM + `allow-scripts` (null-origin, no exfil) by DEFAULT** (§4.2). The
   sandbox is the wall, not content policing — your steer. Scripts on (interactive cards); NEVER paired
   with `allow-same-origin`. This is the one boundary the program changes → security-executor confirms it
   at build. **Eyeball: scripts-allowed sandbox is the posture you want? (I believe in it; it's flagged
   for the security pass, not pre-nerfed.)**
7. **Hidden-content visibility rule = model always, host via the eye (server-gated read), members NEVER
   (server-stripped from their payload)** (§3.6). The reveal is a host-only surface (marinara has none —
   the "beyond her" is the eye + the standing-lie inventory). The server-strip is load-bearing: a
   client-only hide would leak the truth in a member's payload. **Eyeball: host-only reveal + members
   never — right for multi-human rooms?**
8. **Feature defaults** (§9): relationships ON, plotProgression ON, immersiveHtml ON (teaching); level /
   deception / omniscience / cyoa OFF (opt-in play-styles). **Eyeball: these default postures.**
9. **CYOA + plot = clickable structural affordances + state-aware steering, RE-HOMED ON THE WAND (M5)**
   (§5, §6) — the "better" over marinara's dead prose / context-blind twist. The plot steers become the
   composer-wand's "Plot" submenu + a CYOA "Offer choices" one-shot, riding the existing `use-guided-actions`
   fire path (NOT a bespoke button row — the wand is already THE guided-action home,
   `[[no-separate-reduced-modes]]`). **Eyeball: plot/CYOA on the wand (not a separate takeover row) — agreed?**
10. **The DELTA BLOCK closes a real gap** (§2.7 — coordinator-identified): the license says "let the
    change land in the fiction" but the reminder carried only absolutes and the state round is ephemeral —
    the model couldn't know WHAT changed. Fix: a deterministic prev→current snapshot diff on the selected
    lineage, rendered compact before the license, ALWAYS ON (no knob — it is the input the license
    assumes). Per-plane registered renderers; the relationship diff line is feature 1's steering loop.
    Swipe-consistent for free. **Eyeball: always-on (no knob) + omit-on-no-change + placed before the
    license — agreed? Build wave P0, after the W4 commit.**
11. **Everything is built EXTENSIBLE (owner emphasis, §3.8 + §8.5 graft maps):** the visibility matrix is
    an OPEN REGISTRY (new content class = a row); hidden tags are a `HIDDEN_TAGS` registry (a third
    channel = a row, not a build); the choices grammar is REUSABLE (any clickable-affordance feature
    registers a fence name); the card fence is version-tolerant (v2 attrs don't break v1 cards); the plot
    steers and delta renderers are per-entry registered; relationship extends to per-game vocab +
    character↔character without migration. Every doorway is named in a D86-style graft map. **Eyeball:
    the extensibility posture (registries + named additive doorways).**

**The v2 additions (the ratification rulings + the three integration areas) — eyeball these too:**

12. **Custom tracked cast-fields (C) = FIRST-CLASS, riding with relationship** (§2.8) — host-defined field
    schemas (`{key, label, kind: text|meter, max?, hint?}`), model-written vocabulary-exact (enum-constrained
    keys), panel meters, delta-diffed. Supersedes the opaque `customFields` record. **Eyeball: the field
    schema shape (text/meter) + that they ride P1 with relationship.**
13. **Macros × rpg (A) = wiring an already-built seam** (§12) — the gather populates `rpgSceneState`/`rpgCast`
    (+ relationship/quests/delta) into the built `rpgMacros` map, and an `rpg` CEL object into `celBindings`
    (`{{expr::rpg.cast.exists(c, c.relationship == "enemy")}}`). Volatile-macro honesty (the cache-buster scan
    flags them). Lands last (P6, argued §11). **Eyeball: the macro/CEL surface + P6 placement.**
14. **The five MODS (M1–M5):** M1 custom-relationship hints (a steering gloss per custom kind); M2 keep-last-X
    knob (item 5); M3 interactive-HTML sub-toggle (governs the ASK, not the render); M4 host-of-room reveal
    toggle (offer the eye at all); M5 wand re-homing (item 9). **Eyeball: the five mods.**
15. **Options-first surface (M6)** (§9) — the feature choices are create-time OPTIONS the host picks (a
    visible panel), not scalars buried in config; the advanced editor holds the sub-knobs. **Eyeball: the
    options-first framing.**
16. **The reliable BLOCKER fix + the strict-schema AUTHORING LAW** (§10.1, W4 fix stint) — reliable was dying
    on the 8B dropping the nested-required `journal[].title` (xgrammar doesn't enforce nested required); fixed
    by optional+derive (round-5 live-proven, the D79-heal pattern's first instance). Going forward, EVERY new
    schema is authored strict-style (required + nullable, never optional-by-omission) so the omission class is
    never born again. **Eyeball: the authoring law as a standing rule.**

**vLLM-intel doorways (owner-supplied docs, folded — doorways not waves):** `structural_tag` emission
enforcement (#V8, vLLM-only); strict-tools on the `auto` path (#R7, the audit is its opener); OR
reasoning-echo for interleaved-thinking (#V9). The thinking-checkpoint swap playbook + tool-parser landmine
are a comment in `build-argv.ts` (landed). The attribution-header prefix-cache risk is pinned OFF (§10.1,
landed). Interleaved thinking is a capability-doctrine cell (the structural cure for 8B under-decomposition).

**Deferred doorways (recorded, named in the graft maps §3.8/§8.5, not built):** per-pair relationship
matrix (#R2); per-game relationship vocab (#R1); per-player `<ofilter>` perception via `who` (#V7); a
third hidden channel (#V2); new directive fences (#V3); richer cast-fields (#R6); `structural_tag` emission
(#V8); strict-tools audit (#R7); OR reasoning-echo (#V9); lie-resolution "mark exposed" affordance; card
postMessage self-sizing; auto-level-on-milestone (#R3); genre/faction-aware plot steers (#R4/#P1); new delta
planes (#D1); the `rpgExtractionSchema` required-nullable migration (§10.1). Each is additive — none
re-spells anything shipped. **(keep-last-X is now SHIPPED as M2, not deferred.)**

**The MACRO ENGINE PARITY workstream (§12A) — eyeball these load-bearing calls:**

17. **Parser strategy = HAND-ROLLED extension, NOT chevrotain** (§12A.parser) — our grammar is a small
    `{{…}}` template language; the parity constructs are linear extensions of the existing depth-aware
    scanner. Importing chevrotain (~150KB) onto the hot render path for zero capability the hand-roll can't
    reach violates the kit-dependency-lean constraint. **Eyeball: grow `kit/macro` in place — agreed?**
18. **The GRAMMAR gets its FINAL shape NOW (do-it-right-once) + one migration** (§12A.stored-content /
    §12A.4) — stored-content compat is free-when-cheap (your amendment), so the flags/block collision is
    resolved the RIGHT way: `#`=preserve-whitespace + `/`=closing-block become FLAGS, and our old
    `{{#name}}…{{/name}}` block syntax is REPLACED by the universal `{{name::args}}content{{/name}}`. Your
    seeds migrate via a one-time find-replace. **Eyeball: the final flag set `! ? ~ > / #` (`>` reserved for
    output pipes) + replacing `{{#…}}` blocks — this is permanent post-launch.**
19. **Our advantages are NON-NEGOTIABLE through the upgrade** (§12A.0) — variant-scoped swipe-safe vars,
    freeze-at-commit, CEL, the one row atom, budgets, volatility/cache honesty. The determinism-through-
    nesting property (eager vs lazy resolution = byte-identical output+op-log, §12A.2) is the one that must
    NEVER regress — pinned as a property test. **Eyeball: confirm these stay inviolate.**
20. **User-defined macros (§12A.5) are SAFER in ours than ST's** — definitions live in preset/game config,
    swipe/variant-safe by construction (they ride the op-log), budget-bounded recursion (the `MacroBudget`
    guard), source-attributed. This is the "so I can build on top of it" payoff. **Eyeball: user macros in
    preset/game config (not global runtime).**
21. **SEQUENCING — the GRAMMAR wave (MG) lands EARLY, parallel with P0** (§12A.seq) — grammar finality is
    the top pre-launch invariant (post-launch it flips permanent), and the parity-plus content (teaching
    injections, fences, plot templates) should be BORN on the final grammar, not re-authored after. MG is
    kit-only (zero rpg dep) so it doesn't block the P-waves. Enforcement (ME) + user macros (MU) follow.
    **Eyeball: grammar-first sequencing (MG parallel with P0, not post-P6).**
22. **SKIP the `./$` variable shorthand (§12A.6)** — CEL + the argument-less env-catch-all already cover
    the terse var read; a third syntax is authoring surface area for zero new capability. **Eyeball: skip
    it? (I recommend skip; argue if you want the shorthand.)**
23. **Every macro wave is CORPUS-tested as a language kernel (§12A.tests)** — a grammar corpus (construct ×
    nesting × malformed × escaping), golden round-trip pins, the determinism property test, budget/recursion
    bombs, server/client shared-atom byte-parity, and the migration golden. Per your "do it right and
    tested." **Eyeball: language-kernel test bar.**

**The v2.1 marinara-audit fold — the two owner-eyeball-worthy adopts:**

24. **Typed CHOICE-BLOCK input vocabulary for user macros (D3, §12A.5)** — user-authored macros get typed
    INPUTS, not only free text: single-select, boolean-toggle, multi-select+separator, and the standout
    RANDOM-PICK-FROM-SELECTED-POOL (a variety mechanic we lack — the user pre-selects a pool, each generation
    draws one; swipe-safe + deterministic in ours because the draw rides freeze-at-commit). Homed on the
    FOREIGN-inputs seam (per-user, per-turn). **Eyeball: the input vocabulary + the random-pick mechanic —
    this is the biggest §12A enrichment.**
25. **The output-parser ROBUSTNESS CONTRACT + the convergence with our visibility matrix (D1, §3.2.1)** —
    marinara's `[tag: attr]` GM-output parser is the design cousin of our fences; we STEAL its robustness
    (a quote/escape/JSON-aware balanced walker that survives JSON-in-attributes + stream-truncation; an
    allowlist-strip so a hallucinated fence/tag drops silently instead of leaking into prose), keep OUR
    syntax. **The notable finding: marinara's "three retention variants" ARE our {reading-surface × wire}
    visibility matrix, arrived at independently** — two teams reached the same two-plane model, which
    validates the matrix. Hardens the parity-plus fences AND pre-designs full-mode's encounter/skill-check
    tags (graft doorway #V10). **Eyeball: the convergence confirmation + the robustness contract on the
    fences.**
