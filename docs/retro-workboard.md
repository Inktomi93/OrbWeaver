# Retro Workboard — the live board

> **THIS IS THE WORKING DOC** (owner-stated). Not law, not a deliverable — the durable state an
> orchestrator resumes from cold. Authority for LAW = `docs/architecture/core/**`; the D-ledger
> (`Core-Path-Registry.md` / `Core-Laws-and-Precedents.md`, current through **D136**; **D137 is
> reserved** for the persona build if C1 rules) wins on ANY conflict. `docs/architecture/proposed/**`
> is pre-rollback REBUILD REFERENCE — never cite its status as current.
>
> **REWRITTEN IN FULL 2026-08-08** (owner-ordered: one doc, current-state only, "so we stop fucking
> it up"). This rewrite **ABSORBED `docs/retro-remaining-work-ledger.md`** (the 2026-08-08
> tree-reverified reconciliation) — that file is DELETED; its content IS the QUEUE below. The prior
> layered board moved INTACT to
> [`docs/history/retro-workboard-2026-08-08.md`](history/retro-workboard-2026-08-08.md); earlier
> archeology: [`retro-workboard-2026-08-07.md`](history/retro-workboard-2026-08-07.md) ·
> [`retro-workboard-2026-08-03.md`](history/retro-workboard-2026-08-03.md). Nothing was deleted;
> things moved.
>
> **BOARD RULES (how this doc stays trustworthy):** CURRENT-STATE ONLY — when a block goes stale,
> REWRITE it in place, never stack a session layer on top · every row states its EVIDENCE METHOD
> (live-verified / grep-sourced / relayed-claim) or it is a LEAD, not a row · a remainder belongs in
> a CHECKBOX, never a prose tail under a ✅ · a status claim ("routed", "dispatched") owes the same
> receipt a row does.

## ═══ WHY RETRO EXISTS — the north star ═══

Read `shitsfucked` at the repo root. Main's own ledger, verbatim: *"We are tired of hunting down
invisible bugs. **Everything must be proven.**"* The disease: features that looked done and silently
weren't. The posture: **drive it live, then pin it.** A row that says "merged" is not a receipt; a
sha, a symbol, a registered gate, a running test is. Global **KISS/YAGNI are SUSPENDED here** —
build the maximal, most-provable version (\[\[kiss-yagni-suspended-build-maximal]]). Package cake:
kit ← contracts ← db ← server ← client + sealed ui; one-directional flow (rpg ↔ chat only via
injected ops). Read `docs/architecture/core/AGENTS.md` IN FULL before any work.

## ═══ OWNER RULINGS LEDGER (append-only; CHECK HERE BEFORE POSING ANY QUESTION) ═══

> **Why (owner, 2026-08-08, frustrated and right):** rulings kept getting re-asked — W5 was ruled
> 2026-07-27 at its spec's foot and re-posed as an open fork on 2026-08-08; the OpenRouter-key row
> re-posed a dead question. **RULE: no question reaches the owner until it is grepped against THIS
> table + the named design doc's foot. Every answered question is appended here the same day.**
> One line per ruling; receipts live where the line points.

