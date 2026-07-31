# Marinara Engine — Parser & Macro Subsystem Audit

**Scope:** READ-ONLY audit of `/home/inktomi/inktomi-stack/development/neo-tavern/references/marinara-engine`,
parser + macro + template/expression subsystems. Hunting for capabilities NOT already in our engine
(`packages/kit/src/macro/` + `kit/cel`) or our proposed §12A parity workstream
(`docs/design/parity-plus-program-spec.md §12A`).

**Verdict up front:** Marinara has exactly **ONE** `{{macro}}` grammar (a SillyTavern-lineage flat/regex
engine, no CST) — our engine + §12A already **exceed it** on grammar sophistication (we have a real AST +
CEL; they have staged regex passes). The stealable ideas are NOT in the `{{...}}` engine. They live in
**four adjacent parser/interpolation systems** marinara built alongside it, plus a handful of small
production-hardening tricks. The single highest-value delta is the **`[tag: attr="value"]` GM-output
bracket-DSL** — a robust, hallucination-tolerant parser for *model output*, the design cousin of our
parity-plus fence grammar (`:::choices`/`:::card`/`<lie>`) and full-mode encounter/skill-check tags.

---

## 1. Full tree inventory (parser/macro/template-relevant surface)

Marinara is a full ST-derived monorepo (`packages/{client,server,shared}`) with Android/HomeAssistant/docker
shells that are irrelevant here. The interpolation/parser surface, enumerated to the leaf:

### The macro grammar (one engine)
| File | Lines | Role |
|---|---|---|
| `packages/shared/src/utils/macro-engine.ts` | 1853 | **The** `{{macro}}` engine — read IN FULL |
| `packages/server/src/services/prompt/macro-context.ts` | 486 | Builds `MacroContext`; idle-duration + var-snapshot helpers |
| `packages/client/src/lib/chat-macros.ts` | 254 | Client `MacroContext` builder + memoizing resolver factory |
| `packages/client/src/components/ui/MacroTextarea.tsx` | — | Autocomplete/DX affordance (macro-reference button) |
| `docs/prompts/macros.md`, `conditional-prompts.md`, `preset-variables.md` | — | Authored grammar spec |

### Adjacent interpolation / parser systems (the delta sources)
| File | Lines | Role |
|---|---|---|
| `packages/client/src/lib/game-tag-parser.ts` | 1144 | **`[tag: …]` GM-output bracket-DSL** — the big one |
| `packages/client/src/lib/party-dialogue-parser.ts` | — | `[dialogue: speaker="X"]` sub-parser |
| `packages/server/src/services/prompt-overrides/template.ts` | 51 | `${name}` engine w/ declared allowlist + validation |
| `packages/server/src/services/prompt/marker-expander.ts` | 595 | Prompt **section** assembler (markers, not macros) |
| `packages/server/src/services/prompt/format-engine.ts` | 74 | `WrapFormat` xml/markdown/none section wrapper |
| `packages/shared/src/utils/image-prompt-compiler.ts` | 40158 B | Image-prompt builder (out of scope — media, not RP text) |

### Non-parser (confirmed NOT a scripting layer)
- `packages/client/src/lib/slash-commands.ts` + `docs/chats/slash-commands.md` — a **fixed command menu**
  (`/help /continue /goto /hide /macros /remind /illustrate …`), NOT SillyTavern's Turing-complete STscript.
  No pipes, no closures, no user scripting. **No delta here** — it's a UX menu, not a parser.

---

## 2. Complete feature surface of the `{{macro}}` engine (evidence)

`resolveMacros()` (`macro-engine.ts:1627`) is a **staged pipeline of regex/`String.replace` passes** over a
mutable string — NOT a tokenize→AST→eval architecture. Order (all file:line in macro-engine.ts):

1. **Fast-path bail** (1640): if no `{{`, no `\x1e` deferred sentinel, no `\x00` trim sentinel → return unchanged.
2. **Comment strip** `{{// …}}` (1669, `MACRO_COMMENT_PATTERN` 139).
3. **Bracket group-blocks** `[ … ]` per-character repeat (`expandBracketedCharacterBlocks` 597) — a line-based
   `[`/`]` block repeated once per `characterProfiles` entry.
