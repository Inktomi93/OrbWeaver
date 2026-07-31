# Retro Workboard — the live board

> **THIS IS THE WORKING DOC** (owner-stated). Not law, not a deliverable — the durable state + work
> log an orchestrator resumes from cold. Authority for LAW = `docs/architecture/core/**`; the D-ledger
> (`Core-Path-Registry.md` / `Core-Laws-and-Precedents.md`, current through **D114**) wins on ANY conflict.
> `docs/architecture/proposed/**` is pre-rollback REBUILD REFERENCE — never cite its status as current.
>
> **CURRENT-STATE ONLY.** When a block goes stale, REWRITE it — never stack a new session layer on top.
> Rewritten in full 2026-08-01 EOD (the shakedown-cruise close; audited against the accreted day notes
> before deletion — the 07-31 thread-loss lesson). Prior baselines: `git log docs/retro-workboard.md`.

## ═══ WHY RETRO EXISTS — the north star ═══

Read `shitsfucked` at the repo root (the post-mortem). Main's own ledger, verbatim: *"We are tired of
hunting down invisible bugs. **Everything must be proven.**"* The disease it names — **features that
looked done and silently weren't** — is the thing this rebuild exists to kill. The posture is **drive
it live, then pin it**. 2026-08-01 proved the posture: one full owner dogfood day found ~20 real
defects, every one was fixed at its ROOT the same day, and five whole bug CLASSES were made
unmakeable. Judge every "done" against that frame.

Global **KISS/YAGNI are SUSPENDED here** — build the maximal, most-provable version
([[kiss-yagni-suspended-build-maximal]]). Package cake: kit ← contracts ← db ← server ← client +
sealed ui; one-directional flow (rpg ↔ chat only via injected ops). Read
`docs/architecture/core/AGENTS.md` IN FULL before any work.

## ═══ ▶▶▶ CURRENT STATE — 2026-08-01 EOD (read first) ═══

**Tree:** everything green — final battery CT 1653/0 + vitest clean; every merge of the day was
whole-tree check-certified. **Origin** holds through midday (`b87ec743..24989143`, verify:push
14/14); the ENTIRE afternoon (~25 commits/merges) is LOCAL awaiting the next per-push owner word.
**Stack:** running `adopt-only` + `WIRE_CAPTURE=on DEBUG_TOKEN=dbg` (restarted 13:20); `stack.sh` now
DEFAULTS `ENGINES_POSTURE=adopt-only` (owner-ruled — the engines-off default silently killed a day of
turns). Engines awake (gen = Qwen3-VL-8B @ 8703, hermes). Dev DB was wiped at dawn 08-01 (fresh
schema, owner re-seeding by play).

**The day in one line:** 39 lanes dispatched, 37 landed, 0 reverted — the full ledger is §LANDED
below; the owner drove the app all day and every find closed same-day.

**The extraction-mode map is now EMPIRICAL** (spike §4f–§4h — read those before ANY mode work):
hosted strong × folded = the proven path (default) · agent-sdk wire (incl. OR×protocol-auto×Claude —
the two Claude-runtime skins share one backend) = no terminal channel → LOUD fallback round ·
local vLLM × folded = prose-silenced (0/36) → the LOUD `local-engine-fold-guard` arm runs the cheap
round · **cheap = the local champion** (grammar-bound via `tool_choice:"required"`; §4f: only
that and `response_format:json_schema` bind — `"auto"` buys NO grammar on vLLM+hermes) · reliable
CONTRADICTED by measurement (0/12 hpDelta — field-routing failure). Sonnet card "reluctance" was OUR
tokenizer eating malformed opens (§4h) — F2a leniency + F2b example shipped.

## ═══ ▶▶▶ THE QUEUE ═══

### NOW → NEXT (owner-ruled order)

