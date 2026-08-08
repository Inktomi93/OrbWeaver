# Card-Refinery port-and-improve study (owner-ordered, 2026-08-08)

Charge: study `/home/inktomi/inktomi-stack/development/neo-tavern/references/card-refinery` (the owner's
SillyTavern extension, read in place) against orbweaver's card surface, and produce the official
port-and-improve design. Read-only recon; no code changed. Mid-run owner directive applied throughout:
**separate the ESSENTIAL feature from its ST contortion; check orb's native machinery FIRST; per-row,
state the ST shape vs the orb shape and the size delta.** KISS/YAGNI stays suspended for orb architecture
— "simpler" here means fewer bespoke mechanisms riding existing rails, never fewer capabilities.

Method receipts: whole-file reads of every load-bearing card-refinery module (list in §8); `ast-grep`
sweeps with `--inspect summary` on absence claims (`scannedFileCount=2029` on the orb `refinery` sweep);
literal `grep` as the second method on every negative; every claim carries `path:line`.

---

## 0. Prior law that governs this study (checked BEFORE treating the question as new)

The question is NOT new. The ledger and D62 already rule on most of the frame:

| Ruling | Where | What it fixes |
| - | - | - |
| **Refinery's reserved purpose** — "ITERATIVE CHARACTER REWRITING — the source concept is the owner's CardRefinery reference (the SCORE→REWRITE→ANALYZE→iterate loop with regression detection); design-first when scheduled; nothing else lands in that slot" | `docs/architecture/history/BUILD-QUEUE.md:414` | The section slot and its purpose are owner-law. This study is the "design-first" step. |
| SPEC-3 "Refinery" **STRUCK** — "refinery does not get specced" (owner 2026-07-18); section stays `content:{planned}` | `BUILD-QUEUE.md:374` | No parked spec exists; this document is the first design artifact. |
| Refinery's UI shape: LIST = "past refinery sessions per character (later)", CONTENT = "the pipeline surface (**stage stepper · assay · issues · compare** — mockup `RefineryView`)", CONTEXT collapsed (compare/guidance live in CONTENT) | `docs/architecture/history/D62-Prefold-UX-Flow-Revamp-2026-07-05.md:446`, panel defaults `:459` | The surface anatomy is already ruled. |
| Refinery compare = `CompareBlocks` + `@orb/ui/diff` | `D62 …UX-Flow-Revamp…md:537` | The compare primitives are named. |
| Refinery is the **founding member of the section PLANNED state** (D70); rail slot `authoring` group | `docs/architecture/core/client-architecture-lockdown.md:174,199-201` · `packages/client/src/features/refinery/lib/refinery-section.tsx:9-32` | Shipping the feature = replacing `content:{planned}` with the real body in the same edit. |
| Rail is EIGHT sections, `refinery` is one of them (D121 amendment of D62-P6) | `docs/architecture/core/Core-Path-Registry.md:343` | No rail work needed; the slot exists. |
| Q3 re-ruling: nothing else squats in the refinery slot | `docs/architecture/proposed/world-state-clips-trackers-spec.md:445` | Scope fence. |

**Scaffolding already on the tree for this exact feature** (evidence-laddered in §3): the
`refinery` contract slot + DB column + read projection + two client score readouts, the sealed
`@orb/ui/diff` primitive, and the `CompareBlocks` primitive with per-block accept state.

---

## 1. Card-refinery inventory (Subject A)

**What it is:** a SillyTavern extension (`manifest.json:1-13`), ~13.8k LOC TS in 98 files + 4.4k LOC
CSS in 33 files (tokei), tests ~5.2k LOC. An AI pipeline that iteratively refines character cards:
**SCORE** (LLM critiques each field) → **REWRITE** (LLM improves) → **ANALYZE** (LLM compares the rewrite
against the ORIGINAL and issues a verdict) → iterate with user guidance until ACCEPT (`README.md:12-66`).

### 1.1 Feature set (all receipts from whole-file reads)

1. **Three-stage pipeline with an anti-drift invariant.** Prompt structure per stage:
   TASK header (+ "Refinement #N") / Instructions (preset or custom) / Character Data
   (analyze: original AND rewritten side by side) / Context (score results; analyze feedback when
   refining) / User Guidance — joined with `---` (`src/domain/pipeline/prompt.ts:108-192`).
   **Analyze always compares against the ORIGINAL card** (session `originalData` snapshot), never the
   previous rewrite — "no character drift" (`README.md:68`; `prompt.ts:139-150`).
2. **Iterate loop with regression detection.** `executeQuickIterateAction` = rewrite with
   `isRefinement=true` (analyze feedback in-prompt, a separate refinement system prompt) → analyze →
   `iterationCount++` (`src/state/pipeline-actions.ts:343-467`). The analyze verdict enum is
   `ACCEPT / NEEDS_REFINEMENT / REGRESSION` with a 1-10 `soulScore`
   (`src/data/settings/defaults.ts:335-370` — the builtin analyze schema).