4. **Conditional blocks** `{{#if}}/{{else if}}/{{else}}/{{/if}}` (`resolveConditionalBlocks` 1343). Hand-written
   balanced-brace scanner (`findBalancedMacroEnd` 644, `findConditionalBranches` 1189). Operators `== = is != is
   not > < >= <= contains includes "not contains" "not includes"` (`compareConditionValues` 1035); `||`/`&&`/parens
   with `&&`-before-`||` precedence (`splitTopLevelCondition` 841, `parseConditionComparisons` 1011); equality
   shorthand `x == "A" || "B"` (1108-1117); truthy = non-empty AND not `false/0/no/off/null/undefined` (1084);
   numeric-vs-string coercion when both sides parse as numbers (1040). **Jinja-style standalone-line whitespace
   control** (`trim_blocks`/`lstrip_blocks`) baked in (1373-1420).
5. **`{{noop}}` / `{{banned "…"}}`** stripped (1697-1698).
6. **Static identity/character/persona/convo/context substitutions** (1701-1750) — plain `.replace(/gi)`.
7. **Date/time** — one shared `now`, lazily built via `Intl.DateTimeFormat`, 6 macros agree on the instant
   (`formatMacroDateTime` 1540; macros 1761-1766).
8. **Random/dice** (1769-1803): `{{random}}` 0-100; `{{random:X:Y}}`; `{{random::A::B::C}}` choice;
   **weighted** `{{random::A@2::B@0.5}}` (`pickWeightedRandomChoice` 1505, top-level `@` marker scan 1463);
   `{{roll:XdY}}` (caps `MAX_DICE_COUNT=1000`, `MAX_DICE_SIDES=1e6`). **Seeded PRNG** (`seededUnitRandom` 233,
   FNV-1a hash 224) keyed on `randomSeed:originalMacroText` → deterministic per message. *(We already have this.)*
9. **Variable ops** `setvar/getvar/addvar/incvar/decvar` (`resolveVariableOperationMacros` 1308) — left-to-right,
   mutate `ctx.variables`, **single-reply lifetime only** (docs `macros.md:185`).
10. **Case blocks** `{{uppercase}}…{{/uppercase}}` / `{{lowercase}}` (1809-1812).
11. **Newlines** `{{newline}}`/`{{\n}}` (1817).
12. **Trim markers** `{{trim}}/{{trimStart}}/{{trimEnd}}` via `\x00` sentinels applied last (1820-1831).
13. **Catch-all `{{NAME}}`** → preset variable lookup, else left literal (1835). **No escape char** (docs 205-207).
14. **`{{agent::TYPE}}`** resolved DEAD LAST (1844) so agent/model text can't smuggle macros back in.

**Guards/limits:** depth cap 16, expansion budget 2000, output clamp 200 000 (120-121); recursion via
`nestedMacroOptions` (211) sharing one budget. **Deferred-resolution machinery** — character macros
(`deferCharacterMacros: "names"|"all"`) and relocation conditionals encoded as `\x1e`-sentinel tokens for a
later known-speaker/route pass (124-138, 522-595). Metadata: `SUPPORTED_MACROS` array (288) feeds the in-app
macro reference and `/macros`.

**Architecture judgment:** every construct above is a regex pass over a string. There is **no shared tokenizer,
no AST, no typed args, no user-defined macros, no lazy contract**. Our engine's parser/AST + CEL and §12A's
universal scoped-block grammar are strictly more capable. So the `{{…}}` engine yields **no grammar deltas** —
only the small hardening tricks in §4.

---

## 3. THE DELTAS — capabilities neither our engine nor §12A covers

### D1 — `[tag: attr="value"]` GM-output bracket-DSL  ·  STEAL (concept) / ADAPT (mechanics)
**What:** A parser for **model OUTPUT** (not authored templates). The GM model emits inline command tags in its
prose; marinara extracts them into structured data and strips them from the displayed narration.
**Where:** `packages/client/src/lib/game-tag-parser.ts` (1144 lines), `parseGmTags()` :733, `stripGmTags()` :1042.

**The registry (~23 named tags, file:line):** `combat_result` (582), `music` (583), `sfx` (584), `bg` (585),
`ambient` (586), `qte` (587), `state` (588), `reputation` (589), `combat` (590), `direction` (591), `widget`
(592), `dialogue` (593), `session_end` (594), `skill_check` (595), `status` (596), `element_attack` (597),
`party_change` (598), `party_add` (599), `dice` (602), `inventory` (645), `map_update` (292), plus readables
`Note`/`Book` (1018/1023). Attributes parsed by `parseTagAttributes` (:130) — `key = "quoted" | 'quoted' | bare`.