1. **PRE-MULTIPLEX SMALLS** (one batch lane): notifications consumer handles typed error frames
   (today it DROPS them — worst of the class-sweep) · `rpg.stream` gains `withSubscriptionErrors` +
   its stale "nothing throws" comment corrected · **START-1** — `startChat({opening:"generate"})` is
   non-atomic: a dead-engine opening orphans a real committed chat behind the draft + a lying toast +
   duplicate-chat risk (server returns chat id + opening-failure outcome; fork's degraded-not-broken
   catch is the model pattern).
2. **SSE MULTIPLEX** — THE next big lane (owner-ruled). Spec `docs/design/sse-multiplex-spec.md`,
   §14 fully RULED (SSE not WS · presence→socket + ROSTER-gating vocab · impersonate exempt ·
   workloads folds S5 · numbers ratified · automation.stream = DOORWAY wired at its stage 4).
   S0 vocabulary+heartbeat → S1 user+rpg rooms → S2 chat (stickler pass) → S3 notifications+presence
   → S4 automation → S5 workloads. Kills the invisible-retry class structurally (SSE-1b —
   ProviderError→typed-terminal mapping — folds into its room sources; also retires the
   fragile-by-accident `connectionsChanged` coverage) + the connection-cap class.
3. **W-H FULL SIDE-EYE** — after multiplex S1-ish, needs a MODEL-POPULATED game ([[RV-15 posture|
   seeded-data-never-verification]]). The accumulated list: panel-beauty §4.2 · context-panel
   fidelity re-verify (`docs/design/context-panel-fidelity-findings.md`) · CT-harness band/kicker
   overlap vs the real shell · panel synthesizes `0/max` for UNSET meters (the panel is the lying
   surface now — reminder renders honest carriage) · STREAM-JANK (message box resizes during
   streaming) · inventory-grid tile design vs mock (owner eyeball) · QUOTE-1 hue taste check (new
   amber/apricot/ink dialogue colors) · scene-cards lightbox lacks a render policy (external images
   paint in transcript, not archive) · Status max-edit UX · icon-only meta-tabs at narrow widths.
4. **SET-SEAMS** — approved-to-build; §10 fully ruled (features/tag + features/regex = **D114** ·
   system→admin merge at stage 4 · sub-deep-links IN program · Q3/Q5/Q6 as recommended). Stage 0
   mechanism is the hard barrier.
5. **DENSITY PASS** — approved-to-build; §7 all ten ruled (incl. D6 rounded-card demotion + D7
   Card.padding retirement). S0 computed-value probe FIRST; S3 waits for the panel to stop moving.
6. **WORKLOADS JUNK-DRAWER EXIT** — investigation ready
   (`docs/reviews/stickler/2026-07-25-workloads-junk-drawer-exit.md`).

### OWNER DECISIONS PENDING (small)

- **`reliable` mode's fate post-§4g** — it measured WORST on the field its guardrail was supposed to
  secure (0/12 hpDelta). Options: delete it (~6 tsc-total sites + UI) · keep with honest picker copy
  ("cheap = local champion") · wait for launch data. The earlier "keep all three" leaned on
  pre-measurement R3; the data has since flipped.
- **POPULATE-FROM-CHARACTER button** (owner-proposed, shape not yet ruled): a host-invoked one-shot
  extraction round over the character card + opening that fills born state (level/title/wallet/
  inventory/background-implied quests) — the ONLY sanctioned doorway for hand-only fields the model
  can't write. Lean: per-character button on the roster card/takeover, button-only (no auto-run).
- **RV-11 dead write plane**: `presentCharacters.appearance/outfit/thoughts` are demanded by the
  extraction prompt EVERY TURN, richly filled in the DB, and read by NOTHING. Build the readers
  (panel + `thoughts` likely earns a reminder slot) or stop demanding the writes. `sheet.flavor`
  same class.
- Partial-abort persistence: aborts persist NOTHING today (pinned) — persist-what-streamed is a
  product change if ever wanted.
- CSP layering: per-character can opt INTO external media above a blocking deployment (labeled in
  UI); rule tighten-only if wanted.
- Cast-NPC per-actor tracker grants asymmetry (explicit-list-only — spec-accepted; revisit on want).

