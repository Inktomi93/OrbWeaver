---
kind: reference
status: active
updated: 2026-07-09
---

# proposed/ — the in-progress board

> ONE tracker for every in-flight design effort staged here: status, canonical docs, moving parts, graft points, live pivot points. Cross-refs (NOT restated here): decisions = the D-entries in `../core/Core-Laws-and-Precedents.md` (they win on conflict) · phase/PD catalogue = `../core/Core-SillyTavern-Feature-Map.md` §2c–2e + the PD registry `../core/Core-Audits-and-Debt.md` · build cursor = `../core/Core-STATUS.md`. The 2026-07-01 adversarial review of every set (all findings APPLIED in `0d0a7fe`) is [`DESIGN-REVIEW-2026-07-01.md`](DESIGN-REVIEW-2026-07-01.md); its **§7 is the consolidated chat-side obligations sheet** — every "obligation #n" below is a row there.

**Status legend:** `built` (shipped — code is the doc) · `building` (in flight, + where) · `design-locked` (committed + review-clean, awaiting its build slot) · `decided` (closed record) · `deferred:<why>` / `blocked:<what>` (parked, trigger recorded).

**File-layout law (triage ruling 2026-07-09, CORRECTED same day — measure citations before moving
ANYTHING):** the ten `*-design/` set directories, **`ui-package-design.md` (195 code citations —
untouchable, never renumber)**, and a small tail (design-enforcement · gallery-design ·
import-st-profile-waves · client-tooling-setup · connection-capability-panel · saved-rosters-design ·
export-deferred-surfaces · ux-flow-revamp · the deferred gap docs — 1–9 citation-shaped code refs
each) are path-cited from CODE file headers/gates and are FROZEN in place. The four committed
decision DIGESTS proved zero-code-cited and were CO-LOCATED into their sets (owner call, 2026-07-09):
`tool-use-design/tool-use.md` · `automation-design/automation.md` · `databank-design/databank.md` ·
`expressions-design/expressions.md` (basenames kept — prose citing "the digest `x.md`" stays true).
`gallery.md` stays at root (its design doc is a single sibling file, not a set). Any future move:
run the citation-shaped sweep first (`grep -rnE '<name>\.md|proposed/<name>|<name> §'` over
packages/scripts/tests/config), and treat a bare-word count as noise. THIS README is the
organization; §0 below is the dispatch order.

## 0. DISPATCH ORDER — the dependency-ordered build queue (triage 2026-07-09)

> What can be dispatched, in what order, and what blocks what — so lanes never double back. Sets
> named here carry a matching `Triage 2026-07-09` banner. The three tracks are mutually
> independent; WITHIN a track, order is load-bearing. Re-verify a row's blockers against
> `Core-STATUS.md` before dispatching if this stamp is >1 week old.

**Dispatchable NOW (no unmet blockers, disjoint file sets — safe to run in parallel):**

| Lane | First chunk | Why it's unblocked |
| - | - | - |
| Chats redesign Wave 0 | `FINAL-Chat-Tab-Redesign-UX.md` (repo root) §0 Wave 0 — the FINAL-Chats §12 FIX #1–#5 exposures + `compact`/lore router rows + the `guidedSteerSchema` wire fix (the redesign doc's build order now GOVERNS the chats client program; FINAL-Chats stays the as-built baseline) | domain code verified built + dark 2026-07-09; Wave 0 blocks on nothing |
| automation A1–A3 | macro-DX · CEL+`{{expr}}` · global variables (kit-early) | zero deps — `automation-design/05` says buildable now; `global_variables` schema already landed |
| hub-browse H1 | the egress guard (`safeFetch` + `isAllowedImageBuffer` + `@orb/kit/image-sniff`) | zero deps; unblocks gallery G7 + databank DB7 + D44 fetches |
| databank DB3 spike | `infra/extraction` (the declared long pole — start it early, it parallelizes) | zero deps; DB2 schema landed |
| rpg R1-proper | the rpg contracts MODULE (views/verbs/substrate goldens) — schema/brands/stubs already landed | schema rider landed 2026-07-09; R1-proper is self-contained |
| ~~Doc-corpus amendment sweep~~ | DONE 2026-07-09 (the `domains/*.md` citation repairs, landed-row annotations, digest co-location) | — |