**Why it's robust (the stealable engineering):**
- **Quote-and-escape-aware balanced-bracket walker** `stripUnknownBracketTags` (:205-256): walks char-by-char
  tracking `inString`/`escaped`/bracket-`depth`, so a tag carrying **JSON in its attributes**
  (`[combat: {"enemies":[…]}]`) is removed *whole* — the naive `/\[\w+:[^\]]*\]/` stops at the first `]` and
  leaves `}]` garbage (comment :198-201 states exactly this). Unbalanced/streaming-truncated tags are left in
  place (:249) so a half-streamed tag isn't mangled.
- **Allowlist strip of hallucinated tags:** `keep` predicate (:214) — unknown `[word:…]` the model invents get
  stripped, but `[Note:]`/`[Book:]` are retained (:1132-1139). This is the **anti-hallucination floor**: if the
  model emits `[teleport: …]` we never defined, it silently vanishes instead of leaking into narration.
- **Three strip variants w/ different retention:** `stripBalancedTag` (:263, one tag prefix), `stripGmTags`
  (:1042, all command tags), `stripGmTagsKeepReadables` (:1105, keeps Note/Book inline). Different callers
  (display vs. re-feed vs. reader UI) get the retention policy they need.
- **`{effect:text}` inline curly sub-grammar** (`GAME_NARRATION_EFFECT_TAG_RE` :1080): 12 named text-animation
  effects `{shake|shout|whisper|glow|pulse|wave|flicker|drip|bounce|tremble|glitch|expand: …}` — a *second*,
  lighter grammar for inline prose styling, distinct from the `[…]` command tags.
- **Angle-bracket HTML escaping w/ allowlist** `escapeStandaloneGameNarrationAngleLines` (:1085): a standalone
  line like `<CORE: SEALED>` is escaped to `&lt;…&gt;` (preserved as literal narration) UNLESS it's an allowed
  HTML tag `strong|em|br|span` (:1082). Prevents model-authored angle readouts from being eaten as HTML.

**Relevance to us:** This is the **exact design problem** our parity-plus program already tackles with the fence
grammar (`:::choices` / `:::card` / `<lie>`) and full-mode encounter/skill-check output tags. Marinara went with
a flatter `[tag: attr]` syntax but built **substantially more defensive output-parsing machinery** than a fence
scanner typically has. **STEAL the three ideas, not the syntax:** (a) the **quote/escape/JSON-aware balanced
walker** as the extraction primitive under our fence parser; (b) the **allowlist-strip-unknown** policy so a
hallucinated fence/tag silently drops rather than rendering; (c) the **multi-retention strip variants** (display
vs re-feed vs sidebar). **ADAPT** — keep our fence/attribute syntax and visibility registry; port the parser's
robustness contract (survive JSON-in-attributes, survive streaming-truncated tags, drop unknowns). This is worth
a design note against the parity-plus output-grammar section.

---

### D2 — `${name}` prompt-override engine: declared allowlist + write-boundary validation  ·  ADAPT (validate our args direction)
**What:** A *third* interpolation dialect (separate from `{{…}}` and `[…]`), `${charName}`-style, for
image/video prompt-override templates. **Where:** `prompt-overrides/template.ts` (51 lines), pattern
`/\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g` (:10).
**The idea:** `validateTemplate(template, declared)` (:21) runs at the **write path** and returns
`unknownVariables[]`; the editor surfaces an "Unknown variables" warning + a chip palette of the declared set
(docs `prompt-overrides.md` step 5/8). `renderTemplate` (:40) leaves undeclared `${x}` **intact** rather than
throwing — "production rendering should never crash on a stale template" (:38).
**Relevance:** Directly **validates §12A's runtime-ENFORCED typed args (strict/lenient)** and the diagnostics/
autocomplete DX. Marinara proves the pattern in the wild: *validate strictly at authoring time, degrade
gracefully at render time.* **ADAPT** — our §12A already plans enforced args + diagnostics; adopt the
**declared-allowlist-with-write-boundary-validation + render-time-lenient** split explicitly (authoring error,
runtime no-throw). Do NOT adopt the third syntax — one grammar.

---