### BUILD ITEMS QUEUED

- **agent-sdk terminal tools** — the fold on the everyday Claude-runtime wire (OR×auto×Claude +
  max-pro-sub currently run the loud fallback EVERY turn). The real fix; raises EFF-3 urgency.
- **EFF-3** — degrade-warnings client surface + effective-delivery freshness (the D112 (4) "Live
  while rounding" gap is now the DEFAULT-path experience on both guarded wires) + GM-tab
  recommend-don't-force notes (thinking-off; "cheap recommended for local models").
- **KNOB EDITORS batch** — `journalTypeHints` (cheapest — HintEditor sibling) · `hiddenContentReveal`
  · `recentBeatsKeepLast` · `cardKeepLastX` · extraction-depth trio (`extractionContext` /
  `extractionWindowTokens` / `reconcileEveryBeats`) · `config.userMacros` is UNWRITABLE (not in the
  patch schema at all — needs the write arm first). Plus the extraction-mode picker copy refresh.
- **PROSE-1** — model-facing prose → host-editable data with VERSIONED shipped defaults (owner:
  "prose shouldn't live in the code"). Inventory: card/cyoa teaches · steering license · delta
  headings · impersonate/continue/response nudges · R2 template shells · FOLDED_RECONCILE_NOTE.
  Homes: per-game teaches ride config.features; nudge/voice prose rides the PRESET (ST
  `assistant_impersonation` precedent). Reuses the preset copy-on-edit fork model. Spec-first.
- **IMP-1** — impersonate anti-bleed hardening: measure the voice-lock nudge on hosted+local FIRST;
  ST runs two layers (char-name stop strings + wrong-name sink delete —
  `docs/reviews/misc/2026-08-01-st-impersonate-anatomy.md`). PLUS the proven per-tick hygiene gap:
  impersonate streams RAW deltas (AI_OUTPUT regex/self-label strip run on `content` only — a leaked
  `Name:` prefix lands in the composer verbatim; cheapest fix = final replacement delta).
- **IMP-2** — visible Stop/cancel during impersonate (the unsubscribe handle IS the lever, nothing
  renders it; guided icons show a misleading wait reason meanwhile).
- **QUOTE-1 follow-up** — greeting-preview surfaces (greeting studio / facet editor /
  character-greeting-preview) render through the seal but don't get the dialogue tint (need the
  appearance query inside the character feature).
- **ZTXT-1** — zTXt PNG chunks in kit/png-card-chunk, dependency-free via
  `DecompressionStream("deflate")` (verified present in Node here + browsers; kit stays isomorphic).
- **DRAFT-TRUST** — drafts run the untrusted floor (strip `<i>`/`<b>`), committed trustHtml renders
  them; needs a "what render policy would this card get" server seam (architecture call).
- **DRAFT-CAST** — DraftGreetingThread uses seed.characterIds only; commit unions
  addedCharacterIds — a panel-added character shows no greeting row pre-commit (cheap union fix).
- **#24 MU-picks pane** (server half `chat.setUserMacroValues` exists) ·
  **`chat.setChatDocumentVisibility` wire** (D85) · **AU-10** background-library manage UI ·
  MP footer "from config" untrue on curated fallback · `resolveAgentSdkAlias` unreachable-branch look.