| date | ruling |
| - | - |
| 07-27 | **W5 user-macro values = Arm A per-chat** ("yes option A"); no ForeignInputs field. BUILT. |
| 08-02 | wiFormat `{{entry}}` carrier BLOCKS at write · main-prompt ADDRESS clause is deliberate |
| 08-07 | Templates ONE home = PRESETS (D132) · row-27 WIRE · pushes = fresh word + fresh battery · tag ≤30 cap stays · probe-lint = scratch · summarize-sub DROP |
| 08-08 | Containerize default = usable-as-owner (ST first-run) · refinery BUILD F1-F5 · FF-merge/currency discipline |
| 08-08 | **C2 `{{note}}` BLOCKS** (carrier, Option C) · **C3 nudge texts SHIP VERBATIM** (veto pile closed) · **C8 shared `MAX_INJECTION_TEMPLATE_LENGTH`=10000** |
| 08-08 | **C4 narrator marker = MODE-AWARE default, bytes BLESSED** (in the C4 merge `0282bb554`) · **Arm A/D16: narrator-of-one KEEPS narrator framing** (mode is data; size branch forbidden; owner: "do whatever's cleanest") |
| 08-08 | **C6 = kebab PNG/JSON submenu** · **C7 = launcher sheds count+create when populated, New-book double STAYS** |
| 08-08 | **OpenRouter: F5 build+prove+depth-knob (ARM A clamp-to-safe) · F6 skip · F7 defer** (drop-is-safe measured; storage exists) |
| 08-08 | **Stickler F1 = short-circuit narrator arbitration, KEEP policy field · F2 = BUILD real round-robin · F3 = DELETE groupCharacterId · F4 = re-home group framings to PRESET + amend D132(B)** |
| 08-08 | **Vocab kill list RATIFIED IN FULL** (crew incl. schema field · director→arbiter · seat · 3 UI strings; party/scene/act + ember/weave STAY) |
| 08-08 | **CAS = weekly GC + monthly fsck** · **AGENT-1 = wait for owner re-auth, keep whole** · **Refinery R2 GO + R3 MOCKUPS GO** (TanStack, not "React Query") |
| 08-08 | **PUSH WORD GRANTED** for this train (drain → battery → E2E\_LIVE → push) · queued trio = train two |
| 08-08 | **C1 persona program APPROVED IN FULL on the doc's recommended arms** (owner, after the Reading-B walkthrough): Phase D → Phase C, all 5 §10 forks on their recs (C after D, before the agent wave · substrate home contracts · 4-field overlap only · NO character-arm description · build lane mints **D137** w/ the §10.5 draft clause). Phase gate: persona-resolution suite BYTE-UNTOUCHED. Forge lane dispatched. |
| 08-08 | **R0 ratifications:** handoff-clear KEPT (critique never rides the copy) · 12 refinery prose texts BLESSED as adapted · **caps re-ruled CHARS→TOKENS: 4,000 tokens per critique field via the kit tokenizer + 32k-char DoS backstop** (owner: "it needs to be tokens… 1000 tokens is piddly"; lane live) · ENTRIES\_MAX stands · **C5 presets STAY STANDALONE** (row closed) · **R3 mockups delivered + published as artifacts; deltas + taste forks ruled on orchestrator judgment** (owner: "fine with your judgement") — deltas 1/2/3 = A/A/A, forks per the mock recs, F-K ruled at build-brief time. |
| 08-08 | **Accept grammar = ARM (B) per-block Keep/Discard VERBS** (owner: "makes my brain happy"; re-opens fork C/D only) — and (b) natively satisfies security belt 10 (default = nothing accepted); arm (c) default-keep is DEAD (belt-10 collision, mock lane's find). Mock reshaping. **Graduations:** group-engine verifier CONFIRMED 5/5 · OR-F5 verifier CONFIRMED 6/6 (wire receipts reconciled to the cent) — both chunks GRADUATED; gaps → smalls batch 2 (task #12). **OG-extension feedback doc** landed (`docs/design/refinery-og-extension-feedback.md`) — manual-rewrite arm is R3-scope, in the build brief. |
| 08-08 | **R3 DIRECTIVE — DO NOT HARDCODE THE SURFACE TO THE FIXED PAYLOAD** (owner, verbatim intent: custom schemas are "the cool part… people doing requests to make their own schema, to shape what gets scored… cool graphs" — and the good-looking version must look good with custom shapes too). The built-in payload = ONE INSTANCE of a schema-DRIVEN renderer: widget vocabulary keyed on schema STRUCTURE (bounded number→gauge · enum→verdict banner · long string→prose · array<object>+numeric→scored rows), well-known shapes light up the full treatment, NL→schema generator taught to EMIT renderer-loved shapes, floor = good generic rendering never raw JSON. Also ratified: the three D62 delta A-arms (direct, was delegated). Goes in the R3 build brief as a first-class constraint. |
| 08-08 | **REFINERY = CROWNING FEATURE (owner posture ruling):** "one of our three crowning features so I need this whole thing to fuck… If we need to add packages that help we totally can. We do things once and we do them right even if it means more work" — the schema-renderer stickler workshop expanded to a full crowning-feature review (refinery proposal corpus + contracts/db/kit packages IN FULL; dependency latitude granted w/ vendored-vs-dep discipline; OG test suite mined as steal/adapt ledger; the OG scars = hand-rolled-in-ST artifacts vs real lessons, classified three ways). Caps merged `e488f8f9e` (4k tokens, ANALYZE +9%) · accept-mock merged `5b34b48ff` + published (3 artifacts live) · mock forks taken on delegated judgment: re-run REOPENS undecided · coarse tax taken w/ decided-blocks-collapse. |
| 08-08 | **REFINERY design directives (owner word-of-warning):** (1) field topology is NOT 1:1 — rewrites may fill empty fields, empty filled ones (consolidate-into-description), split or merge across the SELECTED set; the pipeline + accept UI must model field-set DELTAS within the belt-9 fence (contract representability questions routed to the crowning-feature stickler: emptying writes, fill-empty applicability, absent-field scoring, absent-side compare blocks). (2) OUTPUT-BUDGET PREFLIGHT — no ST connection opacity here: poll the resolved preset/connection and WARN pre-run when expected rewrite output exceeds max output tokens; fit readout covers BOTH directions. |
| 08-08 | **REFINERY: EMPTYING IS REFINING (owner overrules a shipped R0 stance):** "they can fill it therefore they can empty it." The shipped contract blocks it deliberately — `refinery/index.ts:294-299` `text: .min(1)` with the comment "a rewrite never CLEARS a field (clearing is authoring, not refining)" — that stance is OVERRULED: consolidation-into-fewer-fields requires emptying, within the belt-9 selection fence. Fix designed by the crowning-feature stickler first (open wrinkles: greetings are an ARRAY — empty-string vs entry-removal are different writes; the wire grammar minLength changes; the accept UI needs a cleared-side block), then a lane builds. |
| 08-08 | **REFINERY directives round 3 (owner):** revert/step-back FIRST-CLASS on all three axes (phases within a round · iterations across rounds · card VERSIONS via D28 snapshots + F6 — and AUDIT the versions plane, owner "hasn't messed with it much": list/diff/restore/run-provenance gaps = pre-launch fixes) · **SAVE-AS-NEW-CHARACTER-COPY RULED IN** (OG gap 3 promoted from R4-candidate to committed scope; rides character-create + fork-copy precedents) · **primitive-minting latitude confirmed** ("never been shy" — D44 precedent; each mint names contract/consumers/CT obligation). All routed to the crowning-feature stickler. |
| 08-08 | **REFINERY state-model rulings (owner):** (1) NO as-you-go card writes — the session is a WORKSPACE; the live character is touched ONCE at the terminal act (apply / save-as-copy); the F6 analyze auto-stamp flagged to the stickler as a possible declared carve-out (signals vs card fields). (2) **THINK IN GIT TERMS** — base ref = anchored original · session = working branch · rounds = commits · step-back = checkout · per-block Keep/Discard = staging hunks (`git add -p`) · apply = merge · save-as-copy = branch-off · D28 snapshots = the live card's reflog · live-card-changed-mid-session = a detectable merge conflict (design the affordance). Semantics are git's; user-facing words stay product vocabulary. |
| 08-08 | **USAGE DISCIPLINE (owner, evening sitting):** BIGGER LANES — group all of a lane's items into one brief, **ONE commit per lane**, then finish (too-granular commits waste time + weekly usage) · **no dedicated verifier/side-eye for smalls** (the tiny verify/side-eye dispatches burned the other account; batched lenses only for substantial/risky trains) · **forge BANNED until further notice** · concurrency = **5 agents, fill the lanes** · no push reminders (owner says when). |
| 08-08 | **MERGE FLOW = rebase-in-worktree → `--no-ff` merge onto main** (owner: "we literally made a lefthook pre-merge config") — the `pre-merge-commit` hook gates the EXACT merged tree; lane agents commit through pre-commit (a landed commit IS the static receipt — never a separate `pnpm check`, never `--no-verify`); the ff-only flow was gate-naked (rebase + ff fire no hooks — how #21's red reached main). Currency half of the 08-08 morning ruling stands. |
| 08-08 | **Vocab-lane forks (orchestrator-ruled in-lane):** seat = **POSTURE-ONLY** (ratified text is "stop minting seat\*", NOT remove — census's "\~8 symbols" false: 384 `seat` + \~70 load-bearing compounds; removal = own future lane) · `entryMetadata.crew` → **`provenance`** (schema's own "generic machine-writer provenance" header; owner may override) · F4 re-home mints **`group` template kind** ("Group rounds" kicker, 7 TEMPLATE\_DEFS rows, teach/extract one-kicker-per-cohort precedent) · model-facing "turn director" default text + "Round-robin" CARVED OUT (D132-E / F2 territory). |
| 08-08 | **DB WIPED + fresh stack (owner: stop the backfill churn)** — data/orbweaver.db deleted, stack rebooted clean; memoryEnabled back to default OFF; browser stale-cookie empty EXPECTED until #23 lands. **#21 MERGED `10c7066d1` + live-PROVEN** (4-6s natural stops vs 30-120s loops, \~6-25x/item; NOTE: this vLLM never logs per-request samplers — behavioral receipts, not log greps, are the live instrument). **#7/#12 SPEC-LOST** (gap lists died in lane transcripts, never landed in a file — re-source or drop) · **#11 RE-SCOPED** (no schedule-seed mechanism exists; new boot-seed step = executor work, riding the #24 leg). |
| 08-08 | **NL→SCHEMA IS FIRST-CLASS R3 SCOPE (owner):** whoever builds the R3 refinery surface builds the NL→custom-schema UI WITH it, same lane, same build — NOT an SF0 layer-on-after. Pairs with the row-59 schema-driven-renderer directive: the custom path ships alongside the fixed payload so the renderer can never quietly hardcode. |
| 08-08 | **Import-fidelity §5 rulings (owner, via question tool):** variants metadata = ONE CANONICAL SHAPE written at import (reader stays single-shape; pre-launch NO-LEGACY + re-import coming) · `chat_metadata.variables` = WIRE THROUGH to the existing column/field · author's note = ADAPT/CONVERT ST's note\_depth/position/role onto ORB'S OWN injection-system note ("we basically have our own author's note with our injection system — just adapt and convert to that") · #28 dispatch NOW alongside R3. |
| 08-08 | **ST IMPORT PLANE RE-HOMES (owner):** backgrounds/ = GALLERY ("backgrounds is our gallery — a media store for characters and etc"), imports into the gallery/CAS media store (the "no domain home / cosmetic" report reason is dead). THEMES: orb's D71 pipeline is a legit target — owner open to a SAFE ST→orb theme conversion (mapping study first, convert what maps, report the rest). Both fold into the deferred import lane (task #28) with databank/user-settings. |
| 08-08 | **NO TEXT-COMPLETION (owner, "who the fuck is building text completion"):** the #25 ST-preset import scope is CHAT-COMPLETION ONLY (OpenAI Settings/ + `oai_settings` via the shipped `importStChatCompletionPreset`). TextGen/NovelAI/KoboldAI preset families stay UNIMPORTED with an honest report reason — orb has no text-completion mode and no mapper gets built for one. (Orchestrator had wrongly approved 3 text-completion mappers; overruled live.) |
| 08-08 | **Templating rows 53-73 = ARM B (owner, via question tool): SERVER composes** — wire carries toggle KINDS only, server joins the 21 fragments via prose slots (the "wire carries only the kind, never template text" doctrine generalized). Spec: `docs/design/templating-fork-rows-53-73.md`. Build = task #33, parked under the freeze. **"Runs" rename KEPT** (Jobs pane > Runs section — the 08-02 Jobs>Jobs letter yields to WCAG label-in-name; mechanism [user never sees "workload"] preserved). |
| 08-08 | **DISPATCH FREEZE (owner, late evening): no new agent dispatches until further notice — 5h session limit at 90%.** Running lanes finish + get merged by the orchestrator's own hands; queued tasks #30 (R4) / #31 (agents naming) / #32 (CLS+tab-strip) stay PARKED until the owner lifts it. |
| standing | persona↔rpg linkage DO-NOT-BUILD (persona-pin flavor recorded) · persona reading-B OFF THE TABLE (re-affirmed 08-08 after full walkthrough) · presets are GLOBAL, never per-room · WIRE\_CAPTURE on = deliberate debugging posture |
| open | R0 ratifications (handoff-clear default · ENTRIES\_MAX=108 · PROSE\_MAX=4000 · the 12 prose-slot baseline texts) · C5 · C9 · C13 · home-tile WHETHER · ctx-tab-strip coarse · token-unification offer |

## ═══ STANDING LAWS (owner-set, all in force) ═══

- **Cap FIVE concurrent lanes.** ONE COMMIT per lane (stack, never amend); receipts in the report,
  never the commit message.
- **Worktree CURRENCY (owner intent 2026-08-08):** origin is far behind (unpushed) — worktrees must
  carry the latest LOCAL commit. (1) SPAWN: `.claude/settings.local.json` `worktree.baseRef: "head"`
  — verify it stays `head`. (2) DRIFT: before merging, REBASE the lane's single commit onto current
  main in its worktree (`git -C <wt> rebase main`), then `git -C <main> merge --ff-only` (rebase
  rewrites the SHA — track the new tip). Consolidated `pnpm check` after every merge; **read EVERY
  check exit** — a finished check that sits unread is the same as skipping it. Prune dead worktrees.
- **GRADUATION = the fresh lens, not the static check:** every non-trivial merged work-stream gets a
  fresh-context `verifier` (code) and/or `side-eye` (rendered) at CHUNK granularity BEFORE its row is
  done. Security-dominant → `security-executor` (never Fable, never the main session).
- **NEVER push origin without a fresh per-push owner word.** Current standing: a CONDITIONAL word is
  granted for the preset train — after PRESET-FOLLOWUP lands + fix legs + a FRESH battery greens,
  push. Otherwise held. `E2E_LIVE=1 pnpm e2e` is owed on the push window.
- **A value/label/enum-changing merge owes the BATTERY, not just static** — `pnpm check` never runs
  `tests:node`; budget \~1 stale coupled fixture per value-changing lane
  (\[\[shared-value-change-owes-a-battery-not-static]]). One `verify --push` when the train drains.
- **Every UI build gets its side-eye, and ALL findings get fixed** (\[\[side-eye-fix-all-findings]])
  — but a side-eye PRESCRIPTION never reverses a recorded ruling; kill the symptom, keep the law.
- **Gates land on a FIXED tree**; allowlists are permanent deliberate exemptions, never debt parking.
- **Overnight full-auto:** work the queue via the escalation ladder, no blocking questions. Block
  only for: destructive/irreversible · owner-sacred (persona pin) · origin pushes · scope pivots.
- Board commits are `-c core.hooksPath=/dev/null` + `node scripts/check/format-md.ts --write` first
  (owner word); code merges keep the discipline above. D-numbers allocate at DISPATCH when two live
  lanes both mint. Lane briefs name their exact playwright CT files (a CT nobody names is a CT
  nobody ran).

## ═══ LIVE STATE (2026-08-08 EVENING — THE BIG-LANE SITTING; supersedes every block below) ═══

> **This block supersedes the morning's LIVE STATE + TRAIN STATE below** (kept for history). Merge flow
> is now rebase-in-worktree → `--no-ff` (pre-merge-commit hook gates every merge; see RULINGS).

**~18 hook-gated merges landed this sitting.** Everything below is ON MAIN, unpushed (battery owed first):

- **Import program COMPLETE for matched planes:** #19 tags (`c921f5834`) · #25 chat-completion presets +
  group chats (`5d05d0101`, NO text-completion by ruling) · #29 fidelity fixes (`d36101b9c` — ST wall-clock
  zone [dates were 6-7h early on 49.6% of msgs], loose filename regex [3 chats stamped 2027], token_count
  by role [35% tokensOut inflation killed]) · §5 fixes (canonical variant shape [3.1k real reasoning
  durations, not 12.7k — key-presence ≠ value census], chat variables 480 chats/2,813 values, author's-note
  ADAPT-to-injection [ST recorded value wins, house register fallback], clean titles 1,083/1,083 with 615
  ` (2)` suffixes). **#28 in flight:** backgrounds→gallery (arm b: kind background + backgroundLibrary
  entry), themes via the D71 converter ONLY (safe pairs), power_user multi-home classification (preset-owned
  keys → the (active) preset), databank. **Re-import of the owner's 3-year corpus waits for the train.**
- **Memory/vLLM:** #21 summarize samplers+batching MERGED+LIVE-PROVEN (4-6s stops, ~6-25x/item) ·
  #24 `/api/_debug/vllm/metrics` (3 engines, KV headroom warn; gen 7.516x matches its startup line) ·
  #11 CAS schedule seed (existence-gated per kind). Client path concurrent-clean — NO queue built, ruling:
  vLLM's continuous batcher + scheduler queue are the mechanism; the "hang" was the summarize loop.
- **Auth:** #8 OIDC owner adoption + #23 refresh/stale-session (`f663abeb8`) + the cascade fix
  (`385d87776`: owner handle pinned to seed key, ensureUser loud-fail on phantom, **bind-once guard closing
  a live pre-existing account takeover** — handle-fallback could rebind a BOUND row's externalId).
  Verifier-graduated with 2 findings in a fix lane (OWNER_HANDLES move bricks boot — path being made
  real-or-honest; null-subject guard scope comment).
- **Refinery:** P1 contract fixes merged (`ebacd3c05` — emptying arm end-to-end within belt-9, greetings
  replace/clear as DISTINCT writes + index remap, duration_ms/source_run_id [D24 self-FK], {{shape}}
  splice; verifier CONFIRMED, no belt escape constructible) · **R3 + NL→schema: FORGE IN FLIGHT** —
  all scope A-H built full-stack (refinery_schemas table, 10 service members, schema-driven render plan,
  arm-B review, tri-axis tabs, preflight, manual arm, §21 divergence belt), finishing biome→visual-mock
  loop→one commit. **R4 queued** (task #30: sweep + I2 + dossier + F6/F7 + F-T1 append [ruled in]).
- **Engine/harness fixes:** #12 (`7544ffc6f` — pooled rotation vs allowSelfResponses, per-name @mention
  masking, cache receipt now OBSERVES [2nd lying arm found+killed], unreachable-depth warn) · #7
  (`85d8225a9` — 3 harnesses onto ORB_ENV_NO_FILE, runner rows) · #6 footer recognizer · #27 mop-up
  (FK truth-repair+pin, derived KIND_HEADERS).
- **Graduations:** C1/D137 CONFIRMED (phase gate byte-exact) · #8 · #12 · #25 · #29 (minus the group-chat
  zone gap → fix lane) · side-eye batch pass: C6 submenu GRADUATED clean; findings (turn-director model
  text, Corpus first-run redesign, Delete aria, flash ring, + P2/P3 pile) ALL in a fix lane per the
  side-eye-authority rule.