### D3 — Structured **Preset Variables** as typed choice-blocks  ·  ADAPT (feeds §12A user-macros + FOREIGN-inputs)
**What:** `{{NAME}}` isn't only a flat variable — a preset author defines it as a **typed, user-facing input
control**: single-select (radios), **boolean-toggle** (a 1-option variable becomes on/off), **multi-select** with
a **configurable join separator**, and **random-pick** (draws one from the user's *selected pool* each
generation). **Where:** authored spec `docs/prompts/preset-variables.md` (the three kinds + separator +
random-pick); resolved via the catch-all `{{NAME}}` (macro-engine.ts:1835) after the app substitutes the picked
value. Presentation styles Auto/Radios/Checkboxes/Dropdown/Listbox; a "Configure Preset Variables" modal opens on
preset assignment.
**Relevance:** This is a **user-authored typed-input surface** — the product-facing cousin of our §12A
**user-defined macros (preset/game-config-homed, budget-bounded)** and our **FOREIGN-inputs seam** (per-user
turn knobs ride `ResolveForeignInputsOp`). Marinara's **random-pick-from-selected-pool** is a genuinely nice
variety mechanic we don't have. **ADAPT** — when §12A's user-defined macros land, give them this **typed-input
vocabulary** (single/boolean/multi+separator/random-pick) rather than only free-text values, and home the picks
on our FOREIGN-inputs channel. SKIP the presentation-style zoo (Auto/Radios/…/Listbox) — that's UI chrome, not
engine.

---

### D4 — `resolveMacrosWithVariableSnapshot`: transactional var commit/rollback  ·  ASSESS vs our op-log → likely SKIP
**What:** Wraps a resolution in a `{...macroCtx.variables}` snapshot and returns `{content, commit(), rollback()}`
(`macro-context.ts:70-90`). Caller commits on success, rolls back var mutations on failure/discard.
**Relevance:** Our **D46 variant-scoped var op-log** is strictly more powerful — it's a replayable, scoped,
per-user/per-variant journal, not a single flat snapshot with all-or-nothing rollback. Marinara's is a shallow
`{...obj}` copy (no nesting, no scoping, no replay). **SKIP** — we already have the better mechanism. Worth one
line in the report only as *confirmation our op-log design is ahead*, not behind.

---

### D5 — Var-op-aware **memoizing resolver** with permanent invalidation latch  ·  ADAPT (perf)
**What:** `createMessageMacroResolver` (`chat-macros.ts:208-234`) returns a resolver that **caches by template
string** for one display computation (regex-script replacements/trims frequently repeat the same template). The
cache is **disabled from the first variable-write onward** — a `variablesTouched` latch (:222) — because
conditionals and the `{{NAME}}` catch-all can *read* variables without matching the var-op regex, so any write
in between would make a cached repeat stale. Only templates `≤ 2048` chars are cached (:206).
**Relevance:** A clean, correct **memoization contract** for a repeated-template hot path. Our shared server/client
row-macro atom resolves the same regex-script/trim strings repeatedly during a render; this is a drop-in perf
pattern. **ADAPT** — if our row-macro resolver shows up hot, adopt the **cache-by-template +
permanent-invalidate-on-first-write latch** (the latch, not just "skip var-op templates", is the subtle correct
part — a naive "cache unless this template writes" is wrong because a *later read* can observe an *earlier*
write). Note the correctness argument in the commit if adopted.

---

### D6 — `{{idle_duration}}` context field  ·  STEAL (already on our P6 list)
**What:** Time since the last chat activity as human text (`8 minutes`, `1 hour 5 minutes`, `2 days 3 hours`).
`formatPromptIdleDuration` (:106) + `resolvePromptIdleDuration` (:130, scans message timestamps, excludes the
in-flight message). **STEAL** — cheap, useful for "the character notices you've been gone" beats. Already flagged
on our P6 list per coordinator; this confirms the exact formatting + the exclude-in-flight-message subtlety.

---

### D7 — `WrapFormat` section-wrapping policy (xml / markdown / none)  ·  ASSESS → SKIP for engine, note for assembler
**What:** A **preset-level** toggle that auto-wraps every assembled prompt section in either XML tags
(`<description>…</description>`, indented), Markdown headings (`## Description`, depth→heading-level), or raw
(`format-engine.ts:35` `wrapContent`, :60 `wrapGroup`). Section names → tags via `nameToXmlTag`; chat history gets
`<chat_history>`/`<last_message>` or `## Chat History`/`## Last Message` wrapping (`marker-expander.ts:459-479`).
**Relevance:** This is **assembly-layer**, not parser/macro — it's how sections are framed, adjacent to our
assembler/prompt-manager. It's a legit product idea (let the user pick XML vs Markdown structuring of the whole
prompt) but out of scope for the macro engine. **SKIP for the parser workstream; flag to the assembler owner** as
a possible "prompt structuring format" toggle if we don't already expose one.