3. **Field-level selection** over 11 fields — description, personality, first_mes, scenario,
   mes_example, system_prompt, post_history_instructions, creator_notes, alternate_greetings (**per-index**),
   depth_prompt, character_book (**per-entry**) (`src/shared/constants.ts:59-98`;
   `src/domain/character/summary.ts:100-151`). Per-STAGE selection with a linked/unlinked toggle
   (`src/types/state.ts:24-31` `StageFieldSelection`).
4. **Structured output subsystem** (~1,100 LOC): user-authored JSON schemas per stage
   (`src/types/stage.ts:21-27` StageConfig), a validator enforcing Anthropic/OpenAI constraints
   (depth/anyOf caps/additionalProperties/regex features — `src/domain/schema/validate.ts`, 637 lines),
   an auto-fixer that rewrites unsupported constraints into descriptions (`auto-fix.ts:18-121`),
   markdown-fence-tolerant parsing (`parse.ts:24-64`), and **LLM schema generation from a natural-language
   description** (`generate.ts:45-113`).
5. **Preset registry**: 8 builtin prompt presets (score default/quick · rewrite default/conservative/
   expansive · analyze default/iteration/quick) + 3 builtin schema presets, plus user CRUD with
   subscribe events and builtin-sync-on-version-bump (`defaults.ts:55-370`;
   `src/data/settings/registry.ts:51-412`; `settings.ts:174` syncBuiltinPresets).
6. **Sessions**: per-character, multiple per character (cap 50), autosave (1s debounce), full stage-result
   history (cap 100), history navigation + restore, status active/completed/abandoned, IndexedDB via
   localforage with a versioned migration layer (`src/types/session.ts:18-39`;
   `src/data/storage/sessions.ts`; `src/state/auto-save.ts`; caps `constants.ts:134-135`).
7. **Apply/export**: per-field apply to the live card via ST's `/api/characters/edit-attribute` loop
   (`src/ui/components/apply-suggestions/apply.ts:21-56`); **client-side PNG writer** re-implementing
   ST's server codec (chara + ccv3 tEXt chunks, CRC32 — `src/domain/png-writer.ts:34-208`); JSON download
   (`apply.ts:105-147`).
8. **Compare view**: regex-parses the rewrite's markdown output back into per-field sections
   (`## Section` → field key mapping table), word-level diff highlight vs the original
   (`src/ui/components/compare-view.ts:33-122`).
9. **Token counting**: debounced + cached + batched counts per field, selection total, prompt estimate,
   context-fit warning vs model context (`src/shared/tokens.ts`; `stage-config/token-display.ts:33-208`).
10. **Generation plumbing** (`src/domain/generation.ts`, 386 lines): abort at three checkpoints; empty-response
    guard; error categorization by message-substring (401/429/5xx/timeout/network/context/model/content-filter,
    `:260-358`); **Anthropic quirk handling by mutating ST's live `chatCompletionSettings.reasoning_effort`
    and restoring it in a `finally`** (`:129-232`); assistant prefill with an Anthropic+structured-output
    incompatibility carve-out (`:150-169`); generation via current ST settings OR a Connection-Manager
    profile with status sniffed from `onlineStatus` strings (`src/shared/profiles.ts:179-327`).
11. **Macro handling**: `{{char}}` replaced with the card's name; `{{user}}` optionally replaced with the
    persona name or ZWSP-escaped along with other ST macros so ST's substitution can't fire on card text
    (`src/shared/templates.ts:186-232`; `summary.ts:156-170`).
12. **Results panel** rendering structured payloads visually — score badges/bars, verdict colors, schema-
    inferred rendering (`src/ui/formatter/json-renderer.ts`).
13. UI chrome: character search (Fuse), stage tabs, API status pill, morphdom DOM updates, render error
    boundaries, popup lifecycle, scroll/expanded-state preservation.

### 1.2 What it does well (worth carrying as DESIGN, not code)

- The **anti-drift invariant** (always analyze vs the ORIGINAL) and the **verdict enum with REGRESSION**
  — the loop's soul. Cheap to state, easy to lose.
- The **refinement context discipline**: rewrite sees score output; a refinement rewrite additionally sees
  analyze feedback and a distinct refinement system prompt (`prompt.ts:162-176`, `execution.ts:48-52`).
- **Per-field granularity** end-to-end: selection → prompt → per-field rewrite → per-field apply.
- **Guidance as a first-class loop input** ("keep her mean") threaded into every stage prompt.
- Honest UX details: pre-run token/context fit, structured score visualization, compare-before-apply.

### 1.3 Half-built / broken / contortion evidence

- Last 7 commits: 6 are DOM-state patches for the field selector (scroll preservation, checkbox
  indeterminate sync, expanded-state) — the morphdom/HTML-string component model fighting itself
  (`git log` b84a20f…77db4aa).
- `parseStructuredResponse` validates only top-level `required` keys — no real schema validation of the
  reply (`parse.ts:49-61`); a schema-shaped-but-wrong reply passes silently, and a failed parse silently
  downgrades to unstructured text (`generation.ts:207-213`).
- Deprecated fields still carried for migration (`selectedFields` — `session.ts:25-27`).
- Text-completion APIs untested (`README.md:179`); profile mode hardcodes contextSize 8192/maxOutput 4096
  (`profiles.ts:265-273`).