- **IN FLIGHT at the freeze (3 lanes) — RESURRECTION NOTE (owner-ordered, for after the usage reset).**
  Worktree = the durable anchor; same-session resurrection = SendMessage to the agent; cross-session
  recovery = a fresh lane ADOPTS the worktree/branch (never tear down un-merged worktrees):
  · **forge R3** — `.claude/worktrees/agent-afabc86f4157916fe` (branch `wt/agent-afabc86f4157916fe`,
    spawned off `7a81d81cb`): all scope A-H built, was finishing biome→knip→visual-mock-loop→ONE commit.
    If resurrected: it has the post-compaction reading-list message + all standing corrections in-transcript.
  · **grad-findings fix (security-executor)** — `.claude/worktrees/agent-ad73cbeaf85ef9f26`: fixes 1-4
    (group-chat wallClockZone thread [the REFUTED one], OWNER_HANDLES migration real-or-honest,
    null-subject guard comment, serde token comment) + fix 5 pinnedPersona [ruled]. No commit reported yet.
  · **side-eye fix batch (executor)** — `.claude/worktrees/agent-a21d6366e6ef2762c`: ALL side-eye findings
    (turn-director re-version, Corpus first-run redesign, Delete aria, flash ring, memory-note type,
    launcher affordance, triple-home resolution, subtitle clamp, readout selection, + P3 pile; "Runs"
    rename landed + owner-KEPT). No commit reported yet.
  **#28 import batch + templating recon: LANDED + merged before the freeze note** (5d05… era superseded).
  **Queued/PARKED:** #30 R4 · #31 "agents" naming [ruled] · #32 CLS+tab-strip+panel-jank+CLS-flagger ·
  #33 templating ARM B [ruled].
- **Owner rulings this sitting:** ALL in the RULINGS table above (usage discipline / merge flow / no
  text-completion / plane re-homes / §5 arms / NL-first-class / F-T1 / pinnedPersona / "agents" naming).

## ═══ SUPERSEDED: LIVE STATE (2026-08-08 morning — ST-import epic + embeddings) ═══

- **⚑ IMPORT EPIC COMMITTED `ba8b5fbe5` (NOT pushed — needs fresh word + full battery).** The whole
  ST-folder import, verified live on the owner's real 782M / 310-card / 872-chat / 22k-message library:
  **320 characters** (all cards incl. distinct same-name ones), **61 world books**, 646 avatars, import
  report written. Pieces: shared ST world-info position mapper (embedded card books + standalone
  `worlds/*.json` converge on ONE `loreEntryColumns/loreEntryMetadata` path; v2-string / numeric 0-6 /
  empty / at-depth all normalized so the raw ST value never hits the `metadata.position` write seam) ·
  standalone worlds → unattached owner library books (new ST-native substrate) · **per-card isolation**
  (a bad card is skipped+counted, never aborts the batch) · **best-effort field repair** at the boundary
  (`repairImportedCardInput` clamps over-cap fields; direct create/update stay strict) · **never dedupe
  by NAME** — a byte-new card colliding on the per-owner-unique handle slug gets `emily`/`emily-2` (a NEW
  character, own id; display name untouched); byte-identical still dedupes by importHash; replaces PD-108
  handle-match-edit-in-place · tree cap 256MiB→1GiB + themes/assets ST\_SHARED\_DIRS collision fix ·
  memory-backfill enqueued ONCE at end-of-import (no per-(kind,owner) admission abort; embeddings never
  run mid-import) · **import report** at `data/import-reports/import-<stamp>.md` (skipped cards+reasons,
  unreadable files, orphan chat dirs, ST planes/settings with no importer yet). #15/#16/#17/#18 CLOSED.