---

## 4. Small production-hardening tricks worth noting (not deltas, but validated patterns)

- **Fast-path bail on no-syntax input** (macro-engine.ts:1640) — skip the whole pipeline when the string has no
  `{{`/sentinel. We likely already short-circuit, but confirm our AST path bails equally cheaply on plain text.
- **Agent/model text resolved dead-last** (:1844) so it can't inject executable macros — a **trust-boundary**
  ordering rule. Validates our "macro-neutralized guided splice" instinct; confirm model-origin text in our
  pipeline is similarly quarantined to a terminal, non-executing pass.
- **Weighted-choice top-level `@` scan** (:1463) ignores `@` inside nested `{{…}}` and only treats a trailing
  `@number` as a weight (so emails survive). Nice edge-case handling if we add weighted random.
- **`{{random::…}}` resolves macros only in the CHOSEN option** (:1783) — docs warn `{{setvar}}` inside a random
  option runs for every option (macros.md:222). A determinism gotcha to avoid in our lazy contract: side effects
  must not leak from unchosen branches. **This validates §12A's determinism-threading / lazy-contract design.**

---

## 5. §12A design validations / contradictions

| §12A design choice | Marinara evidence | Verdict |
|---|---|---|
| Runtime-ENFORCED typed args, strict/lenient | `${name}` declared-allowlist: strict at write, lenient (leave-intact) at render (template.ts:21/38) | **VALIDATES** — adopt the write-strict/render-lenient split |
| User-defined macros (preset/config-homed) | Preset Variables = typed user-authored inputs w/ random-pick pool (preset-variables.md) | **VALIDATES + enriches** — steal the typed-input vocabulary |
| Generalized lazy contract w/ determinism threading | `{{random::…}}` side-effects-in-unchosen-branch footgun (macros.md:222) is exactly what determinism threading prevents | **VALIDATES** — our threading is the fix marinara lacks |
| Reserved flags grammar (`! ? ~ > / #`), scoped-block dedent | Marinara has none of this — flat regex passes, only `{{#if}}` + Jinja-ish standalone trim | **AHEAD** — no contradiction; we're strictly more capable |
| Variant-scoped vars + D46 op-log | Marinara: flat `{...vars}` snapshot, single reply lifetime, no scoping (macro-context.ts:70) | **AHEAD** — our op-log dominates |
| CEL `{{expr}}` over structured env | Marinara: hand-rolled `==/contains/&&/||` string comparator only (macro-engine.ts:1035) | **AHEAD** — CEL is a superset |

No §12A choice is contradicted. Marinara's macro engine is a **less-capable predecessor**; its value is entirely
in the **adjacent output-parser (D1)** and the **product/perf/hardening patterns (D2/D3/D5/D6)**.

---

## 6. Recommendation summary

| # | Delta | Rec | One-line reason |
|---|---|---|---|
| D1 | `[tag: attr]` GM-output bracket-DSL (robust walker + allowlist-strip + strip-variants + `{effect}` sub-grammar) | **STEAL concept / ADAPT mechanics** | Port robustness contract into our fence/output grammar; keep our syntax |
| D2 | `${name}` declared-allowlist + write-boundary validation | **ADAPT** | Formalize §12A's strict-author/lenient-render arg contract |
| D3 | Preset Variables typed choice-blocks (bool/multi+sep/random-pick) | **ADAPT** | Give §12A user-macros a typed-input vocab on the FOREIGN-inputs seam |
| D4 | `resolveMacrosWithVariableSnapshot` commit/rollback | **SKIP** | Our D46 op-log already dominates a flat snapshot |
| D5 | Var-op-aware memoizing resolver w/ invalidation latch | **ADAPT** | Correct perf pattern for our hot row-macro resolver |
| D6 | `{{idle_duration}}` | **STEAL** | Cheap RP beat; already on P6 |
| D7 | `WrapFormat` xml/markdown/none section wrapper | **SKIP (parser) / note assembler** | Assembly-layer, not macro engine |

**Highest-value action:** write D1's robustness contract (JSON-in-attributes survival, streaming-truncation
tolerance, allowlist-drop-unknown, multi-retention strip) into the parity-plus output-grammar design note. The
rest are small, high-confidence adopts (D5, D6) or §12A enrichments (D2, D3).