- Dual legacy/registry preset APIs coexist (`presets.ts:1-11` "LEGACY API").

---

## 2. Essential vs accidental (the ST-contortion shed list)

| Card-refinery subsystem | LOC (approx) | Verdict | Why / where it dies |
| - | - | - | - |
| Pipeline stage semantics, anti-drift compare, verdict enum, guidance threading | ~500 | **ESSENTIAL** | The product. Port as design. |
| Per-field selection incl. per-greeting granularity | ~400 | **ESSENTIAL** | Port (orb-shaped — §5 P3). |
| Sessions + history + iterate counters | ~900 | **ESSENTIAL** (shape only) | Becomes DB tables; IndexedDB/localforage/migrations are the contortion. |
| Score/analyze visualization, compare view | ~600 | **ESSENTIAL** (shape only) | Typed payloads kill the markdown re-parse (`compare-view.ts:33-101` dies); `CompareBlocks`+`DiffView` exist. |
| JSON-schema subsystem (validate/auto-fix/generate/parse) | ~1,100 | **ACCIDENTAL** | Existed because the extension couldn't know its payload shapes and had to police provider limits client-side. Orb: zod-typed payloads + `projectJsonSchema` + `runStructuredTurn` (D79) + provider-side enforcement (xgrammar / `json_schema`). Collapses to ~0 new lines. |
| Client-side PNG chunk writer | ~209 | **ACCIDENTAL** | Orb owns the codec server-side: `packages/kit/src/png-card-chunk` (writes chara+ccv3, reads tEXt AND zTXt) + the export door. 0 new lines. |
| Token-count debounce/cache/batch machinery | ~300 | **ACCIDENTAL** | Orb's `cardTokenSize` QuadChars estimate is sync + already a queryable denorm (`packages/db/src/schema/character.ts:81-86`). ~0 new lines. |
| Generation plumbing: error-substring categorization, `reasoning_effort` mutation hack, prefill carve-outs, profile status sniffing | ~700 | **ACCIDENTAL** | Orb providers own per-backend wire vocab + typed errors; side-gen postures + preset params govern sampling. 0 new lines. |
| Macro ZWSP escaping | ~100 | **ACCIDENTAL** (already law in orb) | `@orb/kit/guided` ZWSP-neutralizes other-author content (`greeting-studio.ts:7-9` cites it). |
| morphdom components, update-coordinator, error boundaries, popup lifecycle, scroll fixes | ~2,500+ | **ACCIDENTAL** | React + the section shell. |
| Settings manager + versioned migrations + preset CRUD registry | ~800 | **MOSTLY ACCIDENTAL** | Prose-slot overrides + typed stage-mode enums replace it (fork F4 if the owner wants preset multiplicity). |
| V1/V2 path-fallback field extraction, `ensureUnshallowed` | ~260 | **ACCIDENTAL** | Orb's serde normalizes V1/V2/V3/Pygmalion at import; the card is a flat row. |

Net: of ~13.8k extension LOC, the essential surface that needs an orb home is roughly the pipeline
semantics + sessions + selection + the UI surface. Everything else is already standing orb machinery.

---

## 3. Orb current-capability map (Subject B, evidence-laddered)

Ladder legend: declared < exported < imported < called-in-live-path < test-asserted.

### 3.1 The refinery scaffold (already on the tree, waiting)

- **Contract slot**: `refinerySignalsSchema {score, analysis}`, carried on the canonical card as
  `refinery` — "CardRefinery pipeline signals (derived, not authored)"; deliberately absent from
  create/update inputs (`packages/contracts/src/character/index.ts:63-67,142-143,152`).
- **DB column**: `characters.refinery` JSON (`packages/db/src/schema/character.ts:128-129`;
  `0000_baseline.sql:146`).
- **Read projection**: parsed defensively on every card read (`domain/character/persistence/queries.ts:29,371`);
  surfaced in the debug inspector (`foundation/observability/debug/inspect/config.ts:105,369`).
- **Writers: NONE produce a value.** `create.ts:75` sets null; `card-merge.ts:44,48` preserves-but-never-authors;
  serde `:302` null; `group-character.ts:47` null. Sweep receipt: `ast-grep -p 'refinery' -l ts`
  scannedFileCount=2029 + literal grep (127 hits, all enumerated) — **the column has zero producers.**
- **Client readouts already render it**: "Card quality" row (`character-overview-card.tsx:89-90`) and
  "Refinery score" stat in provenance (`character-provenance-section.tsx:38-42`) — both null-guarded, so
  they light up the moment a producer exists.
- **UI primitives PREBUILT**: `@orb/ui/diff` `DiffView` (chars/words/lines modes) sealed
  `PREBUILT[for:refinery/compare]` with zero consumers (`packages/ui/src/diff/diff.tsx:1-4`; consumer sweep:
  0 importers in client). `CompareBlocks` with `accepted`/`onAcceptedChange`/`acceptAllLabel` — the
  per-field accept-selection shape (`packages/ui/src/primitives/compare-blocks/compare-blocks.tsx:14-29`).