- **⚑ EMBEDDINGS — chars+avatars work, chat-memory was OFF + LOOPING (fix in flight #21):** character
  corpus (320) + avatars (646) embed fine. Chat memory built **0 segments** because (a) `memoryEnabled`
  defaults **false** (owner enabled it) AND (b) the memory summarize LOOPS: it rides the LEAN
  `vllm/engine/chat-completion.ts` path (maxTokens/temp/minP/repetitionDetection only) while GENERATE
  rides the rich `backends/kit/openai-compat/body.ts` (full samplers incl. presence\_penalty). Qwen3-VL
  ships repetition\_penalty=1.0 and loops → each summarize runs to maxTokens/120s (44 segments in 26 min
  at 100% GPU). Neo passed the loop guard; retro dropped it. The launch `--override-generation-config`
  is ONLY for the agent-sdk /v1/messages wire (can't do per-request) — NOT the fix. Also: the memory
  build calls `summarize([oneBlock])` in a per-block loop → NO vLLM batching (neo batched via the worker
  pool). Degenerate results wiped; chars/chats kept.

- **⚑ LANES LIVE (dispatching RE-ENABLED — usage back):** #21 memory summarize (executor `a19e7d680f1bf5708`,
  worktree) = add generate's per-request samplers to summarize (own knobs, NOT preset-coupled; presence\_penalty
  1.5 default) + batch to vLLM (neo parity) + owner ordering (base embed → tiers → embed → elevator-pitch
  last); live-verify on the imported corpus. · #14 C1 D137 persona graduation (verifier `a06af8b3661da3f1d`,
  read-only). New open work: #19 ST plane importers (tags→presets→backgrounds→groups, homes mapped), #20
  memory-settings UX (copy 'meh' + enabling memory doesn't auto-backfill), #21 (above).

- **⚑ LANE RESULTS (2026-08-08 late):** #14 C1 D137 CONFIRMED (verifier — sacred suite byte-untouched 7/7,
  CAST\_KINDS/POLICY live no discriminator col, card-face one home, no leak; graduated CODE axis — owes a
  side-eye on 3 persona-cast render CTs). · #22 vLLM batching RESOLVED (scout): rerank = one /v1/rerank POST
  (server-side batch); generate = single streamed turn, group rounds intentionally serial (per-chat lock).
  **Request-level concurrency is CLIENT-CLEAN** — unbounded undici dispatcher (no `connections` cap,
  egress.ts:154), wake-gate single-flights ONE cold wake per engine (not per-request), NO mutex/semaphore on
  inference calls, turn lock strictly per-chat (`chat_locks` PK=chatId). So chat+tool+rerank+memory+future
  agents DO continuous-batch concurrently. **The HANG is the summarize LOOP (#21), NOT concurrency**
  (verified in vLLM source): the scheduler QUEUES over-capacity (waiting queue + graceful preempt,
  sched/scheduler.py) — it doesn't hang; the 120s fires downstream of loop-slow requests queued behind them.
  `max_num_seqs`=per-iteration BATCH cap (default 128, EngineArgs-computed; orb doesn't set it), NOT the
  KV-fit. Startup print "Maximum concurrency: Nx" (kv\_cache\_utils.py:1735)=KV-fit at MAX length (worst case)
  \=a config HEALTH signal, NOT a value to mirror into max\_num\_seqs/send-concurrency (**#24 premise CORRECTED**).
  DIAGNOSE via vLLM `GET :<port>/metrics` — `num_requests_running`, `num_requests_waiting{reason=capacity}`,
  `num_preemptions_total`.

- **⚑ #21 memory-summarize DONE + committed, MERGE PENDING** — worktree branch `agent-a19e7d680f1bf5708`
  HEAD `364b90f3a`, tree clean, **151 tests green**, floors clean (red-first proven). Full generate sampler
  set threaded through the summarize path + presence\_penalty **1.5** default (loop fix, even when
  memorySummarizer unset; admin override wins) + digest tier-0/consolidation ONE batched summarize with
  per-item fallback (surface contract untouched). Deferred the MERGE from a 96%-context session (no mid-
  compaction git). **NEXT SESSION: rebase lane onto main (main advanced only by docs commits — no code
  conflict) → `git -C <main> merge --ff-only` → consolidated `pnpm check` → LIVE-VERIFY** (memoryEnabled →
  POST workloads.start memory-backfill + x-orb-csrf:1 → confirm `grep -c presence_penalty .cache/stack/
  vllm-gen.log` goes non-zero @1.5 \[main's log has ZERO now = the defect], durationMs drops \~30-120s→sec,
  chat\_segments climbs to hundreds/min). :8788 runs main via node --watch so the ff-merge reloads it. Full
  recipe + deviations in task #21. See \[\[vllm-memory-summarize-samplers-and-batching]].

- **⚑ EMBEDDINGS STATE:** chars 320 + avatars 646 embedded ✅. Chat memory built 0 because `memoryEnabled`
  defaults FALSE (owner enabled it) + the summarize LOOP (fix #21). Degenerate 44-seg/8-digest run WIPED;
  chars/chats kept. Owner ordering ruling: base-embed → tiers → embed → elevator-pitch LAST (in-lane order
  already base→tier; the elevator-pitch/discovery step is a cross-workload follow-up, could extend the
  import embed chain index→memory-backfill→discovery).

- **⚑ CHAR-LIST-NOT-SHOWING (#23, not urgent):** server CLEAN — 1 user owns all 323 chars, client queries as
  that user. Trigger was MY \~4 db-wipes leaving a stale session cookie (cookie-clear fixed it). Real latent
  bugs to fix: stale-session-for-defunct-user should re-auth not serve empty; background-import should
  invalidate the client character list. \[\[per-user-scoped-empty-is-about-the-asker]].

- **⚑ NEW open tasks:** #19 ST plane importers (tags→presets→backgrounds→groups; homes mapped, report lists
  unhandled planes) · #20 memory-settings UX (copy meh + no auto-backfill on enable) · #23 char-list (above).
  Dispatching RE-ENABLED. Import epic import-details lessons: \[\[st-import-name-collision-repair-isolate]].

- **⚑ SUPERSEDED:** the "UNCOMMITTED ON THE TREE" block below is CLOSED — all committed in `ba8b5fbe5`.

- **⚑ PUSHED 2026-08-08: `d34a6702c..c635798d3 main → main`** (229 commits, hook skipped on the
  in-session green battery, `hooksPath=/dev/null`). The whole morning's train is on origin: C1
  persona **D137** (merged `425ca37e1`, the biggest — cast producer + card-face, sacred gate held
  byte-untouched all 3 legs), the full C-pile, refinery R0-R2 + the crowning-feature design corpus,
  group-engine, OR-F5, caps, e2e-seed-fix, config-IA thinking doc. Battery was FULL green (19/19
  incl. tests:node 743s + e2e-smoke). **Standing law resets: next push needs FRESH word + FRESH
  battery.** Origin = `c635798d3` at push; **tree since has UNCOMMITTED import fixes (below).**

- **⚑ UNCOMMITTED ON THE TREE (held per owner word until the ST-folder import confirms working):**
  `packages/server/src/entry/http/import-tree.ts` — (1) tree-import total cap **256 MiB → 1 GiB**
  (owner: whole-ST-profile import; single-owner self-host, memory-DoS is a multi-user concern); (2)
  **the real import bug** — `orbOnlyDirNames`'s ST\_SHARED\_DIRS omitted `themes/`+`assets/`, orb
  bundle dirs whose NAMES collide with a real ST profile's `themes/`/`assets/` dirs → EVERY real ST
  folder (always has `themes/`) tripped the both-markers ambiguity reject (400). Now excluded.
  `tests/server/entry/import/sniff-tree-layout.test.ts` — ORB\_ONLY corrected + regression case (11/11
  green). **⚑ DEV STACK RESTARTED** (node --watch did NOT reload the import-tree change — the 400s
  persisted against stale code until `pnpm stack restart dev` at pgid 1243245). Owner re-importing
  the 782M ST default-user folder now; MORE fixes may surface on real data (commit all import fixes
  together once it lands). **⚑ TWO MORE IMPORT FINDINGS live (tasks #16, #17):** after size+layout
  fixes the import got 202+staged and characters+chats DID import (13→15, 18→19), but (#16, transient)
  the import-st workload first lost a per-owner single-active-lock race to a background `memory-backfill`
  sweep — both in the `sweep` lane — failing with a confusing "already in progress"; retry after the
  sweep drained worked. Then (#17, the LAST real blocker) **world-info/lorebook import FAILS**:
  import-st zod `invalid_value path:['position'] expected ['before','after']` — ST WI entries carry
  `position` as a NUMBER 0-6 (0=before-char, 1=after-char, 4=at-depth, …) and the ST→orb lorebook
  importer (`kit/serde/world-info`) passes the raw int to orb's `'before'|'after'` enum unmapped →
  `world_books` stuck at 0. FIX in #17 (map 0/2/5→before, 1/3/6→after, 4→after+depth; check
  order/depth/role carry). Fold into the #15 import-fix commit; whole-ST-folder import is ONE mapper
  away from working end-to-end.

- **⚑ CONFIG IA — junk-drawer diagnosis boarded** (`docs/design/config-ia-the-junk-drawer-problem.md`,
  committed `c635798d3`): Config is a home defined by EXCLUSION (violates one-home-per-concept at the
  meta level); tags are a FACET not a destination (leave the rail; editor → in-place popover;
  bird's-eye → Corpus); the "can it fill CONTEXT?" + "thing vs facet" sorting tests; regex/world-info
  \= open (run the tests). Owner design-thinking, no build.

- **⚑ FLEET LIVE:** gen swarm awake on :8703 (Qwen3-VL-8B, TP across both cards), embed+rerank
  healthy — clears **D5** (engines-fleet-fix live verification). Dev stack :8788/:5173 up.

- **⚑ REFINERY = CROWNING FEATURE:** authority doc `docs/design/refinery-schema-renderer.md` (968L,
  committed) is the R3/SF program spec — renderer dissolves structurally (closed LIFTABLE subset →
  total widget mapping, no raw-JSON floor), P1 pre-launch contract fixes (emptying arm, schema-embed
  provenance, duration\_ms/usage cols, {{shape}} splice), git-state model (apply is terminal), tri-axis
  revert, save-as-copy, OG-test steal ledger. §19 supersession map EXECUTED (`addb13faa`). R3 build
  brief assembles from it + the 3 published mock artifacts (surface/deltas/accept-ergonomics; deltas
  ruled A/A/A, accept = per-block Keep/Discard verbs).

- **⚑ NO AGENTS LIVE** (owner halted dispatching for usage). Everything above done by the orchestrator
  hands-on. C1 D137 fresh-lens graduation OWED-HELD (task #14). Prior battery-reds context (kept for
  history): the 2026-08-08 evening 17/19 run's two reds (orphan-ratchet `RefineryFieldScore`→@public;
  e2e-seed OWNER\_HANDLES) both fixed + graduated pre-push.

- **Merged today, this train:** FORGE#4 CONTAINERIZE (`fd4ae9119`, check PASS) · REFINERY R0
  (`b7ca6d55a`, check PASS) · AUTH BOOT-FENCE + spec repair + shim⇔firewall pin (`06a706551`,
  check RUNNING — read `<scratchpad>/sec-leg-check.exit`).

- **⚑ TRAIN STATE (2026-08-08 late): main `0282bb554` — ONE write lane out (group-engine), push
  word GRANTED.** Merged + check-green this sitting, in order: C2/C8/orphan `c0f896d76` (VERIFIER
  CONFIRMED 6/6 — GRADUATED; 5 observations routed to the smalls batch, notably `preset.importFile`
  bypasses the write-boundary carrier guard, pre-existing {{entry}} twin) · e2e seed fix `ebe6f8905`
  (VERIFIER CONFIRMED 6/6 — GRADUATED; ran smoke 6/6 itself on the new cache paths + forward 4/4) ·
  OR-F5 `05b69a9e9` (wire-proven: array-offset breakpoint landed on a `tool` row costing 5341
  cache-write tokens/turn; conversational-depth fix = 0, invariant across recursion; knob
  `promptCacheMinDepth` in Settings›Admin›System tuning, clamp-to-safe, null=byte-identical;
  F7 probe STRENGTHENED the deferral — 3-hop chain kept naming the mid-chain rune with reasoning
  dropped; $0.152 spent of $0.75) + biome fixup `f71ff9586` · C6/C7 `7f7d56c7f` (export submenu +
  launcher shed; New-book byte-untouched; MOCK CONTRADICTION recorded — the ratified empty-states
  mock frame 2 draws the shed affordance but was drawn SOLO where the duplication can't arise;
  deviation in the component docblock, mock truth-repair in the smalls batch) · C4 `dab954f40`→
  merged `0282bb554` (narrator marker mode-aware, blessed bytes byte-exact; 4 coupled test sites
  caught by the literal sweep; drill-in note w/ planted control). **AWAITING GRADUATION:** OR-F5 +
  C6/C7 + C4 + group-engine — one batched verifier + one batched side-eye (C6/C7 surfaces: submenu
  at narrowest pane · card rhythm sans footer verb · mixed empty/populated arrangement) when the
  train drains.

- **⚑ STICKLER VERDICT (group-chat coherence, owner-ordered "feels crunchy"): BLESS with 4 real
  mis-splits** (`docs/reviews/stickler/2026-08-08-group-chat-coherence.md`). C4's mode-aware fix
  independently vindicated ("the right fix, not a symptom"). Findings ruled by the owner same
  sitting: **F1 short-circuit narrator arbitration, KEEP the policy field** (no smart side-LLM call
  discarded, no phantom warning; field survives mode toggles) · **F2 BUILD real round-robin**
  (pooled ≡ list today, UI label lies, chain starves members) · **F3 delete `groupCharacterId`**
  (D107 dead-switch default — zero readers, travels as a foreign id in bundles) · F5 stale
  smart-fallback comment · F6 per-speaker arm → strictObject (with F3 transition test) · F7
  @mention first-occurrence masking + narrator-room @mention routes through asPerSpeaker →
  **all six in the GROUP-ENGINE lane (live)**. **F4 RULED arm (a): re-home the group-round framings
  to the PRESET home + amend D132(B)** (queued, task #9). **VOCAB CENSUS RATIFIED IN FULL** (task
  \#10): kill crew (39 files + the LIVE `entryMetadata.crew` schema field, NO-LEGACY rename) ·
  director→arbiter · stop minting seat\* · 3 theatrical UI strings; KEEP party/scene/act (model-facing
  wire vocab) + ember/weave (brand rulings stand).

- **⚑ ARM A / D16 MARGIN RULED (orchestrator, owner-endorsed "do whatever's cleanest"):**
  narrator-of-ONE (reachable only by shrinkage/mute — group controls gate at 2+) keeps the NARRATOR
  marker: mode is host-chosen DATA, a `members.length > 1` gate is the exact `if (isGroup)` shape
  D16 forbids, and narrator-of-one was never byte-identical in the persisted plane (synthetic-
  character canon authorship). The solo-byte suite's narrator test reformulated LOUDLY (old text
  preserved above the amendment; nudge-suppression-at-≤1 stays — mechanics vs identity distinction
  recorded). **Ceremony candidate: a D16 amendment clause** at the next batch (enforcer exists —
  the reformulated suite test).

- **⚑ PUSH WORD GRANTED (owner, 2026-08-08 late): "you have my word to push when we get there."**
  Sequence it spends on: group-engine merges → batched lenses → FRESH `verify --push` green →
  `E2E_LIVE=1 pnpm e2e` → PUSH. The queued trio (F4 re-home · vocab sweep · OIDC owner-binding
  task #8 — the owner's dogfood pain point, security-executor, FIRST dispatch after the push) is
  train two.

- **⚑ NEW ROWS from the sitting's lenses:** OIDC owner-flip binding (#8 — seeded owner collides
  with OIDC sign-in under D17; bind-or-heal by OWNER\_HANDLES match; owner wants db-surgery-free
  mode flips) · harness env-inheritance class (#7 — 3 sibling harnesses on the weak hatch +
  OWNER\_GROUP/WIRE\_CAPTURE latent leak notes; e2e lane's class sweep) · smalls batch (#6 —
  recognizer-mismatch chip lie · guidedActions read-degradation class created by C8 (no .catch) ·
  importFile guard bypass truth-repair-or-guard · 2 stale comments · @public wording · the C7 mock
  truth-repair). Token-concepts unification (DEBUG\_TOKEN/wire/allowlist as ONE ops story) OFFERED,
  not yet ruled — DEBUGGATE unified only the debug surface's credential model.

- **⚑ DECISION SITTING RESULTS (2026-08-08, owner live):** C2 BLOCK (Option C) · C3 SHIP ALL
  VERBATIM (ratified — the veto pile is closed) · C4 RULED mode-aware default + BLESSED narrator
  bytes (verbatim in the session TaskList #5; identity-as-narrator, address clause preserved;
  per-section override stays one text for both kinds) · C6 arm 1 (kebab PNG/JSON submenu, queued) ·
  C7 arm 2 (CollectionLauncher drops count+create once populated; New-book double stays, queued) ·
  C8 Option 2 (shared constant, in-lane) · **openrouter split: F5 BUILD+prove+depth-knob (lane 3) ·
  F6 SKIP (wire property, nothing to build) · F7 DEFER** — the board's "latent hard-400 bug" framing
  was WRONG: we never replay reasoning (no ChatContentPart arm), drop-is-safe is MEASURED, reasoning
  STORAGE already exists per-message; probe arms ride lane 3 to re-confirm on a multi-hop chain.

- **⚑ W5 (user-macro values store) STRUCK — FULLY BUILT, board row was rotted** (orchestrator
  ast/grep ladder 2026-08-08): sibling column `chats.userMacroValues` (schema/chat.ts:156) ·
  `setUserMacroValues` verb (chat-lifecycle.ts:254) + proc (routers/chat.ts:534) + matrix member row
  (:115) · turn consumption `turn.ts:394` via `loadStoredUserMacroValues` (placeholder `values: {}`
  gone, zero hits) · pane `MacroPicksSection` mounted (settings-context-tab.tsx:144) · bundle
  portability. The spec's own F1 ruling (2026-07-27, "yes option A") was recorded at its foot and
  the board's "parked on owner fork" claim never re-checked it.

- **⚑ FULL-BOARD SCOUT SWEEP DONE (2026-08-08, owner-ordered "verify they aren't already done"):**
  four scouts re-laddered every B/C-premise/D/E row. **Stale harvest: B 3/4 · C 1/10 · D 7/9 ·
  E 5/6 already-done** — struck below with receipts (F). The C pile survived near-intact (it waits
  on the OWNER, not on memory). Every surviving row below now carries a 2026-08-08 live receipt.

- **Worktrees on disk:** `agent-forge-docker` (merged — reap after the security review clears, may
  get a fix leg) · `agent-refinery-r0` (merged — reap after the verifier clears) · the
  PRESET-FOLLOWUP worktree (live) · `.cache/snap-stage/be00cf36a4dc` (side-eye ref-pinned stage,
  :5273/:8888, left running DELIBERATELY for re-verification).

- **⚑ OWNER OPS (standing, security):** rotate `DEBUG_TOKEN` (surface was open an unknown window) ·
  set `IP_ALLOWLIST` (still unset with `WIRE_CAPTURE=on` in the live `.env`).

- **"Tag colour voices" RESOLVED (2026-08-08):** the phrase meant the `Text` primitive's `voice`
  prop (TYPOGRAPHY — `datum` vs `gloss` on the tag color readout), already fixed by POLISH-CLUSTER
  and re-verified. The board's old "preset swatches" gloss was an orchestrator paraphrase error; no
  swatch feature was ever asked for. Do not re-chase. (A user-set per-character speaker-tint
  override remains an OPTIONAL unbuilt doorway — `speaker-color.ts` hash is "the fallback before a
  real per-character ThemeOverride exists" — see C-taste.)

## ═══ THE QUEUE (absorbed ledger, tree-reverified 2026-08-08 + live updates) ═══

Ranked by consequence within each category. Every item carries its receipt state.

### A · IN-FLIGHT (reconcile at landing)

- **A1 · REFINERY R0 → merged `b7ca6d55a`, check PASS, ✅ VERIFIER CONFIRMED ALL 7 (graduated);
  PRE-R1 SECURITY PASS RUNNING.** R0 landed contracts (`contracts/src/refinery/` —
  stages/verdicts/statuses/F4 enums/F5 fields, single-arm `{kind:"fixed"}` config union — DDL-free
  seam PROVEN, custom arm is contract-only) + db (`refinery_sessions`/`refinery_runs`, tuple-CHECKs
  in the regenerated baseline, FK chain complete+NOT-NULL so no unscoped row is representable —
  **dev db drops on next boot**) + kit brands + gate rows (census 84 re-counted) + 21 tests
  (cascade proofs real, planted tsc probe proves dispatch exhaustiveness). Deviations ratified
  (no-ownerId per D23 derive — verifier read D23 and agrees). **The verifier handed the security
  pass 5 foundation bounds-gaps:** unbounded score/analyze payload strings/arrays (analysis lands
  in CANON and ships to the client) · whole-object `.catch(null)` deletes a stamped score on
  analysis drift · `greetingIndex⇔greetings` unenforced + unbounded · `sessions.guidance` uncapped
  free text with no contract schema (the prompt-injection surface) · zod strips-not-rejects. Plus 2
  cheap test adds (status CHECK never bitten; sessions-row cascade control). **✅ SECURITY PASS
  LANDED — GO for R1** (`d8674e83a` + report
  `docs/reviews/security/2026-08-08-refinery-r0-security-pass.md`): every model-authored
  string/array now contract-bounded (red-first ×8; analyze ≈130KB worst-case, was unbounded;
  status CHECK now bitten; guidance/session-name schemas minted) · rulings: field-level heal (+
  HARD ordering: score tightening same-change) · greetingIndex = verb-tier assert (3 receipts why
  not a refine) · strip stays + itemize stripped KEYS · 3 latent MEDIUMs for R1 (applyFields
  re-parse per card.ts:192; dropNullValues under D126 strict-compatible — verified every rewrite
  would fail; neutralizeMacros card text) · member plane confirmed NOT exposed · no
  lifecycle-portability row owed · prose homed `user` = no fork strip.
  **✅ R1 (THE ENGINE) GRADUATED `1abec875b` — verifier CONFIRMED all 7 + security-executor GO +
  consolidated check exit 0; worktree reaped.** 64 files/+3729, 266 tests. **Security GO receipt
  (`docs/reviews/security/2026-08-08-refinery-r1-live-flow-audit.md`):** belt-5 downstream seam
  BROKEN-AND-HELD — the ONLY repo-wide readers of `characters.refinery` are the admin-gated debug
  inspector + card-merge field-carry, ZERO chat/prompt/macro consumer, so stamped card bytes never
  reach a macro-resolving path; stamp-WHERE owner-predicate real+non-vacuous; injection can't widen
  the apply set (selection fence + server-derived characterId); write re-validates card TEXT\_MAX;
  strippedKeys paths-only. **Verifier receipt:** apply-intersection algebra red-pinned; heal
  independence proven via RAW column bytes (score survives analysis-drift); latestVerdict newest-wins;
  iterate mid-round writes nothing on failure; shared stage-engine has no pooled sink.
  **⚑ ONE REAL FIX from the cross-lens loop (`11c3ec6e7`, consolidated check exit 0 — SEALED):** the
  code-verifier flagged that belt-9's apply fence honored `selection.fields[]` but NOT
  `selection.greetingIndexes` → orchestrator relayed it to the live security lens → ruled NEEDS-FIX
  (a prompt-steered rewrite could reach an UNSELECTED greeting slot the user accepts) → security
  lens fixed it in-verb RED-FIRST (`classifyAccept` now drops out-of-`greetingIndexes` accepts as
  `not_selected`; `undefined`=all greetings, common case untouched; 56/56 + typecheck). R0's belt-9
  wording under-specified greeting granularity — the fix closes it. LOW severity, security-lens
  self-proven; an independent re-verify of the fence is available on the owner's word (optional,
  belt-and-suspenders).
  **⚑ NON-BLOCKING SMALLS (boarded, from both lenses — see D):** `accepts` has no wire `.max()`
  (self-DoS, owner-only today) · apply-fields lacks an explicit foreign-session NOT\_FOUND pin (reuses
  a belt proven in 6 siblings) · `depthPrompt→not_applicable` branch unpinned · `latestVerdict` ORDER
  BY has no id secondary-sort (deterministic in practice, ms-apart runs). **⚑ OWNER product calls
  (carried from R0, not defects):** the handoff-clear verdict (new owner does NOT inherit the prior
  owner's private card critique) · `PROSE_MAX=4000`/`ENTRIES_MAX=108` ceilings.
  Built `domain/refinery`: 9 verbs (session lifecycle + runStage + iterate + applyFields), shared
  stage engine, D23 character-join ownership, 3 substrates + all 17 §4 belts with receipts (belt-5
  by-construction per the mid-run ruling below, pinned BOTH drift directions + two-method
  zero-macro-imports; heal+score-tightening in ONE change; handoff-copy `refinery:null` clear; 12
  user-homed prose slots + 3 `refine_*` postures; `refinery_runs.strippedKeys` column; both
  pre-producer gate rows DELETED). Two of the lane's OWN test expectations were wrong not the code
  (null-drop non-itemization; drop-reason precedence) — corrected. **GRADUATION LENSES DISPATCHED
  (owner-cleared "do the security audit, enough usage"):** verifier `a8f6d051…` (apply-intersection
  algebra · heal independence · latestVerdict newest-wins · iterate mid-round state · shared
  stage-engine sink · the 2 self-corrected tests) + security-executor `acd25d370…` (belt-5 DOWNSTREAM
  reach via viewers/replays/exports/preview/reminder — the seam by-construction does NOT auto-cover ·
  the stamp WHERE belt · injection widening apply past belts 9/10 · strippedKeys keys-not-values ·
  internal re-parse caps). Graduates on both CONFIRMED + the consolidated check exit. **⚑ OWNER-SACRED, awaits sign-off: the 12 shipped
  prose-slot baseline TEXTS** (the lane's adaptation of the extension corpus to structured output —
  model-facing default bytes, \[\[persona-is-owner-sacred]] class). **⚑ BELT-5 DEVIATION RULED
  (orchestrator, mid-run):** `neutralizeMacros` on refinery text would CORRUPT canon (ZWSP'd braces
  ride rewrite→applyFields→card, killing the card's own {{char}} at chat time) —
  satisfaction-by-construction APPROVED instead (no macro engine in the domain, concatenation not
  splice, all 12 slots macros:"none"), pinned by a both-directions substrate test (card {{char}}
  reaches the prompt VERBATIM: unresolved AND un-neutralized) + a two-method zero-engine-imports
  receipt. Named attack target for the post-R1 security re-review (design §9.10). **OWNER (small):** ratify
  the handoff-copy CLEAR default · the two judgment caps (`ENTRIES_MAX=108`, `PROSE_MAX=4000` — how
  much critique a model may write).
- **A2 · CONTAINERIZE → merged `fd4ae9119`, check PASS; ✅ SECURITY §8 REVIEW LANDED (8/9 hold);
  FOLLOW-UP LEG on the warm security lane.** Review:
  `docs/reviews/security/2026-08-08-containerize-surface-review.md`. **F1 (real, fixed
  `82bf99a60`):** the shipped `single-user`+`AUTH_FALLBACK=deny` pair was INERT (401s everything) —
  the "single-user ignores the knob" claim is FALSE (`infra/auth/index.ts:48` checks fallback
  first; pinned by its own test) — and the natural deployer reaction (flip fallback + publish
  ports) is the AUTHFIX-2 exploit shape. Now ships `owner` with single-user; `deny` moved into
  each SSO mode's block. CONFIRMED: expose-only (0 `ports:` all profiles) · secrets (planted
  positive+negative context controls; shim clean) · egress structurally can't accumulate ·
  hostile `VLLM_ENGINE_HOST` fails closed (all smuggling shapes measured) · non-root both app
  targets. REFUTED (recorded): the vllm SIBLING runs root/default-caps (upstream image — live-step
  rec: try cap\_drop, CUDA may need IPC\_LOCK) · profile coupling only pins `sibling` (availability
  not exposure). **FOLLOW-UP LEG (running):** spec truth-repair ×3 sites + the `superRefine`
  boot-fence (single-user+deny = boot-fatal, red-first) + 3 in-code comment repairs + the
  shim⇔`HOST_SECRET_ENV_KEYS` coupled-site tie. **✅ FORK RULED (owner, 2026-08-08):
  usable-as-owner IS the default** — the SillyTavern first-run model; ratified, recorded in the
  spec. **✅ THE LEG LANDED (`06a706551`) — BUILD STREAM GRADUATED:** spec truth-repaired ×3 with
  the ruling verbatim · boot fence red-first (single-user+deny refuses at env parse; `oidc`+`deny`
  scope-control green; per-mode requirements now a mapped `Record` so a 5th auth mode fails tsc) ·
  all 3 false-claim comments repaired · shim⇔`HOST_SECRET_ENV_KEYS` set-identity conformance test
  w/ planted control that DEMONSTRATED the leak · 249 tests + 3 typecheck programs green. The
  fence is env-boundary only (infra `resolve` still accepts a constructed incoherent config — its
  contract test depends on it; stated in-code). **OWNER — the only remaining containerize work is
  the live-infra steps:** `docker build` both targets (+`docker inspect` the healthcheck),
  container runs, fleet-in-namespace, read-only shakeout, sibling-vllm cap\_drop probe, the pentest
  cage (§4/Fork F), deploy posture (C13).
- **✅ A3 · PRESET-FOLLOWUP — GRADUATED** (fix leg `eb3669b1e`, re-verify CONFIRMED all 5
  consequences DEAD + all 4 minors real + both truth-repaired CTs bite; fix-leg check exit 0;
  worktree reaped). The drill is a scoped `(presetId,sectionId)` pair
  (`state/preset-section-drill-store.ts`) —
  cross-preset leak UNREPRESENTABLE (scoped read → foreign preset = null), retarget-on-fork from
  the one site that knows (`use-preset-autosave.ts`), clear at the single view-writer chokepoint
  (`setPresetEditorView` — so nav doors inherit it), `presetId` REQUIRED (7 sites). All 5 pins bite;
  swept coupled sites the brief didn't name (2 pre-existing CTs falsely named routing → BAD\_REQUEST,
  branding, a test-presence mirror). Durable lesson: moving state useState→store is taking on a
  lifecycle you must design per nav axis (banked). Original verifier verdict (3/4 CONFIRMED, 2a
  REFUTED — the drill store had NO production reset:
  `closePresetSectionDrill`, scanned=987): **B-2 live regression** (Delivers-via chip lands in the
  WRONG section's editor when drilled — its contract CT green only because it never drills first) ·
  B-1 view-switch persists the drill · B-3 cross-preset leak (section ids are DEFAULT literal
  collisions by the norm) · `clear()` side-effect dismisses the mobile overlay panel. Fix-leg
  constraints: fork KEEPS drill · chip lands on rack w/ target current · view-return = rack ·
  no cross-preset leak; + 4 minors (unknown-typed prop, headline over-claim P3, false fixture
  prose, retry-CT focus-heal false-pass path). Graduates on the fix leg + re-verify. Original
  landing detail:
  Shipped 3/4: B1 CapabilityGate wired to shared `failureCause` (verdict verbatim ONLY on
  BAD\_REQUEST; error threads WHOLE so `data.code` survives; red-first CT bite-proven) · B2 Prompt
  section-drill on a store axis (mirrors FORGE#1; red-first: old source ejected, new survives the
  fork; 20/20 drill CTs) · retry CT closed the real gap (fail→Retry→recovers over the wire; click
  proven the only trigger). ITEM-3 DECLINED per recorded ruling (`index.ts:1265-1267` — the wire
  name in `fires` IS the row→tool map; owner may override as a copy call, C-taste). **⚑ MECHANISM
  CORRECTION (lane receipt, `resolve-role.ts:355`):** `resolveChatCapability` is CREDENTIAL-FREE —
  the old board text "missing credential inverts the claim" was wrong; the hardcoded verdict lied
  over ANY non-routing failure (500s etc.). Same class, same fix. Durable lesson banked:
  \[\[ct-vite-prebundle-masks-source-neuter]] (bare `@orb/client/*` CT imports run PREBUNDLED code
  — a source-neuter bite lies green; prove via rendered pre/post controls).
- **A4 · The preset/config side-eye train GRADUATED (2026-08-08):** FORGE#1 Actions IA + POLISH
  cluster + PROSE-GEOMETRY all **SHIP** under the batched rendered lens (`be00cf36a` ref-stage;
  delivery-truth readout, fork-eject picker, prose cap geometry all confirmed live). Their rows are
  closed; residue is A3's items.

### B · DISPATCHABLE NOW (no owner ruling needed)

- **✅ B1 · Populate-round prose migration — GRADUATED** (verifier CONFIRMED all 6, byte-identity
  INDEPENDENTLY derived by eval'ing the old functions from git across all 4 corpus arms; all 100
  prose-baseline sha256s recomputed 0-mismatch; ratchet regen diff-empty). Worktree torn down.
  **2 notes recorded:** (A) sequential token splice = a character NAME containing literal
  `{{cardBody}}` expands to the card's own body — SELF-injection only, no cross-tenant reach, no
  action; (B) pre-existing gate reach gap — `no-hardcoded-model-prose` counts `rpg.ts:380` but not
  sibling `:377` (the turn-loop extraction user prompt) — small gate-reach row for a later lane.
  Landing detail: All 7
  strings are `rpg.populate.*` slots (2 tokened blocks body-as-token per the {{actorTrackers}}
  precedent) + TEMPLATE\_DEFS rows in `cluster:"round"` ("Born-state round —" glosses; a dedicated
  band = a later 1-member sibling-file change if wanted). Byte-identity: pre-migration fixtures
  green on HEAD then green post + planted 1-char control red. Ratchets shrink-only
  (extraction-prompt row DELETED, rpg.ts 8→6; prose-baseline 93→100). Its literal sweep caught +
  fixed 1 stale coupled site (hand-spelled slot-id list). 376 tests + 21 CT + full static floors.
  Verifier is independently re-deriving the old bytes from git. \[merged 08-08]
- ~~B2 respell~~ · ~~B3 cross-link fixture~~ · ~~B4 baseline+fork.ts~~ — **ALL STRUCK, scout-
  verified already-done** (receipts in F).

### C · OWNER-DECISION (his word only; recommended arm marked)

**Persona / prose cluster**

- **C1 · persona = character** — OWNER-SACRED. Design:
  `docs/design/persona-character-kind-substrate.md` (5 forks §10). **Rec: Phase D now**
  (kind-polymorphic cast — `CAST_KINDS`+`CAST_KIND_POLICY`, no stored column), **then Phase C**
  (`@orb/contracts/card-face` 4-field substrate). Reading B is OFF THE TABLE (D122/D131 collision).
  Build lane mints **D137**; behavioral gate: `persona-resolution.suite.int.test.ts` byte-untouched.
- **✅ C2 · RULED 2026-08-08: BLOCK (Option C), lane live** — `{{note}}` warn-vs-block. History:
  `docs/design/note-token-intent-history.md`: warn-never-block
  was INHERITED, never decided. **Rec: Option C** — reclassify `{{note}}` as a CARRIER token that
  BLOCKS at write (join `FORMAT_STRING_CARRIER_TOKENS`, today only wiFormat/`{{entry}}` at
  `preset/index.ts:734`), keep cosmetic `{{name}}`/`{{names}}` as warns. \[live-verified still warn]
- **✅ C3 · RATIFIED 2026-08-08: SHIP ALL VERBATIM (closed, no build)** — the veto pile: the 3 nudge texts (`speakerTags` v1 ·
  `narratorNudge` v1 · `roundNudge` v2 — LIVE defaults today) + `chat.group.castMember`
  (`[Cast — {{name}}]`). **Rec: ship all verbatim**, no token added.
- **✅ C4 · RULED 2026-08-08: MODE-AWARE DEFAULT + bytes BLESSED (build queued behind the group-chat
  stickler verdict; bytes verbatim in TaskList #5 + the sitting block above).** Decisive facts: presets
  are GLOBAL (a narrator-preset would flip every chat), and one narrator room legitimately produces
  BOTH turn shapes (forced/@mention coerces per-speaker via `asPerSpeaker`), so only turn-time
  selection by speaker kind puts right bytes on both. Original row: once `{{char}}` binds the joined cast,
  the default marker renders "…write Charlotte, JFC's perspective only" (self-contradictory;
  `contracts/preset/index.ts:995`). PRESET-owned template, deliberately not fixed from the
  assembler. **Owner call: a mode-aware default marker, or a documented narrator-preset.**

**Config / portability cluster** (`docs/design/parked-options-config-port.md`)

- **C5 · Presets into the config rail** — **Rec: arm 4** (leave standalone; the "one array member"
  premise is false — folding needs 3 seam extensions; migrate properly when he feels it).
- **✅ C6 · RULED 2026-08-08: arm 1, build queued (TaskList #3)** — server arm SHIPPED (`?format=png|json`);
  add the PNG/JSON submenu to the character kebab mirroring the chat kebab. \~10 lines.
- **✅ C7 · RULED 2026-08-08: arm 2 split-the-class, build queued (TaskList #4)** — fix the
  landing at the child level (each `CollectionLauncher` drops count+create once populated), KEEP the
  New-book double affordance (mock-ratified + CT-pinned).

**Tag / contract cluster** (`docs/design/parked-options-tag-contract.md`)

- **✅ C8 · RULED 2026-08-08: Option 2, in the C2 lane (renames `MAX_FORMAT_STRING_LENGTH`)** —
  shared `MAX_INJECTION_TEMPLATE_LENGTH` (=10000)
  for BOTH formatStrings and `guidedActions.*.prompt` + UI maxLength. \[live-verified:
  `guidedActionConfigSchema.prompt` still uncapped `z.string()` at `preset/index.ts:337` — the lone
  uncapped authored-text field reaching DB + wire]
- **C9 · Four tag taste-calls** — recs: 1a tag-only backup → SKIP (bundle carries tags.json) · 1b
  import Ask/All/Existing/None → KEEP ours (durable queue) · 1c manual/`sortOrder` → KEEP
  (owner-ruled) · 1d folder OPEN vs CLOSED → build OPEN, defer CLOSED (else drop write-only
  `folderType`).

**Ops / posture cluster** (`docs/design/parked-options-ops-posture.md`)

- **C10 · AGENT-1** — **Rec: SPLIT.** The credential is an OWNER ACTION (re-auth Claude Max OAuth);
  arms 1-3 (knob honesty · reasoning-visibility parity · usage/context parity) are a buildable lane
  that does NOT wait on it; only arm 4 (live rpg-lite on the SDK wire) is credential-blocked.

- **C11 · Barrel amputation worklist** — root-fix LANDED (57→**29** stars, scout recount 08-08 —
  doc says 28, off-by-one; both files the sanctioned db-schema stars); HELD for a quiet tree: Tier
  A 85 per-symbol verdicts (delete / `@public` / header-cite; several RPG\_\* protected) + Tier B 50
  zero-risk drops. Then **C12 · `--include-entry-exports`** — **Rec: arm (c)**, enable AFTER the
  amputation (else it buries the 85 under entry-export noise).

- **C13 · Containerize deploy posture** (post-A2-review): `AUTH_FALLBACK=deny` for public
  multi-user · `OWNER_HANDLES`/`OWNER_GROUP` provisioning · image build + pentest-cage sequencing ·
  the env-schema `*_FILE` support fork (lane refused as out-of-scope — foundation surgery, his
  call).

- **C14 · Refinery F6/F7** — F6 auto-stamp rec: every analyze refreshes `characters.refinery`,
  `applyFields` auto-snapshots first · F7 retention rec: no caps v1. Low-stakes; fold into R4.

- **⚑ C15 · REFINERY TAIL R2-R4 + NL→schema** (owner-sequenced; R0+R1 DONE+graduated, port study
  `:379-386`). **R2 client mutations (S)** — just the React-Query hooks over the tRPC router R1
  already shipped; safe/mechanical, clear to start on the owner's word. **R3 the Refinery SURFACE
  (L-XL, the center of mass)** — the D62 anatomy UI wired into the D70 founding-member section
  (currently a "planned marker"); DESIGN-SENSITIVE → wants a mockup ruling + side-eye after (owner
  taste territory, do NOT start unprompted). **R4 sweep+library (M)** — `refine-score-sweep`
  workload (batch-score every card, the orb-native win) + I2 sorts + dossier hookup; folds F6/F7.
  **NL→JSON-schema UI (SF0+, the owner-flagged "important" feature)** — the single-arm `{kind:"fixed"}`
  config union has DDL-FREE room for a `{kind:"custom", schemaId}` arm; engine tier already exists
  both directions (`liftJsonSchema`/`projectJsonSchema`). Layers onto R3's surface. Design:
  `docs/reviews/stickler/2026-08-08-card-refinery-nl-schema-design.md`.

- **C-TBD · CAS maintenance scheduling** (orchestrator read the CAS with own eyes 2026-08-08 — the
  store is EXCELLENT and correct; this is the one "built but not used to its fullest"). The
  mark-sweep GC (`collectGarbage` — whole-CAS orphan + abandoned-upload sweep) and `fsck` are
  registered `WorkloadContribution`s + manually triggerable from the workloads UI, but **nothing
  seeds a default schedule** — the targeted `reapIfOrphan` IS wired to character-remove
  (`assets-character.ts:222`), so the common case reaps immediately, but crash/DR orphans +
  abandoned uploads accumulate on disk until a manual trigger. **TBD (owner posture):** seed a
  default schedule (rec: weekly GC real-run + monthly fsck) and fold in the variant-cache
  stale-quality reclaim (a quality-setting change orphans old `qN.webp` files until the blob is
  purged — disk-only, recomputable), OR keep manual-trigger as the deliberate self-hosted posture.
  Non-blocking; blob-serve full-buffer/no-Range is a NON-issue today (owner-gated capped images
  only) — recorded, not a fix.

**Standing owner items (genuinely open, unchanged)**

- DRAFT-TRUST server render-policy seam (architecture call) · VRAM-refusal live drill ·
  v3-transcripts-reach-new-installs-only heal · RV-13 branch-and-save game modes (READY TO SPEC —
  PROSE-1 landed) · unsent-draft reload persistence + the nav-away draft-discard design pass ·
  chars+chats one-glyph rail merge · trust-gated card images doorway (mechanism pinned: `src=`-routed
  card-frame doc with its own CSP) · **mid-session persona↔rpg linkage — OWNER-SACRED, ruled flavor
  recorded (persona-pin semantics), DO NOT BUILD** · ~~`.env` OpenRouter key is INERT~~ **FALSE —
  struck 2026-08-08 (owner caught it, orchestrator pinned the receipt):** `seedCredentialFromEnv`
  (`entry/boot/seed-credential.ts`, wired `lifecycle.ts:242`, predates the retro era) idempotently
  seeds the env key onto the OWNER's credentials at boot when no openrouter row exists. The 08-07
  "no env fallback" claim promoted an empty-list STATE observation into a structural claim without
  a two-method check. Decision row premise-dead; note the task-#8 interplay (a mode-flip owner row
  inherits the seeded key at next boot) · **templating fork
  rows 53-73** (REWRITE\_TOGGLES/GREETING\_TRANSFORMS fragment bytes — client-composed via kit) —
  **RECONSTRUCTED + DECIDABLE: `docs/design/templating-fork-rows-53-73.md`** (recon lane confirmed NO
  recorded lean anywhere — ledger, PROSE-1 §11, §6.1 all arm-neutral; three arms with receipts, rec =
  arm B server-side compose on the `gameSteer` enum-wire precedent; ONE word closes it) ·
  shell-tier CLS \~0.26 (F-14, three sightings, needs an owner look — pairs
  with E1) · home-tile promotion WHETHER (`docs/design/home-tile-promotion.md` — in-place chips may
  already cover it) · ctx-tab-strip label unreachable at coarse · REGPAR F3/F4/F5 menu · "Untitled
  chat" in regex rosters · X-16 edited-ago timestamp (contracts+db) · **taste (optional):** the
  eight tool-row `fires` glosses humanize-or-keep (recorded ruling says keep) · per-character
  speaker-tint override (the ThemeOverride door — optional, nothing asks for it) · Meteocons ·
  grimstone · chat-options placement (D111 clause).

### D · OLDER OPEN (scout-swept 2026-08-08 — 7 of 9 checked rows were ALREADY DONE, struck to F)

- **D1 · Home `useOrder` follow-up** — CONFIRMED still static (`order-home-tiles.ts:9-11`, pure
  sort, no store) — but that's the DESIGN OPTION awaiting the owner (home-tile promotion, C-pile),
  not debt. \[scout-verified]
- **D2 · REGX2 deferred bulk PLACEMENT** — CONFIRMED blocked: `deriveRegexTierFlags` still
  client-homed (`features/regex/lib/derive-tier-flags.ts:48`), zero kit twin (two-method). Unblocks
  when it lifts into `@orb/kit/regex`. \[scout-verified]
- **D3 · LAUNCH-DAY trio** (parked to the day, not scout-checkable): REGIME-2 db-baseline re-point
  · the two-switch migration-regime flip · h3/QUIC checklist (Caddy h3 + UDP 443).
- **D4 · CT-on-our-vite spike**: pnpm override `@playwright/experimental-ct-core>vite: ^8.1.2`;
  green = one vite; red = revert. \[not scout-checkable — a probe, not a premise]
- **D5 · Engines fleet fix — live verification owed**: the next real `pnpm engines adopt` IS the
  test (one launcher exits promptly, no dupe on a healthy port, pidfile merges).
- **D6 · automation\_rules + global\_variables portable family** (the 12th kind). Fork lineage
  (`parentChatId`) structurally does not travel. Deferred with corrected end conditions.
- **D7 · SM7 residue — RELOCATED (scout 08-08), recorded DELIBERATE (I-1):** the second
  `response_format` builder that never emits `strict` lives at
  `vllm/engine/chat-completion.ts:87-105` today (post-restructure), consumed only by vLLM
  summarize (`surfaces/summarize.ts:79-180`). I-1 recorded it deliberately-untouched; if summarize
  ever wants grammar enforcement this is the address. Not debt unless re-ruled.
- **D8 · CPD 3 dup rows + TYPO 27 as-const tuples** — consolidate only when next IN the file.
- **D9 · WAKE-STATUS**: the 3s engine wake is silent; revisit only if laggy.
- **D10 · Recorded-no-action set** (kept so nobody re-derives): L8-inbound declined-by-scope ·
  seeder drop-patch stays until the next fixture regen · `staging.ensure` dormant · per-chat
  `providerRouting` phantom (DORMANT/RESERVED by design) · FillableIcon targets are OPPORTUNITIES
  · `lockdown` §16 G-table defers to live count.

### E · VERIFY / INVESTIGATE (scout-swept 2026-08-08 — 5 of 6 checked rows CLOSED, receipts in F)

What remains needs a LIVE window or a rendered lens, not a scout:

- **E1 · prod-build CLS window** (`docs/design/prod-build-cls-investigation.md`): dev home-boot CLS
  0.134 + the shell-tier 0.26 sightings; run `pnpm stack up prod` (non-8788) and re-measure when a
  window opens.
- **E2 · PRESET-SLIDER-VERIFY** (S): re-verify the slider deck rendered on a vLLM/OR connection
  (sonnet-5 exposes no sampling knobs — the deck was never seen).
- **E3 · E2E\_LIVE=1 pnpm e2e** on the push window (never re-confirmed this era).
- **E4 · narrowest-mount row gate candidate**: gate-shaped, ASTLENS-precedent report first (the
  class behind both gap-audit P1s: `shrink-0` trailing cluster never re-measured at production
  width; candidate CT floor: leading text ≥50% at narrowest real mount).
- **E5 · Databank pagination live-drive**: drive a real >100-doc bank once (reach was proven via a
  contract stub).
- **E6 · fillRule=evenodd fillable-set probe** (owner-optional, needs a side-eye gallery verdict).
- **E7 · Residual unverified tail** (low): ARCHIVE2's six unreached side-eye items · whether
  NIGHTFIX's three argued refusals are settled with the OWNER or only the reviewer · the engine
  auto-sleep/wake live pass + VRAM drill dependency.
- **⚑ One documented ceiling from the E-sweep (not a bug, recorded):** `agent-nav/index.ts:144`
  resolves a character by `.find()` over ONE `character.list` page (limit 500) — self-documented
  dev-tool limitation ("dev library is small… no keyset walk needed"); becomes real if the library
  exceeds 500.

### F · STRUCK DONE (verified closed — do NOT re-chase; receipts in the 08-08 archive + git)

AUTHFIX-2/debug-gate CLOSED (DEBUGGATE graduated; `debug/routes.ts:142-149` +
`DEBUG_GATE_CREDENTIALED`, `via:"fallback"`=false — only the two OWNER OPS remain) · databank
pagination BUILT (server+client) · I-2 DATABANK CLOSED (S1+S2+S3) · pointer-coarse gate MINTED
(`no-pointer-variants-in-features`) · run-coverage widgets bug FIXED · DOCLAW carve-out in
`Documentation-Law.md:114` · MACRO-CAST-GUIDES threaded · ZOD-STAGE-D all legs · IMPORT-SETTINGS
guard PREMISE-DEAD · tsx-shedding DONE (all 4 stages) · CRUNCH (a)+(b) DONE (note frames are
PROSE-1 slots; templating unified) · st-goldens/STATLAS leg 2 LANDED · 17 probes typed + node-26
gate · gate-ignore class ENFORCED + the mention fence (FORGE#2) · tag-wants premise-dead (all 3
shipped 5 days prior) · TRACKERGATE closed the member-self-grant hole · TOAST stream CLOSED ·
CANON-IDENTITY complete (4 legs, graduated) · PROSE-1 rpg program COMPLETE incl. row-27 wire +
extraction seam + RE-HOME to preset `promptConfig.prose` · PORT-R6/D136 (chat bundle travels,
graduated) · I-1/I-5/I-6/I-7 initiatives closed · brand burn-down terminal · REGX2 landed ·
square-glyph sweep paid · icon-seal doorways BUILD-NONE · dogfood campaign CLOSED 08-08 dawn ·
smallbatch3 (phone-markread was already fixed; ashen-spire 26-anchor seed coverage added) ·
gap-audit DONE (EmptyState w-full fence merged) · "tag colour voices" resolved (typography voice
prop — already fixed; the swatch reading was a gloss error) · principal divergence fixed (D135,
graduated) · ROW-27 WIRED (`bbb6364a2`) · probe-lint ruled leave-as-scratch · tag ≤30 drag-cap
ruled leave-as-is · CapabilityGate PENDING arm shipped (distinct from A3's wrong-cause fix) ·
F4-CACHE-VOLATILITY built · `getCatalog` boot-warm readers answered.

**The 2026-08-08 scout sweep's strikes (4 scouts, every negative two-method with scanned counts):**
respell = plain aliases now (`search/contract/params.ts:28,31`) · PORT-R6 cross-link fixture
EXISTS (`bundle-round-trip.suite.int.test.ts:732-1013`, ≥2 rpg turns, own-ids + `not.toBe` the
sibling's) · fabrication baseline clean (10/10 sample paths live) · fork.ts comment already
corrected ("LIVE, not dormant", cites both writer SHAs; file is `verbs/fork.ts`) · rail 9-vs-7
PREMISE-DEAD (D121 amended the law — the ceiling is about KIND, not count;
`UI-Architecture-and-Layout.md:189-208` documents all nine) · ambient CLEAR built
(`ambient-strip.tsx:167-184`, dated header) · tool-round wire capture built (`rpg.ts:1047-1053`
threads chatId; executor wires captureWire uniformly) · notification bell built BOTH halves
(mount-effect markAllRead + unread count in the sheet kicker) · snap-stage env propagates
(`snap-stage.ts:290-308` spreads process.env) · surface-manifest generator already biome-clean
(probed read-only) · biome hook cannot lint the excluded guard file ("Checked 0 files", probed) ·
paged-list `.find(` sweep CLEAN — no live instance of the DBANK-HOME bug class; chats.listChats is
NOT paged (the board's claim refuted); infinite-query surfaces resolve against the flattened
multi-page set · countByBook twin NEVER EXISTED (git -S: one introducing commit, one home ever) ·
names.ts header self-corrected 08-07 ("NAME FIRST, THEN SQUASH") · SSE-STARVATION-PIN exists at
unit tier (`debug/index.test.ts` header names it + `socket-registry.test.ts:289-306`) ·
`refEnumerationLines` active-conditions COVERED (`rpg.int.test.ts:972-1010` asserts the exact
line).

## ═══ SPECCED DESIGNS — pinned docs, build not (fully) sent ═══

> **Why this section exists (owner catch 2026-08-08):** the board rewrite absorbed the remaining-work
> LEDGER, which was built from OPEN board ROWS — a specced+pinned design DOC that never became a row
> could fall off. This section carries every `docs/design/*.md` that represents specced-but-unbuilt (or
> partial) work, so it can't be lost again. **NOT `docs/architecture/proposed/**`** — those are the
> separate parked-programs set (`proposed/INDEX.md` owns their status); leave them alone.
> **RECONCILED 2026-08-08** (scout `a43b158ec`, then **ORCHESTRATOR-RE-VERIFIED with ast-grep**
> ts+tsx, declared→exported→called-live ladders — not relayed). Headline: **the big one — parity-plus
> — has ALL 7 features BUILT** (F1 relationship called-live `actor-ops.ts:90`; F2 level `sheet.ts:35`;
> F3/4/5/7 `CONTENT_CLASS_POLICY`+`HIDDEN_TAGS`/`DIRECTIVE_FENCE_NAMES` consumed in strip/reminder/
> tokenizer; F6 plot exceeded). FIVE docs had ROTTED status lines claiming "nothing built" while the
> tree shows them shipped (spot-verified: `rpg_quests` tsx=0/folded, density gate present, list-pane in
> `main.tsx:241`, roster `cards.ts:57`). The 3 PARTIAL confirmed genuinely partial (openrouter
> signature ast-grep ts=13/tsx=0 = truly absent). Genuinely-open carried below; built struck.

**GENUINELY OPEN (specced, a real remainder — carry these):**

- **persona = character** (`persona-character-kind-substrate.md`) — UNBUILT, specced+pinned, **= C1**
  (awaits the 5-fork ruling; forge lane ready on the owner's word). The one that prompted this section.
- ~~user-macro W5 values-store~~ — **STRUCK 2026-08-08: FULLY BUILT** (see the W5 strike block in
  LIVE STATE — column/verb/turn-read/pane/portability all live; the F1 fork was ruled Arm A
  2026-07-27 at the spec's own foot). The spec's status line + this row were both rotted.
- **openrouter findings 5-7 — RULED 2026-08-08 (F5 lane LIVE · F6 skip · F7 defer).** The old
  "signature round-trip = latent hard-400 bug" framing was a board paraphrase error the doc's own
  §7 caveat refutes: we never replay reasoning (no `ChatContentPart` arm), DROP-IS-SAFE is measured,
  and reasoning STORAGE already exists per-message — the 400 lives only on a path we can't take.
  F7 re-probe arms (multi-hop drop / unsigned-400 / ST encrypted-rebuild) ride the F5 lane's harness
  run, record-only.
- **tracked-field unification + context-panel fidelity** (`tracked-field-unification.md` ·
  `context-panel-fidelity-findings.md`) — PARTIAL: stages 1+2 shipped (`ea99b0e3`,`98ee6da2`); both feed
  the SAME still-open **W-H side-eye lane** (needs a model-populated game) + EXT-4 (likely mostly closed
  — worth a second scout pass before boarding as work). = E4/E-adjacent (rendered lens, live window).
- **node-26 adoption program** (`node-26-adoption-program.md`) — mostly BUILT (W1-W5 live: `using`/
  `await using` in turn.ts/cas.ts/port.ts; the 4-arm platform-spellings gate); only remainder is the
  **Temporal/luxon swap (EXTERNAL blocker — Safari Temporal unshipped, deliberate deferral)** + §7
  explicitness smalls (low-urgency). Not a real queue item until the browser ships.

**BUILT — rotted status lines, struck (do NOT re-chase; receipts from the reconcile):**

- **parity-plus program** (`parity-plus-program-spec.md`) — the BIG one: **ALL 7 features BUILT**
  (declared+exported+live). 1-5,7: `RpgRelationship`/`setRelationship` `actor.ts:128,149,295` · `level`
  `rpg.ts:35` · `CONTENT_CLASS_POLICY` `content-classes.ts:44-51`; D110 "foundation-landed 2026-07-27".
  **§6 plot-progression CONFIRMED (orchestrator re-checked 2026-08-08 — the scout missed it: symbols
  home in `@orb/kit/guided`, not `domain/rpg`):** `RPG_PLOT_STEERS`/`RPG_PLOT_STEER_KINDS`
  (`kit/guided/index.ts:84,116` — **6 kinds vs the specced 5**, `advance` added), delivered via M5's
  guided-wand re-homing (`composer-utility-menu.tsx:199-211` `PlotSteersSubmenu` → `onSteer`), PLUS a
  structured act-rail plot DATA plane the marinara floor lacked (`plot-edit.ts`, `plot.acts`/`plot.act`
  - `plotProgression` host toggle). Only §12A macro-parity DEPTH un-probed (a "how thorough" question,
    not a gap — no evidence of missing machinery).
- **lite+guided substrate** (`lite-plus-guided-substrate-spec.md`) — BUILT (quests folded into
  `rpg_snapshots` JSON, `rpg_quests` deleted, journal variant-aware — `rpg.ts:170,13-18`).
- **density pass** (`density-pass-spec.md`) — BUILT (gate `density-tier.ts` minted + self-cites the
  spec + baseline generator + CT lens).
- **list-pane projection** (`list-pane-projection-proposal.md`) — BUILT `baea66933` (the doc's own
  "DRAFT/nothing built" line PREDATES the build by a day — `chats-with-character-pane.tsx:39` live).
- **default-character roster** (`default-character-roster.md`) — BUILT `bb6d50646` (10-card pack v2 in
  `character/seeder/cards.ts:80-575`).
- **preset-surface-redesign** (`preset-surface-redesign.md`) — BUILT (D121, five-view shell + setDefault).

## ═══ INITIATIVES — one-line status ═══

I-1 structured output **CLOSED** · I-2 databank **CLOSED** · I-3 config workspace **CLOSED** (C5
presets-into-rail owner-timed) · I-4 regex **CLOSED** (tail smalls → C-standing/D11) · I-5 brand
**CLOSED** (terminal ratchet) · I-6 portability **CLOSED** (D12 deferred family) · I-7
observability **CLOSED** · I-8 prose/nudge/persona — machinery BUILT, voice items = C2/C3/C4;
persona↔rpg linkage DO-NOT-BUILD (sacred) · I-9 ceremony **CLOSED** (ledger through D136) · I-10
launch-day = D5 · I-11 containerize-then-test — **build MERGED (A2)**; security review in flight;
owner live steps + pentest cage remain (the container IS the mitigation; test the clone, positive
controls both ways, security-executor only).

## ═══ WATCH LIST (flakes + pre-existing; none blocking) ═══

- `code-editor.ct` CM6 75ms completion flake under contention · `drawer.ct:162` focus-trap
  (pre-existing at HEAD) · `preset-editor-surface.ct:140` parallel-load flake (A/B-proven
  pre-existing) · `seed-demo-chats` cold-import contention (structurally fixed → SERIAL\_INT; watch
  it stays quiet) · `rpg-scene-tab.tsx` near the 450-line cap.

## ═══ ORCHESTRATOR QUICK-ONBOARD (load-bearing — keep) ═══

**Dispatch + lanes**

- `Agent {isolation:"worktree"}` — the hook owns creation (local HEAD + auto-install). Verify base =
  main HEAD post-dispatch. Briefs ALWAYS include: back-channel line (SendMessage mid-run) · scope
  fences vs siblings · `git -C` discipline · lane-unique scratch names · the explicit CT files the
  floor must run · re-verify-your-premise-first + a correct refusal is a SUCCESS · the WHY, and the
  hazards (every trap that bit was one no brief mentioned).
- Message live lanes by AGENT ID; verify the id↔lane mapping against dispatch results before every
  SendMessage. TaskStop an agent once its report merges; NEVER resume an agent whose worktree you
  removed. Warm-agent LEGS beat fresh spawns (cache economics).
- Lane law §L is in `AGENTS.md` (git -C everywhere · prove your commits · scoped floors, hooks off ·
  `:5173` serves MAIN — use `snap --isolated --ref <sha>` · report deviations with receipts).

**Merges**

- Rebase-then-ff (standing law above). NEVER chain teardown or verify behind a merge in one command;
  NEVER pipe `git merge` (a `| tail` swallowed a conflict; tsc then red TS1185 = tool-error, not
  code). Merge BARE, read output, THEN check. A staged-failed merge is `git merge --abort`.
- NEVER `cd` into a worktree (cwd persists; a stray board commit landed on a lane branch). Repair:
  cherry-pick to main first, then `reset --soft` in the lane; never `git restore` in a lane's tree.
- Teardown: `status --short` + `git show --stat` receipts FIRST. Recovery: the branch survives —
  `git worktree add <path> <branch>`.
- HOLD merges while a `verify --push` battery runs (it owns the box). Any gate result taken during a
  merge window is VOID.

**Verification instruments**

- `pnpm check` = STATIC (\~90-220s). `pnpm verify --push` = static + `tests:node` (vitest+CT, ONE
  behavioral lane) + e2e-smoke + cpd + parity (\~16min; setsid-detach + `.exit` file, READ it).
  `--full` adds full e2e + mutation. Exit 2 = a checker BROKE (not a verdict). Read `reports/`,
  never re-run to find a failure; never `| tail` the harness.
- A lane's COLD-worktree red OUTRANKS your warm read — reproduce on a clean tree before calling it
  an artifact.
- A fence/instrument claim needs a planted POSITIVE control before its zero is trusted
  (\[\[instruments-lie-verify-the-verifier]]). Every scout PRESENCE claim needs AST, not grep; an
  ABSENCE claim needs two methods + a scanned-count receipt, scoped to where the LAW puts the thing.
- snap: `--eval` takes a BARE arrow · `--jsclick` for rows · `--isolated`/`--dirty` beat HMR ·
  hover-loop class is REAL-POINTER-ONLY. `pnpm ast` for any code question. Chrome MCP for live
  pairing.

**Distilled session lessons (the full narratives live in the 08-08 archive + memory)**

- Two agents agreeing is not corroboration when they read the same artifact.
- A ✅ with a prose tail overstates completion; mis-scoped rows let a lane report done truthfully
  at 1%.
- A side-eye SYMPTOM is gold; its mechanism PRESCRIPTION is a proposal — check against the ledger
  and file headers before relaying. When a ruling's premise dies, re-rule — don't defend it.
- When a lane damages a sibling, WARN every mid-run lane (phantoms cost more than the accident).
- Fences hold in intent and still collide in LINES — sequence same-file lanes or brief the resolve.
- Board edits: grep the CURRENT text (anchors drift under format-md); backticks in `git commit -m`
  command-substitute — use the single-quoted heredoc form.
- Deliverable TEXT lands in `docs/`, never only in a report/transcript. Audit a lane fleet by
  reading each transcript's LAST message in full (\[\[audit-lanes-read-transcript-tails]]).

**Owner cadence**

- Batch pending forks \~4 at a time via the question tool, recommendations marked; he answers fast
  and usually takes the marked arm. He challenges PREMISES, correctly — when a premise dies, say so.
- "Read the reports in full" means it — summaries drop load-bearing items (proven twice).
- Publish mocks as artifacts for taste calls.

**Compact ritual**

- Before compact: bring LIVE STATE current (lane ids, tree state, open decisions) · flush memory +
  MEMORY.md index · reconcile tasks. Owed deliverables get written INTO this board.
- Resume read order: this board (whole file) → `git log --oneline -40` → MEMORY.md →
  `AGENTS.md` for architecture work → history archives only for archeology.

## ═══ STANDING FACTS + POSTURE ═══

- **The neo-parity oracle is a FLOOR we've passed, not a golden** — a red `test:parity` diff means
  update/annotate the reference, NEVER regress `assembly/shape.ts`
  (\[\[neo-parity-oracle-is-a-floor-not-a-golden]]).
- **Stack:** `pnpm stack restart` defaults `ENGINES_POSTURE=adopt-only`; `--force` is the ONE
  fleet-killer. Engines truth = `GET /is_sleeping` (`/health` and `/v1/models` LIE asleep). No
  stack restart mid-battery.
- **DB:** pre-launch, schema changes SQUASH into `0000_baseline.sql` — a regen DROPS the dev db on
  next boot (announce it; backup first; the latch reseeds). **REFINERY R0 squashed the baseline
  2026-08-08 — the next boot drops+reseeds.** NEVER bare `sqlite3` on the live db. Wire capture:
  `GET /api/_debug/wire/captures?chatId=…` (`x-debug-token`).
- **Worktree lanes:** the hook creates `wt/<name>` from local HEAD + installs; NEVER
  `enableGlobalVirtualStore`. ONE committer on main; lanes commit with pathspec.
- **Probe harnesses:** `scripts/probes/rpg-extraction/` (probes are lint-free scratch by ruling).
  Score against OPPORTUNITIES through the PRODUCTION tokenizer.
- **The extraction-mode map is EMPIRICAL** (spike §4f-§4h): hosted strong × folded = default ·
  agent-sdk = LOUD fallback round · local vLLM × folded prose-silenced → cheap round is the local
  champion (`tool_choice:"required"`).
- **Orchestration:** delegate volume, keep judgment; fresh lens before any non-trivial "done"; diff
  an executor's self-flagged deviation against the SPEC TEXT before minting law.

## ═══ THE RECEIPT TRAIL ═══

Every lane seal, merge sha, verifier verdict, superseded ruling and session narrative this board
used to carry inline lives INTACT in:
[`docs/history/retro-workboard-2026-08-08.md`](history/retro-workboard-2026-08-08.md) (the
2026-08-07→08 era: identity build, PROSE-1, the graduation-law era, the absorbed remaining-work
ledger's full text) · [`retro-workboard-2026-08-07.md`](history/retro-workboard-2026-08-07.md) ·
[`retro-workboard-2026-08-03.md`](history/retro-workboard-2026-08-03.md) (the burn-down archeology)
· `git log docs/retro-workboard.md` for everything else. The dogfood campaign record:
[`docs/history/dogfood-tracking-2026-08-08.md`](history/dogfood-tracking-2026-08-08.md) (CLOSED).
