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

## ═══ ▶▶▶ CURRENT STATE — 2026-08-02 DAWN (the overnight run; read first) ═══

**Tree:** green — check 12/12 + battery certified through the whole night (final integration
fixes `83a03778`; last full battery 8760/8786 with the 3 reds fixed+committed after). **Origin**
still holds `24989143` (midday 08-01); EVERYTHING since — the whole evening + overnight, ~65
commits/merges — is LOCAL awaiting the per-push owner word. **Stack:** dev on :5173 serves the
fully-polished tree; engines adopt-only.

**⚠ SECURITY LANDING (08-02): the COLD-SCRUBBER LEAK fixed on main** (`ed2aafc5` merged, check
12/12) — a mid-slot reconnect leaked hidden-span TAILS to members (member-triggerable: the
withheld ghost's stall is an oracle; close/reopen delivered the tail). Fix = producer-side
`memberText` stamp before the durable append; all read seams stateless; fail-closed on undefined.
**MERGE-ORDER CONSEQUENCE: the S2 branch must merge main AGAIN post-stickler-verdict and
reconcile its moved room source** (its pump-scoped deltaScrubbers machinery DELETES — the stamp
makes the two-room-isolation property hold by construction); its security tests re-run; THEN S2
merges. `scrubStreamReplayForMember` (unwired token log) still cold-starts — cited, needs the
same class of fix IF ever wired.

**▶▶▶ LIVE STATE (08-02 midday — compact-safety snapshot):** main @ `13963039`+ (SET-SEAMS S0 +
HUD-1 ledger amendments merged; ~190 commits past origin `24989143`, NO pushes). **IN FLIGHT:**
HUD-H1 fix-all (all side-eye findings P0→P3 incl. the shell ≤1024px dead toggle) · ~~density-S5 fix-all~~ MERGED (tiers.css now LOAD-BEARING with strip-attribute liveness CTs;
all findings incl. one-rhythm 32px avatars, marker-slot title columns, weight 600, inset focus
ring; honest deviations recorded: padding/radius deliberately un-mapped, no 9.5px token invented,
home kicker cited to the mock). Dev stack :5173 had a STALE-VITE break (missing-export ghost) —
restart launched detached; verify it serves before the next side-eye · **SSE S2 branch IN FINAL ROUND** (re-review verdict MERGE-WITH-FIXES: RF1 HIGH — the reconnect thunk heal is guard-dropped by any pre-attach durable row [monotonic guard + out-of-band resume don't compose; repro in the report]; lane is fixing RF1 [ordering-barrier lean] + reconciling the cold-scrubber producer-stamp merge + the park-skip corner; merges on its report) (`wt/agent-ae7a23e7ea4435982` @ `261b728b`
— F1 fixed STRUCTURALLY: cursor advances at DELIVERY pre-yield; shed PARKS the pump, delivering
roomLagged resumes it from last-delivered; reconnect re-announce carries a sinceSeq THUNK reading
the seq-guard's highWater; regression tests probe-verified to bite; e2e+live green on isolated
stacks — re-review the delta then merge) · the scrub mid-slot-reconnect verification
(security-executor) · ~~reachability suite~~ LANDED (`b5c1d9ff` merged: 80 leaves/60 tests, cast-volatile parity FIXED
via castVolatile+one volatileSegs; healthz test assertion fixed post-merge) · ~~workloads junk-drawer exit~~ MERGED (58→30 files; 8 owner-domain contribution factories;
D117 minted; full battery green pre-merge). DEFERRED into D117, each independently landable:
two-lane worker + workloads.lane column (the head-blocking defect stands) · durable progress
column · poison-row visible surface. Q4 (reconcile-stats direct mutation) deferred as additive
surface. **NEW OWNER QUESTIONS (cited in the suite):** inventory item `description`/`location` are
model-writable but read by NEITHER surface — render-capped, or make unwritable? **FOLLOW-ON
QUEUED: the macro/CEL feed is a THIRD model-facing surface** (macro-view.ts carries NO volatile
state for any carrier — same drift class; extend the suite's matrix to it + fix, ~a lane). **THEN:** re-verify both fix-alls → SSE S3-S5 +
close-out ledger → HUD H2-H3 → SET-SEAMS S1-seal → PROSE-1 S1+ (app-tier; after SET-SEAMS S1
merges) → density S2/S6 (+S3 post-HUD) → #16/D22 live probes → **DATABANK LAST, alone — HARD PRECONDITIONS: SET-SEAMS through S6 + workloads stage-E complete (owner, 08-02)**.
Owed to owner: verify:push when quiesced (his earlier run hit contention+stale-port, both
resolved); the E2E_LIVE specs on the next push window.

**═══ COMPACTION HANDOFF (08-02, written at the owner's invitation) ═══**

**IN FLIGHT at compaction (resume via SendMessage to these, results arrive as task notifications):**
· ~~macro parity~~ MERGED (`231e7653`: one-builder grammar exported from reminder.ts, macro-view
  composes it — 47 proven/26 cited matching the reminder path-for-path; inventory ruling applied
  all three surfaces, notes capped 60; delta cite now STRUCTURAL [no inventory edit arm — re-open
  if one lands]). EYEBALL ITEM: {{rpgSceneState}}/{{rpgCast}} are materially LONGER now (correct
  parity, real token cost) — look at a live render if a preset places them.
· `ae7a23e7ea4435982` — SSE S2 FINAL round on branch `wt/agent-ae7a23e7ea4435982`: RF1 fix
  (ordering-barrier lean) + cold-scrubber producer-stamp reconcile (its pump-scrubber machinery
  DELETES) + park-skip corner. MERGE PROTOCOL: read its report → merge its branch → a THIRD
  stickler pass ONLY if the fix is structural in a new direction. Spec close-out (ledger D-entry
  for the multiplex + workboard SSE-1 close) happens at S5, not before.
· ~~HUD-H1 fix-all~~ MERGED (all 14 findings; Tabs `layout` variant; the void is now the HUD's
  GROUND; the ≤1024px dead toggle was TWO coupled shell bugs, both fixed; locked-Map RULING taken:
  activatable one-story, aria-disabled dropped — SPEC AMENDED IN PLACE, needs owner ratification
  + the generic panel still speaks the OLD lock vocabulary, follow-up ruling if another
  contributor ships disabledReason). NEXT: the COMBINED side-eye re-pass (HUD+S5 surfaces, one
  stage cycle) then HUD H2.
· S2 branch @ `ddfd76ca` — RF1 fixed via the RESUMABLE ORDERING BARRIER + scrub reconcile +
  park-skip corner fixed; live security specs green on its stacks. STICKLER PASS 3 dispatched
  (scoped to the barrier); MERGE on its verdict.

~~DOCS-ARCHIVE~~ **MERGED (`b1839031`)**: docs/history/ minted (sibling of architecture/history);
13 fully-landed docs archived, 11 refs repointed, pain-points annotated in place. Lesson: check a
report's findings AND its NEXT-list before archiving. **S2 SSE MERGED (`89b0e4c1`)** — P3F1 fixed
all three arms (per-connection announcedFor epoch + ownership-checked goDark + eviction at
takeover), P3F2 = bounded retry then surfaced error; 4 surgical probe-bites; 318/318 + CT 40/40 +
@live/@smoke green. Deliberate non-fix: no server-side barrier timeout (would degrade exactly when
load-bearing) — belt-and-braces follow-up if wanted. SSE ladder: S0-S2 DONE → **S3 LANE IN FLIGHT** (notifications+presence fold; typed-error-frame handling folded in; merge on report). Rendered-clip CT audit: owner declined — dropped.

**SET-SEAMS S1 LANE IN FLIGHT** (executor, worktree): the appearance 8-way split, AppearanceForm
deleted, save pins per §9; live drive deferred to the combined side-eye. S2-S4 SERIALIZE after it
(main.tsx contention). S2 STICKLER PASS-3 VERDICT: MERGE-WITH-FIXES — P3F1 HIGH (dual-generator
cell takeover bypasses the barrier; RF1's half-open-TCP trigger) + P3F2 (fire-and-forget re-announce
= silent frozen room) ROUTED back to the warm S2 lane; merge on its green report. Q4 RULED (owner):
direct stats mutation = YES — riding the stage-E lane (mutation + wired client affordance + sweep
classification + auth test).

**WORKLOADS STAGE-E LANE IN FLIGHT (`a2a645ca3abb5a1c6`, normal executor — owner asked 08-02:
finish workloads cleanly):** two-lane worker + `workloads.lane` column (kills the §2 head-blocking
defect — prerequisite value for databank's `interactive` lane) · durable `progress` column ·
poison-row visible surface · residuals (dead export, AGENTS.md:226 indexer drift, client lane
grouping). Q4 (direct stats mutation) EXCLUDED — still an owner fork. Spec = exit report §3.3+§5-E;
serde verified CLEAN in §4 (import entanglement died in stage D — no serde work remains). Merge on
its report; run the lane-scoping + poison-visibility probes' receipts past the eyeball; stickler
the diff after merge (db baseline + engine touch).

~~GATES LANE~~ **MERGED (`b9db4f92`, post-merge check ok)** — all three gates live + probed:
`ui-size-via-variant` (structural UNSIZED_BOX exemption; 3 allowlisted w-auto Selects; 2-file
DEBT_BASELINE ratchet awaiting a Button wrap/multiline variant — SMALL QUEUED) · `pre-merge-commit`
lefthook sibling (scratch-repo probe: red merge refused, clean merge lands; ACTIVE from now on —
merges no longer skip checks) · `scrubber-home` (standalone security gate; ed2aafc5 cited;
scrubStreamReplayForMember exemption recorded). Lesson: lefthook coverage is PER-HOOK-NAME.
Follow-up small: Button wrap/multiline size variant clears the 2 debt rows. Rendered-clip audit
(CT/snap lane) proposed, undispatched — owner call.

**ORCHESTRATION GOTCHAS THIS SESSION PAID FOR (obey):** pass `isolation:"worktree"` on EVERY
concurrent Agent dispatch (never implied) · the snap stage is a GLOBAL port singleton — exactly
ONE lane holds it at a time (two side-eyes double-booked once; one must wait) · merge commits SKIP
the pre-commit hook — run `pnpm check` on main after every merge (cross-lane gate fallout is the
NORM: a lane based before a new gate trips it at merge — the rpg-hud voice, the SET-SEAMS footer,
the seed coherence, the healthz assertion were all this class) · lanes correct SPECS with receipts
regularly — read reconciliation sections, don't assume spec-letter compliance · side-eye/stickler
loops go 2-3 rounds; the re-verify pass catches fixes that create regressions (the focus race) ·
schema-derived exhaustive suites + strip-the-attribute liveness CTs are the two proof patterns
that caught what review missed.

**OWED TO THE OWNER:** `verify:push` on the quiesced tree (his run hit contention + a stale port,
both resolved — 14/14 expected) then say PUSH-READY; the word is his · `E2E_LIVE=1 pnpm e2e` on
that window · the dev stack was RESTARTED (stale-vite ghost export) — confirm :5173 serves before
telling him to look · artifact links for his review: mock-vs-rendered
claude.ai/code/artifact/a93f422d-40fa-4df9-aad7-4ad690f2e556 · home mock …/83605063-99da-4a1a-b64e-0bd58ef3bf77
· projection mocks …/eeb9fdbe-2b37-4dc1-b11d-00a5c8e79ec7 + …/36f3dd88-2145-46ff-a2b3-c0031dce75d9
· databank mocks …/9dac56bf-b773-4192-a75c-385aae024c1a + …/db0ec6ad-1aca-43aa-bf14-12ea9cdf1ca6.
No open owner questions — the last two (inventory fields) were ruled + routed.

**STANDING MANDATE (owner, 08-02 morning): BURN THE BOARD DOWN until DATABANK is the ONLY item
remaining** — keep dispatching queue stages as lanes drain (SSE S3→S5, HUD-HOME H2→close-out,
density S2/S6 + S3-after-HUD, SET-SEAMS S1→seal, PROSE-1 S2+, remaining smalls/probes), full-auto
ladder, no blocking. Every UI build gets its side-eye and **ALL side-eye findings get fixed —
never just the top ones** (re-affirmed; the [[side-eye-fix-all-findings]] rule is the law of this
run). Databank builds LAST, alone at the end. No origin pushes without the per-push word.

**MORNING RULINGS (08-02, all four as recommended):** PROSE-1 #8 = ROOM HOST (S1 lane dispatched) ·
density S5 PULLED FORWARD (S0+S1+S5 lane dispatched; S3 still waits for HUD-HOME) · unsent-draft
reload stays BY-DESIGN (closed) · e2e isolation = INVESTIGATE + structural guard (lane dispatched).
SSE S2 (chat fold, stickler-mandated) dispatched with them — four lanes in flight at handoff.

**THE OVERNIGHT IN ONE PARAGRAPH (owner slept after ~01:00; full-auto ladder ran):** SSE multiplex
S0+S1 LANDED + live-verified (1 socket/tab measured; rpg gate leak mechanism fixed) · the
LIST-PANE PROJECTION built (A+B, mocks-ratified) through TWO side-eye fix-all rounds + a seam
close-out (focus decided at the intent write; float on every row; viewer seat out of titles;
qualified action names) · the HOME SECTION built (glyph→home, born default, landing slimmed,
tile registry + gate, temp-chat wired through the picker) + its fix-all round (panel-availability
both sides; the APP-WIDE mobile dead-drawer CSS bug fixed; ARIA headings/lists; Badge-as-picture
deleted) · guided-cluster flake ROOT-CAUSED (Base UI popup starting-style vs Playwright stability
— test-side settle gate, users unaffected) · reliable deleted → D112 amended · D115 populate ·
D116 injections · agent-sdk terminal channel BUILT · capability family-floor (3 arms) ·
routing-coherence class killed (the vllm×sonnet 404 was the E2E SEED's partial patch — see the
morning question) · IMP-1 measured (hosted clean; local 28% unlabelled takeover — PROSE-1
territory; the label-LAUNDERING bug fixed) · ChatSummary scent + snippet search · MU+ChoiceBlock
picks pane + game macros end-to-end (read/write/editor) · GM knob editors + EFF-3 honesty ·
databank spec'd+mocked+ruled (build queued LAST) · zTXt · smalls throughout. Mock-vs-rendered
artifact published for the owner; comparison captures in reports/snaps/{projection-final,home-verify}.

**The extraction-mode map is now EMPIRICAL** (spike §4f–§4h — read those before ANY mode work):
hosted strong × folded = the proven path (default) · agent-sdk wire (incl. OR×protocol-auto×Claude —
the two Claude-runtime skins share one backend) = no terminal channel → LOUD fallback round ·
local vLLM × folded = prose-silenced (0/36) → the LOUD `local-engine-fold-guard` arm runs the cheap
round · **cheap = the local champion** (grammar-bound via `tool_choice:"required"`; §4f: only
that and `response_format:json_schema` bind — `"auto"` buys NO grammar on vLLM+hermes) · reliable
was CONTRADICTED by measurement (0/12 hpDelta) and **DELETED 2026-08-01** (owner ruling; axis is
`["folded","cheap"]`, stored values heal to folded, D112 amended, structured machinery survives for
the agent-sdk degrade + resync via `hasStructuredWriter`). Sonnet card "reluctance" was OUR
tokenizer eating malformed opens (§4h) — F2a leniency + F2b example shipped.

## ═══ ▶▶▶ THE QUEUE ═══

### NOW → NEXT (owner-ruled order)

1. **PRE-MULTIPLEX SMALLS** (one batch lane): notifications consumer handles typed error frames
   (today it DROPS them — worst of the class-sweep) · `rpg.stream` gains `withSubscriptionErrors` +
   its stale "nothing throws" comment corrected · **START-1** — `startChat({opening:"generate"})` is
   non-atomic: a dead-engine opening orphans a real committed chat behind the draft + a lying toast +
   duplicate-chat risk (server returns chat id + opening-failure outcome; fork's degraded-not-broken
   catch is the model pattern).
2. **SSE MULTIPLEX — S0+S1 LANDED + LIVE-VERIFIED (08-01 overnight)**: merged at `accaf133`;
   one socket/tab measured on the wire (1 plain · 1 with a GAME open — rpg adds ZERO · 2 across
   two tabs · 0 after close, reap working) via `/api/_debug/stream/sockets`. The rpg gate leak's
   mechanism found+fixed (`use-rpg-bus` re-spelled isRpgEngaged as a null-check — disengaged
   games held sockets); BOOT-4X heal semantics carried into a per-room gate (one home, both gap
   classes, re-proven-to-fail); `single-stream-transport` gate live + ratchet-probed;
   sessions.streamUserEvents + rpg.stream DELETED. **REMAINING: S2 chat (needs its stickler
   pass) → S3 notifications+presence → S4 automation → S5 workloads → close-out ledger entry.**
   Spec `docs/design/sse-multiplex-spec.md`, §14 fully ruled.
3. **HUD-HOME** (owner-ruled 2026-08-01, from the stickler visual audit F6,
   `docs/reviews/stickler/2026-08-01-visual-blech-audit.md`): **the pre-HUD chrome seams in the
   CONTEXT panel get YEETED — the context panel (where the rpg game lives in lite mode) IS the
   HUD's home** (owner lean refined same evening: the panel wholesale IS the HUD when a game is
   active — not a region inside a generic panel; detail rulings deferred to when the program is
   reached — "I'll probably focus on more when we get there"). Spec draft in flight centers that
   arm; its owner-decisions section is where the deferred calls land. Spec-first: the takeover contract, the fate of the meta tabs
   under HUD ownership (lean: they fold into the HUD's own grammar as its admin voice — F6's
   state-vs-admin split is real), the bracket strips' replacement, the reclaimed ~400px dead zone,
   waystone breathing room. Fixes F6's four legibility defects at the seam level instead of
   polishing rented chrome. Sequencing: spec can start now; build coordinates with density S3
   (same surfaces).
4. **W-H FULL SIDE-EYE** — after multiplex S1-ish, needs a MODEL-POPULATED game ([[RV-15 posture|
   seeded-data-never-verification]]). The accumulated list: panel-beauty §4.2 · context-panel
   fidelity re-verify (`docs/design/context-panel-fidelity-findings.md`) · CT-harness band/kicker
   overlap vs the real shell · panel synthesizes `0/max` for UNSET meters (the panel is the lying
   surface now — reminder renders honest carriage) · STREAM-JANK (message box resizes during
   streaming) · inventory-grid tile design vs mock (owner eyeball) · QUOTE-1 hue taste check (new
   amber/apricot/ink dialogue colors) · scene-cards lightbox lacks a render policy (external images
   paint in transcript, not archive) · Status max-edit UX · icon-only meta-tabs at narrow widths.
5. **SET-SEAMS — S0 MERGED; the FULL remaining ladder (spec §8; S1-S4 SERIALIZE on main.tsx;
   ALL of it lands BEFORE DATABANK):**
   - [x] S0 mechanism (registry, owns+partition pin, save-status seam, body union)
   - [ ] S1 appearance — 8-way split, AppearanceForm deleted (LANE IN FLIGHT)
   - [ ] S2 chat-behavior — two sections → chat; pane → {kind:"sections"}
   - [ ] S3 workloads + admin panes → sections mode
   - [ ] S4 system/AppSettings — per-section baselines + AdminOverrideField (Q2 ruled)
   - [ ] S5 O3 amendment — features/tag + features/regex mint + pane move (ruled, D114)
   - [ ] S6 SEAL — delete SETTINGS_SECTION_ANCHORS, make*Pane factories, emptied shells,
     OWN_SUBCATEGORIES; gates updated. NOT DONE until S6 — half-migration is banned.
   §10 fully ruled (system→admin merge at stage 4 · sub-deep-links IN program · Q3/Q5/Q6 as
   recommended).
6. **DENSITY PASS** — approved-to-build; §7 all ten ruled (incl. D6 rounded-card demotion + D7
   Card.padding retirement). **QUEUE-ORDER TENSION (side-eye, 08-01 overnight): the projection
   pane's mock look is UNREACHABLE until density S5 retunes ListRow's instrument scale** (title
   15px vs the mock's 12.5 — honest sequenced debt, the build correctly didn't touch it). The
   owner ruled density stays in queue order BEFORE the projection existed — consider pulling
   S1+S5 forward at the next queue review; morning call. Also P3 owner call: the characters
   picker band shows NO count (keyset paging = any number lies); accept or ship a server total.
   RIDER (08-01 late): the ghost tag-chips (F3-B, merged `98fdff28`)
   are quieter but not mock-TIGHT — box height is dominated by the D62 touch-floor icon buttons
   and the smallest spacing token (field=6px). S1's `--spacing-tight` (4px) + `--radius-inset`
   make mock-tight chips ON-TOKEN — fold chip tightening into the S1/S3 sweep, don't pre-solve.
   Card.padding retirement). S0 computed-value probe FIRST; S3 waits for the panel to stop moving.
7. **WORKLOADS EXIT — STAGES A-D MERGED (D117); the FULL remaining stage-E ladder (report §3.3+§5-E;
   LANE IN FLIGHT; ALL of it lands BEFORE DATABANK — the interactive lane is what makes
   databank-ingest jump the queue):**
   - [ ] two-lane worker + workloads.lane column (kills the §2 head-block)
   - [ ] durable progress column (heartbeat-piggybacked upsert; ring stays)
   - [ ] poison-row visible surface (toView {params:null, poison:true} + proven-to-fail test)
   - [ ] residuals: dead subscribeWorkloadEvents export · AGENTS.md:226 indexer drift ·
     client lane-aware pane grouping
   - [ ] Q4 (OWNER RULED 08-02: YES) — direct stats mutation + wired client affordance +
     sweep classification + auth test
   - [ ] post-merge: STICKLER the stage-E diff (engine + db baseline touch)
   Serde/import-export: verified CLEAN (§4) — stage D killed the entanglement; nothing remains.
   (`docs/reviews/stickler/2026-07-25-workloads-junk-drawer-exit.md`)

### OWNER DECISIONS — ALL RULED (2026-08-01 evening; none pending)

- **`reliable` mode: DELETED** ("reliable can get yeeted") — lane dispatched; stored values coerce
  to `folded` (NO-LEGACY pre-launch), picker copy refreshed (folded=default, cheap=local champion).
- **POPULATE-FROM-CHARACTER: per-character button** on the roster card/takeover, button-only, never
  auto-runs. Build item below.
- **RV-11: the writes are INTENTIONAL — build the readers** (owner: appearance/outfit/thoughts are
  persistent per-character guides, extracted every turn). Design receipts: proposed
  `03-state-and-schema.md:175` ("visible in tracker") + `11-client-ui.md:279-282` (cast row lists
  outfit/thoughts). Lane dispatched: reminder renders them back per cast member (today mood-only,
  `reminder.ts:223` — the model was re-inventing its own guides) + Scene-tab cast card renders them +
  `sheet.flavor` gloss line.
- **Partial-abort persistence: KEEP the pin** — abort persists nothing. Closed.
- **CSP layering: TIGHTEN-ONLY** — deployment block is absolute; lower tiers only restrict. Lane
  dispatched (security-executor): one resolver seam, per-character toggle honest-disabled when
  deployment-blocked.
- **Cast-NPC tracker grants: KEEP explicit-list-only.** Closed.

### BUILD ITEMS QUEUED

- **STICKLER-AUDIT FIX LANES** (owner 2026-08-01: ALL findings, not just top —
  `docs/reviews/stickler/2026-08-01-visual-blech-audit.md`): Lane A character surface (F1 crushed
  search input · F2 portrait-over-label + 34px target · F3 pills→quiet chips, CD3 · F4 panel opens
  populated/overview card) · Lane B list scent (F5 preset subtitles; the "Default (edited)"×9 was the
  FIXED autosave-fork bug's debris — owner-confirmed — so mint numbering is hygiene not fix ·
  F7 chat rows: resolved portraits, star, game marker, receded archived) · Lane C smalls
  (F9 swatch grid · F10 landing glow clip). Dispatch worktree-isolated after the 08-01-evening
  commits. F6→HUD-HOME (queue 3) · F8→density S3 receipt. Residue: ChatSummary last-message
  snippet field (build small) · transcript 1920 gutter verify (may be reading-measure by design) ·
  roster placeholders re-check post-merge · Members tab capture needs the multi-user e2e stack.
- ~~POPULATE-FROM-CHARACTER~~ **BUILT + merged 08-01 evening (D115 minted)** — separate schema
  root, live planes structurally empty, fill-only sheet, host-gated, canPopulate verdict.
  REMAINING: one live-model smoke on a hosted wire (owner's next dogfood click).
- **agent-sdk terminal tools** — the fold on the agent-sdk wire (max-pro-sub + OR×protocol-auto
  Claude skin run the loud fallback every turn). Lane dispatched 08-01 evening. PRIORITY NOTE
  (owner 08-01): the owner mains OR chat-complete + local vLLM — folded already works natively on
  both daily paths; this closes the remaining arm, it is NOT the everyday default.
- **EFF-3** — degrade-warnings client surface + effective-delivery freshness + GM-tab
  recommend-don't-force notes (thinking-off; "cheap recommended for local models"). Urgency
  demoted with the above — the guarded-wire degrade is off the owner's daily paths.
- **Per-actor tracker grant/revoke EDITOR** (`sheet.trackerGrants`/`trackerRevokes` — RV re-audit
  2026-08-01): the fields exist and gate NPC tracker applicability, but NO client editor exists
  (`rpg-game-tab.tsx:42-44` documents the gap). The "keep explicit-list-only" NPC-grants ruling
  DEPENDS on hosts being able to edit the list — without this editor the ruling is a dead letter.
  Home: the takeover/sheet view beside the other per-actor editing (TRK stage-2 primitives).
- ~~KNOB EDITORS batch~~ **BUILT + merged 08-01 late** (`a2c2a730` — six editors incl. the shared
  hint-map editor; EFF-3 effective-delivery honesty landed with it; side-eye flag: fallback WHY is
  hover-title-only, visibility is a copy/layout call). **`config.userMacros`: OWNER RULED (08-01
  late) — WIRE THE READ END** (own chat-domain lane: game-config macros register into the turn
  beside the preset's; collision policy game-shadows-preset; editor after). QUEUED behind the
  ChoiceBlock lane (shared domain/chat contract files). EFF-3 residual (documented in headers):
  the runtime no-terminal-channel arm is post-turn-only — such a room still reads "Live".
  Same-ruling closures: card-note mute stays DEAD (no replacement knob until missed in play) ·
  ST export stays ONE-WAY (no note_prompt heuristic) · snippet search LANDED (`86f172e0`).
- **PROSE-1 — S0 MACHINERY LANDED** (`174bbad2`: prose-slot/prose contracts split [depcruise
  type-only cycles], two-rung resolver, prose-baseline.json with BOTH refusal arms probed live,
  17 slots incl. the impersonate nudge as editable data with the IMP-1 probe named as its
  iteration instrument). **LADDER RULING (logged): the escalated tool-description fork = option
  (b)** — rows 37/90 move to S5's close-out with the rest of the tool-description class (one
  migration, not two; widening the sealed resolveTools seam waits for the class). S2 CAVEAT
  recorded: guidedActions defaults materialize at zod PARSE time — "unset" unrepresentable, so
  placeholder-as-default can't work there until the storage semantic changes. NEXT: S1 app-tier
  cohort (clean threading paths named: resolveChatHostUserId precedent) — dispatch AFTER
  SET-SEAMS S0 merges (shared settings territory); then S2 editors → S5 gate+ledger.
- ~~IMP-1~~ **MEASURED + landed what the data justified** (`4fa8a65b`, 84 real gens,
  `scripts/probes/impersonate/RESULTS.md`): hosted 0/12 clean · local 8B **28% bleed, dominant
  class = UNLABELLED first-person takeover** (invisible to every mechanical layer, ST's included).
  Fixed the real bug found: impersonate inherited ASSISTANT-turn cleaning and LAUNDERED leaked
  `Char:` labels into the composer as the user's words (self=persona now; labels survive for the
  reviewer). Stop-string layer built as ST-parity INSURANCE (never fired in 84 gens — do not cite
  as the fix). **OPEN (owner-adjacent, prose territory): the 28% unlabelled class** — only nudge
  iteration (the probe's fixture set is the harness — long-scene 3/3 reproduces), model choice,
  or a review-UI tell ("this reads like {{char}} — regenerate?") can move it. Folds naturally
  into PROSE-1 (the impersonate nudge becomes editable data there — iterate it against the probe).
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
- ~~#24 MU-picks pane~~ **BUILT + merged 08-01 late** (`24e4f38d` — incl. the missing READ,
  `chat.getUserMacroPicks`, least-privilege: members get identity+inputs, never macro bodies).
  FOLLOW-ON small: the ChoiceBlock picks sibling (getVariables/setVariables) still has zero tRPC
  procs — wiring it into the same Section makes the spec's "one pane, two knob families" true. ·
  **DATABANK SURFACE — SPEC'D + MOCKED + RULED (08-01 late), build QUEUED LAST** (owner: "own
  rail section... they look good. this can go at the end after everything"). Spec
  `docs/design/databank-surface-spec.md` + artifact-published mocks. D-0=own 9th rail section ·
  D-1..D-7 as recommended (listGlobal twin · sources on the active view · workloadId ingest
  progress · rack after Injections · home tile). Legacy audited CARRY/REJECT, 5 named defects
  die. S1-S3 fork-independent; RowToggleAction minted by the projection lane (first). DISPATCH
  after projection + home + SSE stages land. · **AU-10** background-library manage UI ·
- **VER-1c** — custom-byo `role:"tool"` wire still drops `isError` silently (OR-4's unbuilt sibling).
- **Preset multi-tab fork idempotency** — two tabs editing the built-in can still mint two forks (no
  `forkedFrom` column; cheap when it bites).
- **`ChatRpgOps.gatherTurnContext` args-object refactor** — 5 positional args, 2 lite-ignored
  (~35 call sites; honest-shape debt from the regen threading).

### SMALLS / HYGIENE

- **ORPHANED OPEN ITEMS boarded from the archive sweep (08-02):** w4-my-lane S1 — `fireRpgTurnCompleted`
  still AFTER the turnCompleted emit (`engine.ts:1238`; report carries the exact patch, option 1) ·
  join-history ruling #8/F6 — floored fork's variable carry (`fork.ts:383`). SEVERITY NARROWED
  (owner + code, 08-02): fork is gated host-or-sole-present-human, floor is OPT-IN — the leak path
  needs floored member → becomes sole human → forks. Kept because fork's own §3.6 strip already
  covers content+reasoning on exactly this path; VARIABLES are the one missed plane, + the
  no-baseline divergence half is floor-independent. Small consistency fix, low priority. ·
  contracts-audit F6 — `DEFAULT_BLUR_SURFACES` (3 members, zero consumers) vs schema default `[]`
  (two-line fix; closing it archives that whole audit) · Button wrap/multiline size variant
  (clears ui-size-via-variant's 2 debt rows).

- Macro feed (`chat-ops/macro-view.ts`) cast projection does NOT carry the new guide fields
  (appearance/outfit/thoughts) — RV-11 lane left it deliberately. Decide: should user macros be able
  to bind cast guides via celBindings? If yes, thread them; if no, note the asymmetry in the file.
- PRESET-PANE FOREVER-SKELETON — **NOT REPRODUCIBLE (08-01 diagnosis: ~25 live loads, every
  composition path incl. forced-race + socket-loaded + mobile + the original DB — rows every
  time; all four suspect classes ruled out with receipts).** Likely original sighting = a
  `--dirty` stage rsync-restart artifact (502s mid-load against the suspended boundary — the
  class was caught live). DEMOTED to needs-a-repro-recipe; reopen only with stage mode +
  `__orb.queries()` capture for `preset.list`. PARKED design note (latent hazard, not a bug):
  presets is the only `useSuspenseQuery` library list — a cancelled suspended query hangs with a
  clean cache; moving it to the Characters `useQuery`+SkeletonRows pattern changes the shared
  `LibrarySurfaceShell` contract (world-info rides it) — owner-taste design call if ever wanted.
- Chat-row rpg/game marker SKIPPED by Lane B (correctly): `ChatSummary` carries no rpg pointer and
  rpgRouter has no list-games query — needs a contract field; fold into the ChatSummary
  last-message-snippet field work (one migration, both markers).
- ~~BUS-FLAP~~ CLOSED (dev-only StrictMode double-invoke of the devlog MIRROR effect; the wire
  opens ONE socket — server-log receipt; causal StrictMode probe). · ~~BOOT-4X~~ FIXED
  (`46d75eaf` — heal starts from the SECOND connection; 4 wasted round-trips/load gone; both CTs
  proven-to-fail against old code). · ~~VERIFY-BURST~~ CLOSED (claims held live: 2/2/0 across all
  three drives, zero tripwires). · ~~✨-PERSPECTIVE~~ CLOSED (works end-to-end; the old "zero
  traffic" was a blind instrument — subscriptions bypass loggerLink by design).
- **rpg.stream SOCKET-GATE LEAK** (found by the stage drive, unchased): rpg.stream opens on a
  plain HOME route with no chat + doubles after one chat open — the use-rpg-bus header's law
  ("non-game chat holds no socket") is NOT holding. ROUTED to the SSE S1 lane as must-cover
  (find the mechanism while swapping the body + the missing zero-attach CT).
- ~~LIVE DEV DB broken routing pairing~~ **CLASS KILLED + row SELF-HEALS** (`2586a2d0`): the
  doorway was PARTIAL DEEP-MERGE patches (a patch naming source without model is a no-op on the
  stale model key), and the exact bad row was written by `tests/e2e/support/global-setup.ts`'s
  role patch — the pane was innocent. Now: write-boundary coherence (source-without-model gets
  model:null; a pin on a config-derived source is REFUSED), read-side heal with a WARN naming
  stored vs resolved, ONE (source,role)→model home shared by pane + resolver, and the display
  names an ignored pin instead of labeling it "server config".
- ~~⚠ OWNER MORNING QUESTION: an e2e run wrote to the DEV stack~~ **ANSWERED + STRUCTURALLY FIXED.**
  The isolation memory was wrong for ONE project: the `single-user` mode-project was DEFINED on the
  dev ports with no `DATABASE_URL` (`tests/e2e/support/modes.ts`) and `reuseExistingServer` locally
  (`playwright.config.ts`), so every local `pnpm e2e` / `pnpm e2e:smoke` (the `verify --push` browser
  lane!) attached to the running dev stack and ran globalSetup's unconditional `pinRouting` against
  the LIVE DB. Now: single-user owns an isolated stack (8796/5181 + `.cache/e2e-single/orb.db`), every
  mode boots with `E2E_HARNESS=on`, `/healthz` reports the stamp, and globalSetup HARD-FAILS on an
  unstamped or dev-port target (`tests/e2e/support/target-guard.ts`) unless `E2E_ALLOW_DEV_TARGET=1`.
  Verified: full `pnpm e2e` 30/30 green on the isolated stacks; the dev stack's `/healthz` carries no
  stamp, so the guard refuses it.
  Related note: `import-user-settings` bypasses the new write guard (whole-blob verb) — imports
  heal+warn at read instead of refusing at write; lift the guard into the import path on want.
- WAKE-STATUS: the 3s engine wake is silent (spec accepted the wait); revisit if it feels laggy.
- ~~Freshness DEFERRED debt~~ **ALL WIRED (`b0d35cee`)**: 12 stats.* keys ride chatsChanged (the
  cost argument was FALSE — refetchType:"active" means hidden surfaces pay one stale mark, not a
  fetch); assets.listOwned rides the new use-upload-asset front door (proven load-bearing CT);
  DEFERRED registry now EMPTY. Residuals recorded in the seam: rename/star over-fires a spare
  stale mark; chatless imagery.editImage under-fires (needs a stats-grain producer event).
- Scout: `connection.getCatalog`/`getAgentSdkCatalog` appear in admin `invalidates` with zero literal
  consumers — aliased reads or dead rows.
- `composer-guided-cluster.ct` flake — **MECHANISM FOUND (08-01 overnight): Base UI NESTED-SUBMENU
  timing** — the ✨ menu's Plot submenu intermittently never opens ("game steers" test, line ~448;
  3×fail-then-pass pattern observed twice, screenshot shows menu open + submenu collapsed). Fix =
  a submenu-open wait/retry idiom in the test or a Base UI hover-intent workaround — not a timeout
  knob. Also the original whole-file 30s note stands (no per-file timeout idiom exists repo-wide).
- Personas list: owner RULED FINE AS-IS (08-02) — no grammar sweep needed; do not re-board.
  "People" = the roster's HUMAN SUBSET (no tab exists; app-root comment corrected); multi-human
  verification parked with D22.
- ~~blurSurfaces~~ ALIVE (full wire verified, CT-covered — closed). · ~~useListDocked~~ KEPT with
  an honest header (the ONE sanctioned list-pane-visibility read for section bodies; deleting it
  re-opens the M10 hand-copy class — closed).
- `staging.ensure` residual: first-write-wins seeded from HEAD — dormant unless rpg tools ever mount
  as REGISTRY tools again (D112 keeps `tools: []`); reroll accumulation would return via that seam.
- R5b(a) verify: `refEnumerationLines` (non-enforcing-backend prompt fallback) should enumerate
  active conditions post-R5a — confirm stage-1's R6 build carried it; ~2 lines if not.

### PROBES / OPTIONAL

~~F4/F4a/F5/OR-5/OR-7~~ **ALL MEASURED 08-02** (`scripts/probes/openrouter/RESULTS.md`, $0.32):
F4 any tool-payload byte change re-bills the WHOLE prefix · F4a effort KEYS the cache (entry per
effort, no invalidation) · **F5 native thinking depth is UNREACHABLE via OR (205 vs 5783 tokens,
28×; tool-call counts unaffected)** — the agent-sdk skin (terminal channel now built) is the
deep-thinking path · OR-5's under-cache hypothesis REFUTED (lookback serves reads; waste = one
small write/tool-depth) · OR-7 replaying reasoning is safe SIGNED, hard-400 unsigned.
**FOLLOW-UP QUEUED (the one actionable): F4-CACHE-VOLATILITY** — `buildToolRoundWireTools`
re-renders descriptions + ref-constrained schemas from LIVE game state every call
(compose/rpg.ts:407,411), so each new condition/actor re-bills the entire prefix (~10× that
turn). Verify whether that path's system block is already per-turn volatile, then pick between
RESULTS.md's two options. Honest gap: large tool fan-outs vs the ~20-block lookback (unmeasured).
Still open: #16 engine auto-sleep/wake live pass · D22 member-tiers (multi-user stack).

### DISCUSSION PILE (owner, no build)

☰ **UNSENT-DRAFT RELOAD PERSISTENCE** (from the home side-eye's "temp draft data loss" — NOT a
bug: nav round-trips keep everything, proven by a composed CT; only a PAGE RELOAD loses an unsent
draft because the active-chat handle + composer text are deliberately unpersisted while
activeSection persists). Fork: should an unsent draft (seed + typed composer text) survive a
reload? Persistence-design call, not a fix — the current behavior is by design.

☰ **LIST-PANE PROJECTION — RATIFIED (owner, 08-01 late): Arm A + Arm B approved, C rejected;
the MOCKS' look is the approved target** (`docs/design/list-pane-projection-proposal.md` + mocks;
remaining D2-D10 stand as recommended). Stickler resumed for §11 primitives inventory (the
fugly-prevention list — what @orb/ui needs before building) + §12 row-action grammar (owner:
"I REALLY hate having to click the three dots in list view" — inline/hover actions per row type,
D62 touch-floor math, one grammar for ALL list panes, kebab keeps destructive/rare only). Build
lanes L0-L4 dispatch after the primitives pass lands. **HOME RULED (owner, 08-01 late, on seeing the mock): "landing goes to home"** — H1 = home is
the BORN DEFAULT + the chat landing SLIMS (the coupled pair, ruled together); H2-H11 stand as
recommended. Home build (H0-H4 per `docs/design/home-section-spec.md`) queues BEHIND the
projection build (shared door files) — dispatch on its merge. GM-tab game-macros editor = small
follow-up (read end + write arm landed `cad777f9`). [superseded fork below:] Confirmed: `shell-store.ts:89` defaults
`activeSection:"chats"` (home = chats tab + the chat-owned landing surface). Fork: resume-first
(keep chats-home; Arm B makes it a real mixed launcher) vs face-first (flip default to characters;
Arm A's launcher pane is the canonical entry — a one-line change) vs the HOME section (spec in
flight) as default. **PLUS the owner's held-back option, kept alive: MERGE characters+chats into
ONE rail glyph** — he considered it, went with A+B; note that A+B CONVERGES toward it (the two
sections become behavioral mirrors), so post-landing the merge is a cheap rail-level edit
(one glyph, one section, both flows), not a redesign — composes with home (rail: Home ·
Library&Chats · rest). Rule by feel after A+B + home land, not before. Deeper samey diagnosis
(owner): every rail entry unrolls the IDENTICAL tri-pane anatomy — home is the first mold-breaker. [superseded musing below:] the stickler audit
fixed row CONTENT (scent — landed); the pane's per-screen EXISTENCE is an open IA call. Arms
sketched: (1) auto-collapse to a slim glyph rail once a chat is open (cheap, reclaims ~280px) ·
(2) live-instrument rows (activity/streaming indicators; snippet landed) · (3) contextual content
per screen (in-chat = that chat's forks/branches/bookmarks tree). GUARDRAIL (D18 rationale rider,
recorded same night): "chats with this character" surfaces must be filtered PROJECTIONS of
first-class chats — never re-derive the ST launcher coupling. Same family as HUD-HOME; consider
one IA focus session for both. · Snippet SEARCH (filter-chats matches title+names only — include
message content?) is a cheap adjacent call.

☰ **RV-13 second half — branch-and-save game modes**: the ruling (freeform demoted, d20-in-lite is
the direction) is doctrine, but the BUILD — "branch off + save your own game mode derived from the
prebuilt d20" — was never queued. **SEQUENCING (owner, 2026-08-01): deliberately AFTER the
hardcoded-constants-become-user-slots work** (PROSE-1 + knob editors + tracker-def editors) — a mode
fork is only as useful as what's overridable in it; build the slots first, then the fork model has
real payload (tracker defs, teaches, steering prose, extraction knobs). Spec then. · chat-options placement (D111 clause OPEN, breaks nothing) · persona=character design pass
([[persona-pin-prompt-resolution]]) · Meteocons artwork fork (~8 icons, MIT) · grimstone theme
(parked) · flakes/facelift micro-ledgers.

## ═══ STANDING FACTS + POSTURE ═══

- **LAUNCH-PREP CHECKLIST — h3/QUIC (five minutes, deployment-level; the multiplex already did
  the app-side prep):** verify Caddy h3 enabled (default since 2.6) + **UDP 443 open** (the classic
  silent miss — browsers fall back to h2 via Alt-Svc and never tell you) · the 15s SSE ping
  already keeps QUIC NAT bindings alive · 0-RTT stays off non-idempotent (Caddy default) · do NOT
  add TCP-era tricks (sharding, server push — dead; 103 Early Hints if ever needed). Dev stays
  h1.1 deliberately (a STRICTER transport test — the starvation class was only visible there).
  Optional: a local Caddy h2/h3 profile for occasional prod-transport feel.

- **OVERNIGHT FULL-AUTO: ACTIVE (owner, 2026-08-01 late).** Proceed through THE QUEUE in ruled
  order without blocking; stuck = the escalation ladder (stickler → ast/code → docs → judgment),
  log the reasoning here. Blocking questions ONLY for destructive/irreversible, owner-sacred
  (persona pin), ORIGIN PUSHES (still need the per-push word — do NOT push overnight), genuine
  scope pivots. Stack/engines pre-authorized. In flight at activation: 8 lanes (F3 swap · GM-tab
  wave · ChatSummary scent · MU-picks · preset-skeleton diagnosis [holds the snap stage] · smalls
  batch 3 · guided-sampling kill · injections/authors-note collapse). After they drain: SSE
  MULTIPLEX S0→S1 (→S2 with its stickler pass) per the ruled queue; stage-needing smalls
  (VERIFY-BURST · ✨-PERSPECTIVE · BUS-FLAP/BOOT-4X observation) serialize on the stage after the
  preset lane frees it.

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