- **Section slot registered** as PLANNED (`features/refinery/lib/refinery-section.tsx:9-32`), rail group
  `authoring`, placeholder copy already says "Score → rewrite → analyze a character card without drifting
  from your original."

### 3.2 The pipeline rails (orb-native machinery card-refinery had to build itself)

- **Structured turns (D79)**: `runStructuredTurn` — fence/prose/`<think>`-tolerant balanced-brace JSON
  extraction → zod validation → ONE bounded retry with the issues appended → typed payload or typed error;
  retry observability seam (`packages/server/src/kit/structured-turn/index.ts:69-153`).
- **Wire-level schema enforcement**: `ResponseFormat {name, schema}` on `SummarizeOptions`
  (`packages/contracts/src/role-clients/index.ts:24-39,97-108`) + `projectJsonSchema(zodSchema)`; local
  backends enforce via xgrammar (memory: xgrammar-enforced-schema-is-the-populate-lever).
- **The exemplar verb**: discovery's `distill` — batch + on-demand postures, content floor, ownership belt
  BEFORE any content verdict (existence-oracle defense), bounded retry waves, workload integration, tag
  staging (`packages/server/src/domain/discovery/verbs/distill.ts` whole-file). This is the house pattern
  the refinery engine copies.
- **Side-gen sampling ladder**: `SIDE_GEN_POSTURES` already includes `distill` (0.2/512), `analyze`
  (0.3/400), `greeting_studio` (0.3/1024) — floor ← owner's preset params
  (`packages/contracts/src/preset/index.ts:111-140`; `resolveSideGenSampling`).
- **PROSE-1 user-overridable prompt slots** with versioned shipped baselines:
  `discovery.distill.system`, `discovery.ask.system`, `discovery.compare.system`,
  `preset.guided.greetingNew`, `preset.guided.greetingRewrite`, … (`packages/contracts/src/prose/prose-baseline.json`;
  resolution pattern `distill.ts:170`).
- **LLM card understanding already live**: distill produces genre/tone/setting/subGenres/3-8 tags/
  elevatorPitch/overview per card into `character_summaries` + staged tag suggestions (`distill.ts:86-95`);
  `askCard` and `compareCharactersDeep` produce grounded structured answers (`discovery/verbs/analyze.ts:40-102`).
- **LLM card REWRITE already live (single-field)**: the greeting studio — `generateGreeting` /
  `rewriteGreeting`, owner-gated (leak-free NOT_FOUND), template+steer via `resolveGuidedInstruction`,
  card-scoped macros with `{{user}}`="You" authoring stand-in, RETURNS text and never writes (client applies
  via `character.update`) (`domain/character/verbs/generate-greeting.ts:1-25`;
  `substrate/greeting-studio.ts:1-44`; tRPC `transport/trpc/routers/character.ts:133-146`).
- **Workload engine**: per-user singular|bulk jobs with locks/cancel/progress; `distill-characters` is
  already a kind; kinds are a closed exhaustive registry (`packages/contracts/src/workloads/axes.ts:12-32`;
  `entry/compose/workload-contributions.ts:46-62`).

### 3.3 The card substrate (already exceeds the extension's card handling)

- **Canonical card**: ONE fully-modeled contract, V2+V3 superset wire schema, greetings folded
  (first/alternates/groupOnly), typed V3 promotions, residual passthroughs, regex-script lift, attached-book
  refs (`packages/contracts/src/character/index.ts` whole-file).
- **Serde**: tolerant IN (V1/V2/V3/Pygmalion→canonical), strict OUT (`buildCardV3`, V2→V2/V3→V3 round-trip),
  content hash mirror; pinned by `tests/server/kit/serde/card/index.test.ts`
  (`packages/server/src/kit/serde/card/index.ts:1-28`).
- **PNG codec**: `kit/png-card-chunk` reads tEXt AND zTXt chara/ccv3, writes both chunks, strips stale ones
  (outline receipt `:46-165`) — strictly more than the extension's writer (which never read zTXt).
- **Doors**: import `/api/import` multi-file card upload → `runProfileImport`
  (`entry/http/upload.ts:156-179`); export `/api/export/character/:id?format=png|json`
  (`entry/http/export.ts:101-118`, PNG embed via `domain/export/verbs/export-character.ts` — the one
  `writeCardChunk` caller); plus the library zip + orb chat bundle.
- **History**: `character_snapshots` append-only full-card blob log + `snapshot`/`listSnapshots`/`restore`
  verbs (restore auto-snapshots first: `PRE_RESTORE_LABEL="auto: before restore"`, `verbs/restore.ts:16`),
  tRPC-wired (`routers/character.ts:103-126`), client History tab shipped
  (`features/character/components/character-history-tab.tsx:1-5`).
- **Token heft**: `cardTokenSize` (QuadChars) restamped on every content write into the queryable
  `characters.token_size` denorm; drives `largestCards`/`smallestCards` sorts
  (`db/schema/character.ts:81-86`; `substrate/card-tokens.ts:21`).
- **Trust posture**: cards are UNTRUSTED input by written law (serde header `:16-18` — SSRF note on
  V3 assets; `trustHtml` tri-state `db character.ts:60-64`).

### 3.4 What orb does NOT have (the true gaps)