**Track 1 — the client Phase-6 program (sequential where marked):**

1. **Character lane Waves 1–4** (`FINAL-Character-Library-and-Editor-UX.md` §0) — IN FLIGHT.
   Wave-triggered rider: `tag-pending-review.md` (the pending-tags read, first tag surface). (The
   snapshot-history UX rider was retired — the FINAL's §7/§12 already answers it.)
2. **Chats lane** (`FINAL-Chat-Tab-Redesign-UX.md` §0 — the tournament-won redesign spec; it
   subsumes FINAL-Chats' Wave A/B/C into its Waves 2–3) — Wave 0 exposures first (above), then the
   two Wave-1 owner ratifications (§15 amendments A chat-mode + B D44 atmosphere un-deferral), then
   Wave 2 (room/list) ∥ Wave 3 (multi-human) → Wave 4 (read-state · atmosphere · trace digest, each
   severable) → Wave 5 (composing signal, optional).
3. **THE PRESETS-PLACEMENT DECISION (owner)** — presets→settings needs its ledger amendment BEFORE
   any of: the Presets rail section (ux-flow L7), the preset editor, `preset-form-mapper-elimination.md`,
   `connection-capability-panel.md`. Everything preset/connection-client is BLOCKED on this one ruling.
4. **Settings IA finish** (ux-flow J11 partials + punchlist UIP-404 row grammar + the side-eye P3s).
5. **Phase-6 stages of the grafts** (each after its server half): imagery I5 · gallery G4/G5 ·
   saved-rosters RP2 picker · expressions E5 · tool-use T7 (needs the `CHAT_SURFACE_SLOTS`/
   `CHAT_CONTEXT_SLOTS`/`TOOL_RENDERERS` registries — DESIGN-REVIEW §7 #23–25; land the registries
   with their first consumer, not speculatively).
6. J10 corpus preview — blocked on the discovery corpus waves (Track 3, per-demand).

**Track 2 — the play systems (server; order is load-bearing):**

1. **Variables substrate** (D46 Phase-5, `building` in a parked session) — BLOCKS automation A5–A7,
   rpg R2+. Resume/finish it before dispatching either.
2. **AP3 + AP4a — the agent seat wave** (needs chat obligation #18 `seatAgent`; AP4a additionally
   needs rpg R3). `buddy-observer-reaction-engine.md` lands WITH this wave (its named trigger).
3. **rpg R2 → R11** per `rpg-design/10` (R4 needs the P5 obligations — #1–2 LANDED with T1–T4).
4. **crew CW2+** (T6 structured-output lands with CW2 as first consumer; `worldInfo.upsertEntries`
   is first-builder-lands-it, shared with rpg R7). **CW4 stays gated on the MANDATORY director
   playtest (owner).**
5. **automation A4 → A5–A8** (after the substrate + chat obligations #3–6) → **plugin P1–P6**
   (P1 spike is dispatchable anytime; P4 waits on A5–A7 + the tool registry + the D50 seam).

**Track 3 — deferred/per-demand (each doc carries its own trigger; do not schedule):** the §6
client-trigger docs · the §7 deferred surfaces · tool-use T5 (rides buddy) · databank DB4–DB8 (after
DB3+chat graft ops) · expressions E3–E4 (needs chat hook ops #8) · hub H2–H7 (after H1) · discovery/
search verb waves (per-demand) · import ST-profile waves (blocked:later).

**Decision gates needing the OWNER (everything else is dispatchable without him):** presets
placement (Track 1 #3) · the crew CW4 director playtest · nothing else found in triage.

**Digest vs design set (read this before opening an effort):** five efforts have BOTH a committed decision digest (the promoted decision record expanding its D-entry) AND a full build design. The digests live INSIDE their sets (co-located 2026-07-09): `automation-design/automation.md` · `databank-design/databank.md` · `expressions-design/expressions.md` · `tool-use-design/tool-use.md`; gallery's digest `gallery.md` sits beside its single-file design `gallery-design.md` at root. **The `*-design/` set (for gallery: `gallery-design.md`) is canonical and wins on detail; the digest stays the decision record** — each digest carries a banner saying exactly this. Build from the set; cite the digest only for the committed decision's letter. When a built set retires to `../history/`, its digest rides with it.

## 1. Building NOW — the Phase-5 tail

| Effort | Decision | Status | Canonical spec | Grafts into |
| - | - | - | - | - |
| Two-plane variables per-variant delta-fold | D46 | **building** — a separate parked build session (resumes after the docs pass) | `automation-design/automation.md` §1 (Phase-5 law; the design sets consume it, never reshape it) | `domain/chat` engine + persistence; automation/plugin/rpg all stand on it |
| OpenAI-path tool recurse loop (= tool-use **T4**) | D48 · PD-54 | **LANDED 2026-07-04** — PD-54 T1–T4 cleared, Phase 5 FULLY CLOSED (`Core-STATUS.md`); remaining tool-use work is the consumer-gated T5/T6/T7 (§3 row) | `tool-use-design/03` | `domain/chat` engine; rpg R4, automation depth-guard, plugin tools now unblocked |

**Baseline-window riders (must land while the `0000_baseline` squash is open):** agent-principal AP0 ✓ landed (`users.kind`, `agent_principals`, the participant kind-CHECK swap) · crew CW1's tables ✓ landed (`crew_chats`/`crew_plots`/`crew_edit_proposals`/`crew_guides` in `db/schema/crew.ts`, `card_evolution_proposals` in `schema/character-proposals.ts`, and the `crew-*` WORKLOAD\_KINDS members in `@orb/contracts/workloads` — verified in-tree 2026-07-09) · automation's rule store ✓ landed EARLY (`automation_rules`/`automation_budgets`/`automation_fires`/`global_variables` in `db/schema/automation.ts` — a baseline rider, verified in-tree 2026-07-09 round-4) · **RP1 saved-rosters ✓ landed 2026-07-09** (`roster_presets`/`roster_preset_members` in `db/schema/roster-preset.ts`, `RosterPresetId` brand, `@orb/contracts/roster-preset` views) · **expressions E1 + E2-schema ✓ landed 2026-07-09** (`ChatBusEvent` `{type:"expression"}` member + `chat_events` CHECK regen + replay guard + bus-coverage DEFERRED entry; `"sprite"` ASSET\_KIND; `expressions-sprite-sheet` WORKLOAD\_KIND + stub runner; `@orb/contracts/expressions`; `character_sprites` in `db/schema/expressions.ts`) · **DB2-tables subset ✓ landed 2026-07-09** (`documents`/`global_documents`/`character_documents`/`chat_documents` in `db/schema/databank.ts`, `document_chunks` 5th vector table in `db/schema/embeddings.ts`, `"document"` ASSET\_KIND, `databank-ingest`/`databank-reindex` WORKLOAD\_KINDS + stub runners, the `{{databank}}` macro slot, `document`/`document_chunk` brands, `@orb/contracts/databank` origin axis) · **rpg R1-subset ✓ landed 2026-07-09** (owner-authorized option (a)): the 14 tables (`db/schema/rpg.ts`, every CHECK/XOR/RESTRICT/partial-unique DDL-verbatim), 14 TypeID brands, the MINIMAL `@orb/contracts/rpg` (enum tuples + the `$type<>` JSON-column schemas ONLY — no service/verb/bus types; conservative schemas + doc notes for the columns 03 defers to 04/07/R8), the 10 `rpg-*` WORKLOAD\_KINDS + stub runners, and a design-gap fix (`StyleProfileId` brand minted — no unbranded id strings). The rpg contracts MODULE proper (views/verbs/substrate) still trails with R1-proper.

## 2. The play systems (D58 · D59 · D60)

### rpg — `domain/rpg` (D58) — `design-locked`

- **What:** a chat becomes a table — GM as a SEAT (AI/human/hybrid), server rules engine, RPG context via GATHER, side-effects as D48 tool calls (26 tools), async GM work as WorkloadKinds, swipe-safe typed state (14 tables).
- **Docs:** [`rpg-design/`](rpg-design/README.md) — README + 12 parts (canonical; no loose digest — the marinara corpus is git history, [`rpg/`](rpg/README.md) is the tombstone).
- **Moving parts (10 §):** R1 contracts+schema+substrate goldens (L) — **the SCHEMA + brands + minimal-contracts + workload-kind subset ✓ LANDED 2026-07-09** (baseline rider; substrate goldens + the contracts module proper still trail) → R2 state/snapshots (M) → R3 lifecycle-sans-model (L) → R4 turn integration + tools (the heart, L) → R5 event mirror + dice → R6 crew wave 1 + wizard → R7 crew wave 2 → R8 encounter engine (R8b elements LAST, optional) → R9 generative → R10 scenes → R11 client (doc 11: U1 + C1–C13, incl. the committed C11 polish pass).
- **Depends on / grafts:** chat P5 tail (T4 loop + obligations #10–13: `presetOverride` consumption, `postNarratorMessage`, `getMembership`, `ChatContext.rpg` ops) · imagery (BUILT) for R9 · `worldInfo.upsertEntries` (first builder of rpg R7 / crew CW2 lands it, obligation #22) · AP3/AP4a re-keys the GM seat for agent principals (needs R3).
- **Open / pivot:** R1 tables must catch the baseline window (§1) · game chats REQUIRE tool-capable models until the Tier-3b textual-tool-call polyfill ships (backend-internal) · `rpg-director` never runs while a human holds the seat.

### chat-crew — `domain/crew` (D59) — `design-locked`

- **What:** the rpg-crew pattern minus the game: 4 WorkloadKind members (lorebook keeper · card-evolution auditor · story director · prose auditor) + persistent guides (verb-not-workload) + a bus-watching scheduler; every member thinks via the ONE sealed `agentTurn`, writes through its domain-of-affect. Echo-chamber SUBSUMED BY BUDDY.
- **Docs:** [`chat-crew-design/`](chat-crew-design/README.md) — README + 8 parts (canonical; no loose digest).
- **Moving parts (08 §):** CW1 contracts+schema+skeleton+stub runners (M) → CW2 keeper + scheduler + `runStructuredAgentTurn` (L) → CW3 card evolution → CW4 director → CW5 prose auditor → CW6 persistent guides → CW7 client (doc 07: U1–U6).
- **Depends on / grafts:** D48 structured-output axis (tool-use T6 — "lands with first consumer", CW2 is a candidate) · chat obligations #15–17, #21 (injection `audience` field + redaction, `CrewContext.chat` GATHER op, `setChatInjection` return shape, `hasActiveGame` wiring) · `worldInfo.upsertEntries` race with rpg R7 (arbitrated in 08).
- **Open / pivot:** **CW4 has a MANDATORY pre-build director playtest** (Nate 2026-07-01) · keeper default-OFF stands with a revisit-on-evidence criterion (02 §6) · CW1 tables are baseline riders (§1) · the 4 members never run on a chat with an active rpg game (guides exempt).

### agent-principal (D60 · PD-17) — `building` (AP0–AP2 landed; the seat wave pending)

- **What:** agents as real principals — `users.kind:'agent'` + `ownerUserId`, lazy mint via `sessions.provisionAgentPrincipal`, roster `kind:'agent'`, self-attributed room canon, the two-wall capability ceiling (Principal-unconstructability + closed `canAgent` union), containment = one row flip.
- **Docs:** [`agent-principal-design/`](agent-principal-design/README.md) — README + 7 parts (canonical, D60-authoritative).
- **Moving parts (07 §):** AP0 baseline riders ✓ · AP1 identity spine ✓ · AP2 roster + attribution + containment suite ✓ (landed; suite in-tree — see `Core-STATUS.md`) → **AP3 + AP4a THE SEAT WAVE (pending)** — buddy seating + the agent-held RPG GM seat as ONE wave, agent-GM demo is the HEADLINE checkpoint → AP4b crew = NO CODE (a bright-line criterion only).
- **Depends on / grafts:** AP3 needs chat obligation #18 (`chat.seatAgent` + `resolveAgentSpeaker` + attribution arm) · AP4a needs rpg R3 (the game rows to re-key) · buddy-observer must gain the seated-buddy self-quip drop belt when IT builds (04 §6).
- **Open / pivot:** the borrowed-owner posture stays the SHIPPING posture until AP3 lands · crew stays principal-less until a member authors canon (the bright line).

## 3. Phase-7 feature grafts — `design-locked`, build after the chat tail

| Effort | Decision · PD | Canonical docs | Moving parts | Depends on / grafts into | Open / pivot |
| - | - | - | - | - | - |
| tool-use — `domain/tool-use` | D48 · PD-54 | [`tool-use-design/`](tool-use-design/README.md) (README + 5 parts; digest `tool-use.md` inside) | **T1–T4 LANDED (2026-07-04, PD-54 cleared — `domain/tool-use` + the `runRecurseLoop` in `chat/engine/pipeline.ts` are in-tree).** Remaining, consumer-gated: T5 project-mcp (rides buddy) → T6 structured output (lands with first consumer) → T7 client tool block. README carries the verified landed-vs-remaining truth table (current as of 2026-07-04) | T4 is chat P5 (obligations #1–2); T5 rides buddy; T6 consumers = crew CW2 / rpg | tools × responseFormat exclusivity is a LEAN; T6's first-consumer race is arbitrated in 05 |
| databank — `domain/databank` | D49 #5 · PD-57 | [`databank-design/`](databank-design/README.md) (README + 8 parts; digest `databank.md` inside) | DB1 kit/chunk + contracts → DB2 schema + 5th embeddings arm → DB3 `infra/extraction` (**the long pole**, parallel) → DB4 domain core → DB5 `search.documents` lens → DB6 chat graft → DB7 web scraper → DB8 fast-follows | the `{{databank}}` slot reservation (obligation #9) ✓ landed 2026-07-09 (`kit/macro`; the DB2-tables rider) — DB6 consumes it · DB7 needs hub H1 (the guard) | DB3 pdf loader is the only uncertain-cost item (isolated — DB4–6 run on textlike) · prune-verb vs clear-then-restore (05, default: prune) · host-only v1 vs corpus membership-union (flag 2 — a one-site flip later) |
| expressions — `domain/expressions` | D49 #4 · PD-56 | [`expressions-design/`](expressions-design/README.md) (README + 5 parts; digest `expressions.md` inside) | E1 contracts + tuples ✓ **LANDED 2026-07-09** (baseline rider) + E2 SCHEMA ✓ landed (`character_sprites`; the CRUD leaf still trails) → E3 classify + post-turn hook (obligations #7–8) → E4 sprite-sheet workload (needs imagery — BUILT; the E1 stub runner is in-tree) → E5 client stage | imagery (built) · chat hook ops · assets ref-registry must gain `character_sprites` | the single-active workload lock serializes sheet jobs deployment-wide (accepted, re-scope criterion in 03 §7) |
| hub-browse — `domain/hub` + the egress guard | D61 (B5a/B5b) | [`hub-browse-design/`](hub-browse-design/README.md) (README + 3 parts) | H1 **the guard** (`safeFetch` + `isAllowedImageBuffer` + `@orb/kit/image-sniff`; ≡ gallery G6, ONE work item — unblocks G7/DB7/D44 fetches) → H2 leaf + chub adapter → H3 wyvern/chartavern/pygmalion → H4 preview + import handoff → H5 avatar proxy → H6 client → H7 gif migration (absorbs gallery G7's home) | import front door (built) · `infra/network/egress.ts` staged seam (zero callers today) | pygmalion flow needs build-verification (drop to deferred if closed) · per-user hub credentials = a named flip criterion, not built |
| saved-rosters — `domain/roster-preset` | D61 (B6) | [`saved-rosters-design.md`](saved-rosters-design.md) (single doc, canonical) | RP1 server (schema + leaf + `applyToChat`, M) → RP2 client picker (S–M, Phase 6) | drives EXISTING chat roster verbs by injection; chat stays preset-blind | none — review-CLEAN |

## 4. Phase-8 scripting (D46) — `design-locked`

| Effort | Canonical docs | Moving parts | Depends on / grafts into | Open / pivot |
| - | - | - | - | - |
| automation (Tier 1) — `domain/automation` | [`automation-design/`](automation-design/README.md) (README + 5 parts; digest `automation.md` inside) | A1 macro-DX → A2 CEL + `{{expr}}` → A3 global variables → A4 contracts + rule store → A5 watcher + dispatch (the L) → A6 action arms → A7 `transform_draft` + the D50 seam → A8 client. A1–A3 are kit-early (buildable NOW) | A5–A7 need chat obligations #3–6 (turn-record `initiator`/`automationDepth`, `variantSelected` ordering, `PromptTransform` points, `applyVariableOps`) — none landed · the variables substrate (§1, building) | reserved `enqueue_crew_workload`/`rpg_verb` arms stay typed-not-built in v1 |
| plugin (Tier 2) — `infra/plugin-host` + `domain/plugin` | [`plugin-design/`](plugin-design/README.md) (README + 4 parts) + the automation digest `automation-design/automation.md` §3 | P1 runtime spike + realm → P2 the membrane contract → P3 lifecycle domain → P4 host-function wiring + seams → P5 inline snippets → P6 hardening + the permanent membrane-escape suite | P4 needs automation A5–A7 + the tool-use registry + the D50 seam; tools register as `plugin_<slug'>_<name>` (review PLG-1 resolution) | DoS budget numbers are LEANs with criteria (P6 soak review) · install-widening criterion (02 §4) |

## 5. Shipped from this folder — `built` (code is the doc; only the residue is listed)

| Effort | Decision · PD | State | What remains |
| - | - | - | - |
| imagery — `domain/imagery` | D49 #1 · PD-93 | **built** (landed early: leaf + `chat.generateImage` caller + `imagery_generations`) | I5 client (Phase 6). Docs [`imagery-design/`](imagery-design/README.md) (+ digest gone — never had one; the set's README flags record the deltas) |
| gallery v1/v2 | D49 #2 · PD-55 | **built** (server: `listOwned` + gallery verbs + `gallery_items`) | G2 animated-sniff/thumb rung (unlanded) · G4 grid + G5 token-counter (Phase 6) · G6→hub H1, G7→hub H7 (home migrated per D61). Docs [`gallery-design.md`](gallery-design.md) (canonical) + digest `gallery.md` |
| `@orb/ui` package | D42/D54 | **built** (waves 0–3 + the carve-out fleet) | the §6.2 client factories (Phase 6). Docs [`ui-package-design.md`](ui-package-design.md) — §-numbers are load-bearing (code cites them); do not renumber |
| client tooling (ESLint + Vite) | — | **built** except the CSP | §7.5 reference CSP lands with the `entry/http` wave; §9 open flags. Docs [`client-tooling-setup.md`](client-tooling-setup.md) — §7/§9 numbers cited from code |
| themes — `themes` entity in `domain/settings` | D44 §12.1 | **built** (server: `themes` table + 6 CRUD verbs + seed rows + `theme`/`appearance` UserSettings namespaces; client: `<ThemeScope>`, editor) | nothing — archived as the as-built design record. Docs moved to [`../history/themes-design.md`](../history/themes-design.md) |

## 5b. The D62 client program + the FINAL lane docs (live companions — previously untracked here)

| Doc | Role | State (2026-07-09) |
| - | - | - |
| [`ux-flow-revamp.md`](ux-flow-revamp.md) | the D62 journeys/parity/lanes program record | lanes L0–L6 LANDED (its §0.5 truth table is current); remaining = J10/J11 partials + L7 parity (Presets row BLOCKED on the presets-placement decision). The chat journeys are now governed by the FINAL-Chats doc; J9 by FINAL-Character |
| [`ui-polish-punchlist.md`](ui-polish-punchlist.md) | the 43 UIP pixel/chrome fixes | re-verified against code 2026-07-09: LARGELY LANDED; open = UIP-404 SettingRow adoption · UIP-405 (auth #50) · §8 focus-ring audit + VERIFY-LIVE caret · §9 pending the presets decision (its banner carries the detail) |
| [`design-enforcement.md`](design-enforcement.md) | the D62 gate machine (Tier A/B/C) | gate battery LIVE at 50 gates / 8 stages (`core/Core-Enforcement-Active-Gates.md` is the registry); presets rows PENDING the owner decision |

**The FINAL lane docs (repo ROOT, one per active client lane — the convention):** a lane in active
build carries an exhaustive `FINAL-<lane>.md` at the repo root (the build-spec the builders obey);
when the lane SHIPS, the FINAL moves to `../history/` as the as-built record (the persona doc did
exactly this). Current: `FINAL-Character-Library-and-Editor-UX.md` (in build) ·
`FINAL-Chats-Landing-Room-and-Context-UX.md` (authored 2026-07-09, dispatch-ready) · shipped:
`../history/FINAL-Persona-and-Immersive-Chat-Visuals.md`.

## 6. Connection-capability & client-slot designs (Phase 6 triggers)

| Effort | Doc | Status | Trigger |
| - | - | - | - |
| Capability-complete turn & wire shaping — the UNIFIED program: `ModelCapability.turns` (prefill/mid-conv-system/role-handling floor/explicit cache + per-model `cacheMinTokens`) + the role-merge prefix-cache fix + the SHAPE-clamped user role-handling knob (**D66**) · the anth-direct backend (paid-key-only, TOOL-LESS, additive; official `@anthropic-ai/sdk`; v1 rides the existing `openrouter` source; THE SUB-EXCLUSION + the extended ambient-credential belt; the `cli`/`direct` transport axis) (**D67**) · sampling completeness (minP end-to-end, verbosity live on the responses wire, per-model direct-transport Claude sampling) (**D68**) — all proposed | [`capability-turn-shaping/`](capability-turn-shaping/README.md) (a 4-part set: 01 capability-model · 02 anth-direct · 03 sampling · 04 migration+ledger; absorbed the former `anth-direct-backend/` 2026-07-10) | `draft` (ratification-ready; honor matrix + OR-key SDK path wire-tested 2026-07-10; adversarial review applied 2026-07-10) | ratify D66+D67+D68 together (part 04 §2), then the part-04 §1 waves in order: W1 contracts+resolver (incl. the api-threading fix) → W2 sampling → … — server-side, unblocked, ZERO new credential; the client picker/panels are W10 |
| Descriptor-driven params panel + `quality` dial mapping | [`connection-capability-panel.md`](connection-capability-panel.md) | deferred:no-client-surface | the client params panel build |
| `PresetFormValues` + mapper elimination | [`preset-form-mapper-elimination.md`](preset-form-mapper-elimination.md) | deferred:no-client-surface | the preset editor build (criterion: TanStack binds every nested path) |
| Tag pending-review read verb | [`tag-pending-review.md`](tag-pending-review.md) | deferred:first-consumer | build WITH the Phase-6 tag/character surfaces |

(`character-snapshot-ux.md` was RETIRED at the 2026-07-09 triage — both of its open questions are
answered by `FINAL-Character-Library-and-Editor-UX.md` §7 History + §12 FIX #3.)

## 7. Deferred domain surfaces (gap docs carved from gutted `domains/*.md` — each PD-cross-referenced, design preserved)

| Effort | PD rows | One line | Trigger |
| - | - | - | - |
| [`assets-maintenance.md`](assets-maintenance.md) | PD-26 · PD-84 | backfill/GC/reap/fsck/rebuild — 5 verbs; seams already inert-wired | blob-store growth OR an ops/admin surface |
| [`buddy-observer-reaction-engine.md`](buddy-observer-reaction-engine.md) | PD-45 · PD-64 | the `observer/` reaction engine + live SSE bus; pure machine + schema BUILT | buddy's call — the event sources now exist; land the D60 seated-buddy self-quip belt with it |
| [`discovery-deferred-corpus-surface.md`](discovery-deferred-corpus-surface.md) | PD-40 · PD-39 | 10 corpus verb waves (distill → insights → image analytics → composed views) | per-wave; runner seams inert-wired |
| [`export-deferred-surfaces.md`](export-deferred-surfaces.md) | PD row pending | **BUG-grade gap:** the HTTP download registrar — both export verbs composed but runtime-UNREACHABLE; + bulk zip (unflagged) | wire with `entry/http`; zip on demand |
| [`import-st-profile-waves.md`](import-st-profile-waves.md) | PD-77 · PD-78 | chats/personas/lorebook/loader/backfill waves (parser esoterica carried verbatim) | blocked:later; PD-94 zip-bomb belt lands WITH the loader |
| [`search-deferred-verbs.md`](search-deferred-verbs.md) | PD-35–38 | discover / cross-modal images / lexical fields+suggest / unified dispatch | per-verb demand |
| [`sessions-token-rotation.md`](sessions-token-rotation.md) | — | deliberate NON-behavior + the rotate-on-privilege-transition design | the first user-driven privilege step (MFA/impersonation/self-grant) |
| [`stats-discovery-seam.md`](stats-discovery-seam.md) | PD-22 · PD-40 | the economics/semantics disjoint-projection tiers 2–3; the `discovery-no-stats-rollups` lint could land NOW | with the PD-22/PD-40 builds |
| [`workloads-deferred-designs.md`](workloads-deferred-designs.md) | — | per-user authz · `dependsOn` DAG scheduler · kind collapse | explicit criteria per item in the doc |

## 8. Records (closed — do not re-mine)

- [`Marinara-Residue-Non-RPG.md`](../history/Marinara-Residue-Non-RPG.md) — `decided` (D58/D59/D61 in full); MOVED to `../history/` at the 2026-07-09 triage (a closed record belongs with the resolved archeology). The adjudicated borrow list + the permanent scripting/agent-pipeline/group-system cautionary records. Marinara mining is CLOSED; evidence in git history.
- [`DESIGN-REVIEW-2026-07-01.md`](DESIGN-REVIEW-2026-07-01.md) — `decided` (all findings applied `0d0a7fe`). Kept live for **§7, the chat-side obligations sheet** — the P5/P6/P7 handoff list this board's "obligation #n" refs point into.
- [`rpg/`](rpg/README.md) — tombstone for the absorbed marinara RPG corpus (git history).