- **VER-1c** — custom-byo `role:"tool"` wire still drops `isError` silently (OR-4's unbuilt sibling).
- **Preset multi-tab fork idempotency** — two tabs editing the built-in can still mint two forks (no
  `forkedFrom` column; cheap when it bites).
- **`ChatRpgOps.gatherTurnContext` args-object refactor** — 5 positional args, 2 lite-ignored
  (~35 call sites; honest-shape debt from the regen threading).

### SMALLS / HYGIENE

- BUS-FLAP: chat open does subscribe→unsubscribe→subscribe on the chat bus (live-observed).
- BOOT-4X: user-bus connect gap-heal double-fetches 4 roots on every page load ("by design" — evaluate).
- VERIFY-BURST: re-drive the invalidation lane's 3 recorded snap commands against merged code,
  confirm ≤2/≤2 fetches live (its "after" numbers were map arithmetic).
- ✨-PERSPECTIVE: a snap drive of Impersonate → "1st person" produced no stream traffic — selector
  miss or dead menu item; verify (zombie-lane toasts may have changed the picture).
- WAKE-STATUS: the 3s engine wake is silent (spec accepted the wait); revisit if it feels laggy.
- Freshness-gate DEFERRED debt: 12 `stats.*` keys (driver-vs-dashboard-cost tradeoff) +
  `assets.listOwned` (the raw multipart upload seam invalidates nothing).
- Scout: `connection.getCatalog`/`getAgentSdkCatalog` appear in admin `invalidates` with zero literal
  consumers — aliased reads or dead rows.
- SERIAL_INT for `tests/server/entry/compose/rpg.int.test.ts` (repeatedly flaked 5s/20s timeouts
  under fork contention) · `composer-guided-cluster.ct` whole-file 30s timeout (own small) ·
  `blurSurfaces` consuming selector unconfirmed (low).
- `staging.ensure` residual: first-write-wins seeded from HEAD — dormant unless rpg tools ever mount
  as REGISTRY tools again (D112 keeps `tools: []`); reroll accumulation would return via that seam.
- R5b(a) verify: `refEnumerationLines` (non-enforcing-backend prompt fallback) should enumerate
  active conditions post-R5a — confirm stage-1's R6 build carried it; ~2 lines if not.

### PROBES / OPTIONAL (spend live money, block nothing)

F4 (enriched descriptions vs prompt-cache prefix) · F4a (does `effort` change bust the OR cache?) ·
F5 (OR effort translation / native-depth reachability — re-opens the Anthropic-skin question if
capped) · OR-5 (cache breakpoints count array offsets — under-caches tool-heavy turns) · OR-7
(reasoning round-trip; dropping proven safe, replay wrong = hard 400) · #16 engine auto-sleep/wake
live pass (wake-on-demand now built; the live drive is the remaining lens) · D22 member-tiers live
verification (needs the multi-user e2e stack).

### DISCUSSION PILE (owner, no build)

☰ chat-options placement (D111 clause OPEN, breaks nothing) · persona=character design pass
([[persona-pin-prompt-resolution]]) · Meteocons artwork fork (~8 icons, MIT) · grimstone theme
(parked) · flakes/facelift micro-ledgers.

## ═══ STANDING FACTS + POSTURE ═══

- **NEVER push to origin** without an explicit per-push owner word. Origin @ `24989143`; everything
  after is local. Commit cadence relaxed ([[commit-cadence-relaxed]]).
- **`pnpm check` = STATIC only** (~90-220s, runs in the pre-commit hook); battery (`pnpm test`) is
  separate (~10 min: vitest ~8500 + CT ~1660); `verify:push` = check + tests:node + e2e-smoke
  (~10 min, needs the stack; runs even on deletion pushes). READ `reports/` instead of re-running.
- **Stack:** `pnpm stack restart` now defaults `ENGINES_POSTURE=adopt-only`; `--force` is the ONE
  fleet-killer. Engines: `pnpm engines:{wake,sleep,status}`; truth = `GET /is_sleeping` (`/health`
  AND `/v1/models` both LIE while asleep); hold marker = refuse-auto-wake. Wake-on-demand is built
  into the server's vllm request seam (single-flight, fail-loud).
- **Worktree lanes:** auto-hook creates wt/<name> from local HEAD + pnpm install (2s/48MiB);
  NEVER `enableGlobalVirtualStore`. ONE committer on main; lanes commit with PATHSPEC
  (`git commit -m … -- <paths>`); orchestrator never commits while a lane edits main; lane cwd
  RESETS across notification boundaries (`git -C` everything); a failed orchestrator merge can tear
  down a lane's worktree while its branch survives (recreate + continue). Semantic conflicts on a
  lane's own files → abort and send the LANE to merge main into its branch.
- **NEVER bare `sqlite3` on the live db** — probe COPIES (this session's live in the scratchpad) or
  `/api/_debug/*`. Wire capture: `GET /api/_debug/wire/captures?chatId=…` (`x-debug-token: dbg`).
- **Orchestration:** delegate volume, keep judgment; fresh-context verifier/side-eye before
  non-trivial "done"; diff an executor's self-flagged "deliberate deviation" against the SPEC TEXT
  before minting law ([[spec-completeness-no-improvisation]]); mine probe artifacts before
  implementing a doc's proposed grammar.
- **Probe harnesses:** `scripts/probes/rpg-extraction/` — `run-coverage.mjs` (env-driven),
  `steer-probe-real.ts` (read half through the real reminder), `local-8b-vehicles.ts` (three-arm 8B,
  `SPIKE_ARMS` resumable), `card-teach-probe.ts` (`CARD_DRY=1` free, `CARD_SCORE=<file>` re-scores).
  Score against OPPORTUNITIES (§4b) and through the PRODUCTION tokenizer (emitted ≠ rendered).
- **Resume read order:** this block → THE QUEUE → `git log --oneline -20` → `MEMORY.md`
  (auto-loads) → `docs/architecture/core/AGENTS.md` for architecture work.

## ═══ LANDED — the 2026-08-01 ledger (compressed; git log has detail) ═══

**Overnight (pushed @ `24989143`):** R4b steering proven live · R5a/R5 · OR-1…4 · R1 fold + D112 ·
EXT audits · EFF-2 · e2e 30/30 · weather enum · Waystone fix rounds · D71 drift fix · D111.

**Day wave 1 (pushed):** TRK stage 1 (`ea99b0e3`, D113) + stage 2 (`98ee6da2` — Sheet dissolved,
takeover view, RV-8 primitives, per-carrier ceilings amendment) · PREV rebuild + per-member budget +
200k/windowEstimated honesty + fill-vs-headroom bar · preset capability staleness + placeholders ·
tool-coverage audit (`docs/reviews/misc/2026-08-01-tool-coverage-audit.md`) · EXT-4 robustness +
folded born-default · decision stacks recorded (D114) · mood/journal wrap · hints→hover · pin
one-click · band vocabulary.

**Afternoon (LOCAL, awaiting push):** anchor-slots investigation (count 8→4, tail selectors,
`notStateAnchor()`) · reroll-supersede + idempotent resync + full swipe-flip state (VER-1a) ·
swipe-reminder read-base twin (read base == write base, ONE resolver) · empty-generation engine guard
(VER-1b closed) · reasoning render + one-seam strip belt (the display found two deep bugs same-day) ·
Connections: lost-autosave root cause + live-vs-draft honesty + echo seam + clear-persists +
coherent api/source pairs · previewSection host-gate (latent) · wake-on-demand + adopt-only default ·
invalidation burst dedupe + Preview freshness rows · zombie-subscription + loud impersonate failures ·
query-freshness-coverage GATE (+3 frozen surfaces fixed incl. the GM veiled ledger) · class sweeps
(registry-as-truth CLOSED; composites; SSE work order) · §4g 8B measurement (R3 overturned) +
local-engine fold guard · §4h card probe (F2 resolved) + F2a fence leniency + F2b example · REC-1
teach copy · file-dropzone drag fix (EVERY dropzone) + honest import toasts · embedded-image
display-only rule · draft macro-context fix · preset fork-once + activate · smalls batch (protocol
pair, stray-drop guard, revealHidden cadence, tool-rounds label, resolved-fallback display) ·
QUOTE-1 dialogue tinting + distinct per-theme hues (D71 pipeline) · theme wiring audit (dialogue was
the ONLY dead switch) · ST impersonate anatomy recon · PNG drop + CSP trust toggle (3 policies).

**Pre-retro pushed history:** see `git log` — D22 member viewer, impersonate/guided saga,
crunchy-cluster, parity-plus (D109/D110).