Absence receipts (each: ast-grep sweep scannedFileCount=2029 + literal grep, both merged ts+tsx):

- **No score/rewrite/analyze pipeline** — no verb produces `refinery` signals (§3.1 writer sweep).
- **No refinery sessions store** — no table, no contract (grep `refinery` across `packages/db/src/schema`:
  only the `characters.refinery` column).
- **No multi-field card rewrite verb** — greeting studio is single-greeting only; `card-merge.ts` merges
  authored edits, not LLM output.
- **No card-level compare UI** — `DiffView` has zero consumers (importer sweep: none in `client/src`).
- **Refinery section body is `content:{planned}`** (`refinery-section.tsx:19-21`).

---

## 4. Gap matrix

### PORT (valuable + absent)

| # | Capability | ST shape → orb shape | Size delta |
| - | - | - | - |
| P1 | The pipeline engine: score / rewrite / analyze verbs + iterate loop + REGRESSION verdict + guidance threading + anti-drift compare-vs-original | ~1,900 LOC of extension glue (generation.ts 386 + pipeline 295 + pipeline-actions 505 + the schema subsystem's live half) → **3-4 domain verbs riding `runStructuredTurn` + `summarize` role + 4 new prose slots + 3 new side-gen postures + typed zod payloads** | ~500-700 server LOC + contracts (~150) + tests. The 1,100-LOC schema subsystem and 700-LOC generation plumbing become 0. |
| P2 | Durable refinery sessions + run history | ~900 LOC IndexedDB/migrations/autosave → **two tables (`refinery_sessions`, `refinery_runs`) + 5 CRUD verbs**; D62 already reserves the LIST pane for them | ~300-400 LOC + tests |
| P3 | Field selection (which card fields ride the pipeline, per-greeting granularity) | ~400 LOC selector state + path-fallback extraction → **one contracts enum (`REFINABLE_FIELDS`) + a selection zod shape + one pure substrate (card→prompt text)**, reusing the flat card row | ~150-250 LOC |
| P4 | Per-field APPLY of accepted rewrites | per-field HTTP loop against ST → **one call: auto-snapshot ("auto: before refinery apply") + `character.update`** via injected cross-feature ops | ~50-100 LOC |
| P5 | The Refinery section UI (stage stepper · assay · issues · compare — D62 §4.1's ruled anatomy) | ~5,000+ LOC of morphdom/HTML-string components + 4.4k CSS → React feature over the section shell; `DiffView` + `CompareBlocks` prebuilt; score/verdict readouts are tokens + existing primitives | The largest remaining chunk: ~1,500-2,500 client LOC + CTs. No new CSS (paint law). |

### IMPROVE (orb has it weaker)

| # | Capability | Today | Improvement |
| - | - | - | - |
| I1 | `refinerySignals` shape | `{score: number\|null, analysis: Record<string,unknown>\|null}` — the analysis half is opaque (`contracts/character/index.ts:63-67`) | Tighten to the typed pipeline payloads (per-field scores, verdict enum, soulScore, issues[]) so the client renders typed data, not a JSON blob. JSON column: no migration mechanics beyond the contract + parser (both belt-parsed already). |
| I2 | Score visibility in the library | Two null-guarded readouts exist; no sort | Once scores exist: optional `bestScore`/`worstScore` members of `CHARACTER_LIST_SORTS` (`contracts/character/index.ts:204`) — a coupled-sites change (cursor union + keyset query + client sort menu); defer to a follow-up row. |
| I3 | Batch scoring (orb-native win the extension never had) | Nothing | A `refine-score-sweep` workload kind: score the whole library, fill `refinery.score`, feed the dossier + sorts. Rides the distill batch pattern verbatim (waves, per-card failure containment). WORKLOAD_KINDS is a closed registry — one enum member + one contribution + registry row. |
| I4 | Pre-run token fit | `tokenSize` denorm exists; `summarizerContextTokens` exposed on RoleClients (`role-clients/index.ts:110`) | Surface "prompt ≈ N tokens vs context M" in the run panel — read-only arithmetic, no new counting machinery. |

### ALREADY-EXCEEDED (do NOT port — orb is better; say why)

| # | Card-refinery thing | Orb's superior native | 
| - | - | - |
| E1 | Client-side PNG writer (`png-writer.ts`) | `kit/png-card-chunk` + export door: server-side, reads zTXt too, strips stale chunks, round-trip test-pinned |
| E2 | IndexedDB sessions + hand-rolled migrations | SQLite tables, FK-cascade, baseline-squash schema law |
| E3 | The whole JSON-schema subsystem (validate/auto-fix/NL-generate/parse) | zod payloads + `projectJsonSchema` + `runStructuredTurn` bounded retry + provider-enforced json_schema/xgrammar. The extension's validator polices ANTHROPIC limits client-side because it had no server; orb's providers own their wire. |
| E4 | Error-substring categorization + `reasoning_effort` live-mutation hack + prefill carve-outs | Provider backends own per-backend wire vocab + typed errors (membrane typed-error boundary); sampling rides side-gen postures + preset params; no global-state mutation |
| E5 | Prompt customization via settings blobs + preset CRUD | PROSE-1 slots: versioned shipped baseline + per-user override, sha-pinned; owner-rung resolution proven in distill (`distill.ts:170`) |
| E6 | Macro ZWSP-escaping | `@orb/kit/guided` neutralization is standing law; greeting studio already resolves card-scoped macros with the "You" stand-in |
| E7 | `originalData` snapshot for drift protection | `character_snapshots` full-card log + restore + auto-pre-restore snapshot + client History tab |
| E8 | Character search/pick (Fuse over ST's array) | The characters section: server keyset lists, 9 sorts, tags, discovery facets |
| E9 | Connection-profile plumbing + status sniffing | `connection` domain `resolveRole` over the closed 8-role set (D109-4); readiness is domain truth, not string matching |

### SKIP (not worth porting — say why)

| # | Thing | Why skip |
| - | - | - |
| S1 | NL→JSON-schema generation UI | Died with E3: payload shapes are code-owned contracts. Custom RUBRIC text still lands via prose overrides + per-run guidance. (Fork F3 if the owner disagrees.) |
| S2 | Assistant prefill / disable-thinking user toggles | Backend-internal wire concerns in orb (providers/agent-sdk own them; customParameters is BYOK-only law). Not refinery settings. |
| S3 | `maxTokensOverride` setting | The posture-ladder (floor ← preset params) already governs side-gen budgets. |
| S4 | Token-count debounce/cache subsystem | Sync QuadChars estimate + denorm (E-class: already exceeded). |
| S5 | morphdom/update-coordinator/popup lifecycle/scroll-preservation fixes | React + section shell make the whole defect class unrepresentable. |
| S6 | `replaceUserMacro` setting | Orb's authoring-time stand-in (`AUTHORING_USER_NAME="You"`, `greeting-studio.ts:19`) is one ruled behavior; a toggle would reintroduce a two-mode surface (no-separate-reduced-modes posture). |
| S7 | Legacy dual preset APIs, deprecated `selectedFields` migration shims | Migration debris of the extension's own history. |

---

## 5. Orb-shaped design sketches (PORT/IMPROVE rows)

All sketches obey the cake (`kit ← contracts ← db ← server ← client`, sealed ui), one-directional flow,
one home per shape, and the D62-ruled surface anatomy. Maximal-provable per the standing rule; simpler
ARCHITECTURE per the owner's directive — every piece rides an existing rail.

### 5.1 Contracts (`packages/contracts/src/refinery/` — new namespace; ~150 LOC)

- `REFINERY_STAGES = ["score","rewrite","analyze"]` + status/verdict enums
  (`ACCEPT/NEEDS_REFINEMENT/REGRESSION` — carry the extension's enum verbatim; it is the loop's contract).
- Typed stage payloads (the I1 tightening):
  - `scorePayloadSchema`: `{fieldScores: [{field: RefinableField, score, strengths, weaknesses, suggestions}], overallScore, priorityImprovements[], summary}` — the extension's builtin score schema, zod-typed (`defaults.ts:248-291` is the source shape).
  - `rewritePayloadSchema`: `{fields: [{field: RefinableField, text}]}` — **structured rewrite output is the
    single biggest correctness upgrade over the extension**, which regex-parsed markdown back into fields
    (`compare-view.ts:33-101`); a typed payload makes apply + compare lossless by construction.
  - `analyzePayloadSchema`: `{preserved[], lost[], gained[], soulScore, soulAssessment, verdict, issues[], recommendations[]}` (`defaults.ts:328-370` source shape).
- `REFINABLE_FIELDS` derived from the canonical card's text fields (description, personality, scenario,
  exampleMessages, systemPrompt, postHistoryInstructions, creatorNotes, depthPrompt.prompt,
  greetings[i]) + a selection schema (`{fields: RefinableField[], greetingIndexes?: number[]}`).
  NOTE the model difference from ST: orb greetings are ONE array (first/alternates/groupOnly folded), and
  lorebooks are ATTACHED refs (PD-144), not embedded — see fork F5.
- Tighten `refinerySignalsSchema.analysis` to the typed analyze payload (nullable), keeping `score`.
- Session/run view types (below).

### 5.2 DB (`packages/db/src/schema/refinery.ts` — new file; squash into `0000_baseline.sql` per law)

- `refinery_sessions`: id (TypeID `refinery_session_`), characterId FK cascade, ownerId FK cascade (D23
  single-owner), name nullable, `originalCard` JSON (the anti-drift anchor — full `CharacterCard` blob,
  snapshotted at session start, same shape as `character_snapshots.content`), selection JSON, guidance
  text, iterationCount, status enum, createdAt/updatedAt. Indexes: characterId, ownerId.
- `refinery_runs`: id, sessionId FK cascade, stage, iteration, `payload` JSON (the typed stage payload),
  `promptTokens`/`outputTokens` nullable (stats parity), model, createdAt. Index sessionId.
  Append-only (the extension's `history[]`); "current result per stage" = latest run per (session, stage).

### 5.3 Server (`packages/server/src/domain/refinery/` — new domain, 8-slot template; fork F1)

Verbs (each owner-gated with the leak-free NOT_FOUND belt, the generate-greeting precedent):

- `startSession` — snapshot the card into `originalCard`, default selection = populated fields.
- `runStage {sessionId, stage}` — build the stage prompt from `originalCard` + selection + prior runs
  (score→rewrite context; analyze compares latest rewrite vs `originalCard`; refinement rewrite appends the
  latest analyze feedback) → ONE `summarize` call with `ResponseFormat` → `runStructuredTurn` → append a
  run row. On an analyze run, also stamp `characters.refinery = {score: overallScore, analysis}` via an
  injected character op (cross-feature op typed in `contract/`, wired at `entry/compose` — the
  `attachCardTagByName` precedent).
- `iterate {sessionId, guidance?}` — refinement-rewrite → analyze, `iterationCount++` (the quick-iterate loop).
- `applyFields {sessionId, fields[]}` — injected ops: `character.snapshot("auto: before refinery apply")`
  then `character.update` with the accepted field texts. Mirrors `restore.ts`'s reversibility law.
- `listSessions/getSession/deleteSession/renameSession`.
- Substrate: `refine-prompt.ts` (pure: card+selection+runs → the three stage prompts; the §1.2 prompt
  discipline carried as design), `payloads.ts` (the zod schemas' one home is contracts; this holds the
  ResponseFormats via `projectJsonSchema`).
- Prose slots: `refinery.score.system`, `refinery.rewrite.system`, `refinery.refine.system`,
  `refinery.analyze.system` — shipped baselines seeded from the extension's builtin prompts
  (`defaults.ts:35-232` is the corpus; the "soul check" language is good and battle-tested).
- Side-gen postures: `refine_score` (0.2, ~768), `refine_rewrite` (0.7, ~2048 — creative), `refine_analyze`
  (0.3, ~512) — floor ← owner preset params via `resolveSideGenSampling`, the distill rung.
- Workload (I3): `refine-score-sweep` kind — batch score-only over the library, wave-bounded, per-card
  failure containment, fills `refinery.score` (the distill batch arm copied).
- Transport: `transport/trpc/routers/refinery.ts`, mounted like `character.ts`.

### 5.4 Client (`packages/client/src/features/refinery/` — replace `content:{planned}` in the same edit)

D62 §2b.1's ruled anatomy (`:446,459`):

- LIST (default collapsed): past sessions per character (name · character · verdict badge · updatedAt).
- CONTENT: pick-a-character teaching state → the pipeline surface — **stage stepper** (score/rewrite/analyze
  with status), **assay** (typed score readout: per-field bars + overall — the extension's json-renderer
  becomes typed components), **issues** (analyze issues/recommendations), **compare**
  (`CompareBlocks` blocks per field + `DiffView` word mode + accept set → `applyFields`), guidance input,
  field-selection panel with token subtotals (`tokenSize` arithmetic), run/iterate/abort controls.
- CONTEXT: collapsed (per D62); the section's `context.empty` copy already promises "the scoring and
  rewrite readout" (`refinery-section.tsx:25-31`).
- Wire into `SECTION_IDS`' existing member — the registry work is already done; G1's walls force the
  planned-marker deletion to ship with the real body.

### 5.5 Rough size roll-up

contracts ~150 · db ~120 · domain (verbs+substrate+prose+postures+workload) ~600-800 · transport ~80 ·
client ~1,500-2,500 · tests per Spine-Testing (every verb + contract + payload round-trip + CTs) ~1,000+.
Total new: **~3.5-5k LOC** replacing an 18k-LOC extension (13.8k TS + 4.4k CSS), with the schema/PNG/token/
generation/persistence subsystems contributed by standing orb machinery at zero new lines.

---

## 6. Sequencing + owner forks

Recommended order (each stage independently green):

1. **R0 — contracts + db** (S): refinery namespace, typed payloads, I1 signal tightening, two tables
   (baseline squash). No behavior.
2. **R1 — domain/refinery core** (L): sessions + `runStage`/`iterate` + prose slots + postures + the
   character injected ops + `applyFields`. Server-complete with int tests; signals start flowing to the
   two already-shipped client readouts.
3. **R2 — transport + client mutations** (S-M).
4. **R3 — the Refinery surface** (L-XL): the D62 anatomy; delete the planned marker; side-eye pass after.
5. **R4 — the sweep + library integration** (M): `refine-score-sweep` workload + I2 sorts + dossier hookup.

**Owner-decision forks** (each with a recommendation):

- **F1 · Domain home** — REC: new `domain/refinery` (8-slot). It owns tables + a workload contribution and
  is a rail-level surface; the alternative (a `character` subsystem, the `chat/memory` pattern) saves the
  new-domain coupled sites (~6, per memory) but buries a section-sized engine inside character. Either way
  character stays the only WRITER of `characters.*` (injected ops).
- **F2 · Which model runs the pipeline** — REC: the `summarize` role via `RoleClients` (the distill/analyze/
  greeting rung) for v1, with the honest caveat that rewrite QUALITY wants the user's smart chat model
  (the extension ran on the user's active API). If that proves weak, the orb-shaped fix is a per-run
  connection/preset pick or a new `refine` member of `PROVIDER_ROLES` — a closed-set coupled change
  (D109-4), not a v1 requirement. Do NOT sniff "current settings" — that concept doesn't exist in orb.
- **F3 · Payload shapes** — REC: fixed typed contracts (S1). User customization = prose-slot overrides +
  per-run guidance. ST-parity user-authored schemas would resurrect the whole E3 subsystem for a
  flexibility the typed UI can't render anyway.
- **F4 · Preset multiplicity** — REC: a per-stage `mode` enum (rewrite: conservative/balanced/expansive;
  score: full/quick; analyze: full/iteration/quick) mapped to shipped prompt variants — the extension's 8
  builtins ARE these modes (`defaults.ts:55-233`). A user preset-CRUD registry is a fork only if the owner
  wants named user preset libraries beyond the one prose override per slot.
- **F5 · Scope of refinable content** — REC v1: card text fields + per-greeting only. The extension also
  refined embedded lorebooks per-entry; orb's books are attached world-info rows (PD-144), so book
  refinement is a cross-domain read/write with its own ownership story — a follow-up row, not v1.
- **F6 · Auto-stamp semantics** — REC: every analyze run refreshes `characters.refinery`; `applyFields`
  always auto-snapshots first (restore.ts precedent). Persona/prose defaults stay owner-sacred — the
  shipped prose baselines are seeded from the extension's prompts but the owner signs them off.
- **F7 · Retention** — REC: no caps v1 (the extension's 50-session/100-history caps were IndexedDB hygiene);
  sessions cascade with the character.

**Security routing (mandatory):** the pipeline sends UNTRUSTED card content to an LLM and writes the
model's output back into the card on user accept. Risk class: prompt-injection steering a rewrite
(e.g. card text instructing the model to alter systemPrompt), and derived-analysis rendering. Mitigations
in-design: apply is always explicit + per-field + snapshot-first; payloads are zod-bounded; analysis
renders as typed text (never HTML); ownership belts before any content verdict. Route the prompt-assembly
and apply path through `security-executor` before R1 lands.

---

## 7. Observations (not findings; outside the charge)

- `corpus-dossier-surface.tsx:69` says "Distill it in the Refinery" — distillation lives in Corpus/
  discovery, not Refinery (the reserved-purpose ruling). One-line copy fix when the surface is next touched.
- A `packages/server/src/domain/zzw4probe/` directory appeared in one `ls` during this session and is
  untracked/absent from git; likely a sibling lane's probe debris (doctrine: probes live in the scratchpad).
  It vanished from `git status` by the time I checked — flagging for orchestrator awareness only.
- Whether per-user prose OVERRIDES ride the portability bundle is UNVERIFIED (grep of
  `contracts/portability/index.ts` for prose: 0 hits) — relevant to F4 only.

## 8. Coverage — what I read and what I did not

**Card-refinery, read IN FULL:** README, CLAUDE.md, manifest; types/{character,stage,session,preset,
settings,state}; domain/{generation, pipeline/execution, pipeline/prompt, png-writer, character/fields,
character/summary, schema/{validate,auto-fix,parse,generate}}; state/pipeline-actions; shared/{constants,
st,profiles,templates}; data/settings/{defaults,presets}; ui/components/apply-suggestions/apply.
**Outlined only (symbols, not line-by-line):** data/settings/{registry,settings}, data/storage/sessions,
shared/tokens, state/{auto-save,session-actions,popup-state}, ui/components/{compare-view,results-panel,
apply-suggestions/{dialog,helpers}, stage-config/{token-display,field-selector}}, ui/formatter/json-renderer.
**Not read:** styles/ (33 CSS files), tests/ (5.2k LOC), scripts/, webpack config, ui/{panel,popup,
error-boundary,update-coordinator,base,api-status,character-selector,session-dropdown,stage-tabs},
preset-drawer/, settings-drawer/, results-panel internals, schema/{constants,types}, shared/{debug,utils},
data/{index,storage/cache}, domain/preset-validation. Conclusions about those areas rest on their outlines
+ the callers I did read; none is load-bearing for the matrix.

**Orbweaver, read IN FULL:** contracts/character; db/schema/character; kit doctrine + constitution
(AGENTS.md); domain/character/{substrate/greeting-studio, verbs/generate-greeting}; domain/discovery/
verbs/distill; server/kit/structured-turn; entry/http/export; features/refinery/lib/refinery-section;
ui/diff/diff. **Read in part:** server/kit/serde/card (first 120 lines + all `refinery` sites),
entry/http/upload (import route), contracts/preset (posture block), contracts/role-clients (outline),
transport/trpc/routers/character (grep-verified verbs), character-history-tab (header),
compare-blocks (interface), workload axes/contributions, prose-baseline (key census), D62/BUILD-QUEUE/
lockdown/Path-Registry (targeted sections). **Not read:** domain/export/verbs/export-character internals,
domain/import internals, the chat guided-op implementations, the workload engine internals, the
characters-section client surfaces beyond the refinery-adjacent components. The tree was DIRTY during this
study (large uncommitted surface incl. `entry/http/export.ts`, serde tests); receipts reflect the working
tree as of 2026-08-07/08.
