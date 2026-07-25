# Retro Workboard — post-burn-down improvement program

> **Living work doc**, not law (the constitution + D-ledger stay authoritative). Written 2026-07-24 so the
> diagnoses and rulings survive context compression. Each item carries its CAUSE (traced, with file refs)
> and its RULING (owner-sanctioned fix shape). Baseline: commit `a4192372` (burn-down complete, full
> battery green: check PASS · 6859 vitest + 1209 CT · e2e 11/11) + `3469212d` (worktree-shared vLLM
> stores) + `34d1829a` (live spec CTA repoint).

## ═══ RESUME-HERE STATUS (2026-07-24 late, compaction-survival — read THIS first) ═══

### ═══ OVERNIGHT AUTONOMOUS (2026-07-24 night, Fable 5) — read THIS first ═══

**MISSION (owner, autonomous for the night):** DRIVE THE LIVE APP and prove behaviors, pin them as tests —
**behavior + data-flow, NOT layout snapshots** (a facelift is coming; hard-coded layout tests are banned by
owner). PRIMARY: **group chat**. Prove: all group-chat modes + their special options/types; single-human
multi-character; **multi-human multi-character** (observe flow between two humans, verify the BUS is correct);
add/remove characters to a chat; add/remove humans; **solo→group conversion** (add chars); the group panel in
the context panel is properly set up. The **four-panel context layout is LAW** — verify group mgmt lives
within it, don't invent panels. THEN (ongoing): character options drive the app · presets do what they mean ·
settings apply for real · world-info + guided actions. **RAILS:** local vLLM ONLY (gen :8703 — zero hosted
spend); testing DB is DISPOSABLE (delete/seed freely); serve from THIS retro repo (verify); leave GPU0/ComfyUI
+ the engine launcher alone (engines already up GPU1); no account creation / credential entry / external
irreversible actions — PushNotification the owner on a milestone or a real blocker. Keep THIS doc updated
every chapter so nothing is lost across compaction.

**LIVE GROUP-CHAT VERIFICATION (2026-07-24 night, driving :5173 single-user + local vLLM):**
PROVEN WORKING: solo→group conversion (Add-a-character flips a solo Mara chat to group; context panel gains
the 4-tab LAW layout **Members / Overrides / Group / Injections**, +**Preview** once committed); full group
config surface all wired (Per-speaker/Narrator · policy "Who speaks each round"=Natural incl list/pooled/manual
· cardScope · memberCardVisibility=Character-sheet · autoMode · speakerTags · groupNudge); a real group turn
fired on local vLLM — under per-speaker+natural, **Mara spoke turn 1, Niko turn 2** (ban-last-speaker rotation
WORKS); responses in-character + followed the instruction; variant/swipe + Speak-as-character present; persona
macro {{user}}→"You" resolved. Members panel = CAST section w/ per-seat Talkativeness (50%) + Mute.
**BUGS FOUND (2):**
1. **remove-character was UNWIRED** — domain verb existed, no tRPC/no UI (Cast row menu had only Mute +
   Talkativeness). FIXED+COMMITTED `073c39b9`: tRPC `removeCharacterFromChat` (sweep=PROBED) + client
   "Remove X from chat" menu + tests green. NOTE the executor matched the LOCAL member-row-menu §8.1 OMIT law
   (host actions omitted for non-hosts, 6 siblings + a CT pin it) rather than the "no separate reduced modes"
   memory (disabled-with-reason). FORK FOR OWNER: is "no omissions ever" meant to supersede §8.1 repo-wide?
   That's a separate campaign touching all 6 actions, not this ticket.
2. **Composer does NOT clear on the FIRST (draft→commit) send** — send a msg in a NEW chat: it sends + the turn
   fires, but the composer textarea RETAINS the sent text; the 2nd send (committed chat) clears fine. So the
   draft→commit migration carries the composer text to the new chatId key instead of clearing on send.
   FIXED+COMMITTED `073c39b9` — root cause was a stale-closure key mismatch (clear listener bound to the DRAFT
   scope key at send time); fix = hold onChange in a ref, clear post-commit. CT red-without/green-with.
PREVIEW TAB (assembly-preview-panel, host-only) = the fidelity smoking gun, WORKS: shows the assembled
prompt "What the model will see on the next turn", a token estimate (local QuadChars, advisory), AND a
PROVENANCE panel "Where each field's value came from" (Scenario from Mara, the char description/personality
assembled from the card). For the per-speaker group turn the static system prompt read "You are Mara … write
Mara's perspective ONLY" — so the single-speaker constraint IS correctly in the prompt. → The earlier
multi-character "Mara: … Niko: …" blob in Niko's turn is the small local model (Qwen3-VL-8B) DISOBEYING a
correctly-scoped prompt, NOT an app bug. App fidelity confirmed; model obedience is the weak link (expected
for an 8B). This validates the FE→prompt chain live and is exactly the "prove character options drive the
app" surface.

COVERAGE ALREADY STRONG (assessed, no big gap to manufacture — owner bans shit tests): select-speakers.test.ts
pins ALL policies (natural/list/pooled/manual/smart) + ban-last-speaker + talkativeness + @mention hard
override + eligible-set predicates; emit-chat-changed.int.test.ts pins the chatsChanged fan to EVERY present
human, never a non-member; chat.streamMessages tests pin the per-yield membership gate + kicked-member
mid-stream cutoff + durable-first resume. So the multi-human bus + speaker engine are well-proven at the
integration layer; live-confirmed the happy path. Multi-human LIVE would need multi-user mode + a 2nd identity
(single-user instance) — deferred; integration coverage already carries it.

ROUTE HEALTH BASELINE (pnpm snap, 2026-07-24 night): `/` `/presets` `/characters` `/world-info` `/corpus`
all render CLEAN — nav=OK, page-errors=0, failed-req=0, contrast-fails=0, deadcss=0. No broken routes. PNGs
in reports/snaps/night-*.png. (Minor: long-task ~126-168ms on `/`.) **USE `pnpm snap <route> [--eval …]`**
for further live looks — far lighter than chrome-devtools a11y dumps (owner's steer).
**NEXT AREA (owner's secondary list, not yet behaviorally verified):** do presets/settings/world-info actually
APPLY? (health is clean; need: change a preset knob → observe it in the Preview/wire; toggle a setting → observe
runtime effect; a world-info entry fires on its keyword → lands in the assembled prompt via the Preview panel).
The Preview tab + the wire-capture seam are the observation instruments. Multi-human LIVE needs multi-user mode
+ a 2nd identity (DB is disposable — owner OK'd wiping/seeding).

FULL BATTERY (post-commit, `pnpm test`): vitest all green + CT 1271 passed. ONE CT hard-failed UNDER BATTERY
LOAD — `message-list-surface.ct.tsx:305` (chatOpened non-advancing-cursor seq-guard/invalidation, a
timing-sensitive test) — but PASSES CLEAN IN ISOLATION (9/9, 0 flaky via `playwright test -c
playwright-ct.config.ts message-list-surface`). Confirmed FLAKE not regression (my _ct-stories change was
purely additive — a ChatRoomHarness button + a members-panel prop, never touches the MessageList stories or
the shared chatStream mock). Also: don't run a commit's whole-tree static gate CONCURRENTLY with `pnpm test`
— the gate-conformance tests litter `packages/server/src/domain/__dc_*` transient fixtures that trip
structure:full until they clean up. Serialize commits after the battery.

**FIDELITY/LOCKDOWN WAVE — COMMITTED (this session):**
- `4c734060` — extracted the domain→infra turn bridge into exported `createRunChatTurnBridge`; the #24
  fidelity harness now drives PROD code, not a facsimile (owner caught the facsimile).
- `20ac4154` — **customParameters is BYOK-ONLY** (owner ruling; see [D-LEDGER CANDIDATE] below). Removed from
  OpenRouter (both runners; `mergeCustomParameters` deleted); custom-byo keeps it (preset-wins). D41
  `custom_parameters_ignored` warning on OR. TRUE-WIRE capture: OR capture reparses through the SDK
  `$outboundSchema` (snake_case literal wire) + tripwire test; captureWire threaded into OR+custom-byo (were
  blind); custom-byo scrubs body-borne creds; bridge sets chatId on the stateless arm (debug ?chatId= filter).
- `0d26921a` — multi-surface fidelity matrix (vLLM full-4-layer + OR cc/responses + custom-byo + agent-sdk,
  all through the real bridge; pins OR-drops-customParameters + custom-byo-customParameters-WINS as law) +
  26 chat behavior CTs + a component-presence ratchet (tests/tooling) + #25 custom-byo redirect:"manual" pin.

**[D-LEDGER CANDIDATE — mint when convenient]:** customParameters BYOK-only. First-class/known providers
(vLLM, OpenRouter) use the MODELED sampling surface ONLY (the anti-SillyTavern-sprawl design — one
ResolvedSampling → each backend's wire); customParameters is the passthrough escape hatch for BYOK/unknown
endpoints (custom-byo) where you can't model the endpoint. OR leaked it via the shared chat-completions arm;
removed. Provider routing (`OpenRouterProviderRouting`) is DORMANT/RESERVED (contract + wire projection built,
middle hop unwired, no UI) — owner chose leave-dormant.

**TASKS: #24–#27 DONE. #18 partial** (26 CTs + ratchet landed; deferred gaps flagged: assembly-preview-panel
#28, injections-manager). **#12 held trio** (PD-147 ×8, BG-C/V ×16, section-hint ×2) — awaiting owner's
launch-now-vs-one-beat call. **Promotion to main still armed.**

**POST-ROTATION-4 FIX (2026-07-24, UNCOMMITTED — owner caught it): #24 harness was NOT using prod code.**
The fidelity harness drove a hand-rolled `harnessRunChatTurn` that reconstructed a LOPPED-OFF subset of the
real domain→infra bridge (chat-completions arm only; DROPPED customParameters/tools/toolChoice/
responseFormat/cacheBreakpoint spreads + the final-chunk economics). A fidelity tool testing a facsimile
can't catch a bug in the real mapping. FIX: extracted the inline `runChatTurn` generator from
`buildChatService` (compose/chat.ts) into an exported `createRunChatTurnBridge({ runChatTurn,
getOrSkinTierModels })` — behavior-preserving (2 `input.`→`deps.` swaps, nothing else) — barreled it via
`entry/compose`, and rewired the harness to call the SAME function, injecting only the leaf infra surface
(canned-SSE vllm client + captureWire sink) + a rejecting skin-map (agent-sdk arm unreached). Now the
name/history/max_tokens/DB assertions run through PROD code incl. real economics. Green: 89 files / 1045
chat-domain tests, type-clean; harness 5/5. NOTE: the dropped passthrough fields (customParameters etc.)
are mostly NOT vllm-surfaced — proving those needs a 2nd surface (custom-byo) row = a real follow-up, NOT
faked. Verifier dispatched on behavior-preservation. Files: `packages/server/src/entry/compose/chat.ts`,
`.../compose/index.ts`, `tests/server/domain/chat/wire-capture-fidelity.suite.int.test.ts`.



**COMMITTED (branch retro-burn-down, promotion-ready):** `a4192372` burn-down → `7c31da30` rotation 2 →
`7ff2e410` rotation 3 → `f110bcb7` docs corpus carry → `0272c980` live-sweep red fixes → `cca5037c`
workboard closeout. Tree state at last full run: check PASS, 971 vitest + 1236 CT, **full live e2e
24/24 green** (all 3 vLLM engines on GPU 1, gen has `--override-generation-config repetition_penalty
1.05` as a SESSION mitigation for #23). Original 13-item doc ≈ 10/13 done.

**ENGINE TOPOLOGY (owner reclaimed GPU 0 for ComfyUI):** all 3 vLLM engines hand-launched on **GPU 1**
via `CUDA_VISIBLE_DEVICES=1` + the shared buildEngineSpawnSpec argv (embed :8701 util 0.14, rerank
:8702 0.22, gen :8703 0.5 + rep-penalty 1.05). GPU 0 = owner's ComfyUI. The dev-server adoptive
supervisor adopts these. NEVER run the launcher live to "verify" (spawns real engines — see memory).

**IN FLIGHT (5 lanes, all path-disjoint, dispatched late session — check TaskList + agent inboxes):**
- **#24** fidelity harness + wire-capture seam (infra/providers/backends + tests). WIRE_CAPTURE env
  flag landed (default off, host-read /api/_debug/wire/captures). STEERED late (2026-07-24): the CORE
  harness is an INTEGRATION test — inject the wireCapture SINK via compose dep (rpgTrace-injection
  pattern, bypasses the env), drive turns through the real pipeline against a capture-and-return STUB
  provider (fidelity needs the REQUEST BODY captured at dispatch, NOT a live model), assert 4 layers
  (input / getShapeTrace+peek / captured wire body / canon) over the names-behavior/structure/
  injection/caps matrix. Deterministic, no live stack/GPU/env, gates normally. The @live e2e is a THIN
  optional proof that skips-with-message when WIRE_CAPTURE is off on the operator stack (never false
  pass). Had an in-flight typecheck red (services.ts:280 captureWire/WireCapture.at) — its own to fix.
  Reverted its stray edit to .env (a symlink → MAIN repo's .env; do NOT edit .env). Needs a VERIFIER
  when it lands (a cross-layer-divergence tool must not false-green its own capture).
- **#23 DONE** (uncommitted): sampling-override LAUNCH knob landed — gen argv permanently carries
  `--override-generation-config {"repetition_penalty":1.05}` (env-floor `VLLM_GEN_REPETITION_PENALTY_DEFAULT`,
  admin-retunable `genRepetitionPenalty` field + pending-restart, per-engine emit map). 76 vitest + 17
  CT green. Deferred (→ #24 coord): preset→stateless-body penalty threading (body.ts:62-68 already
  ACCEPTS repetitionPenalty; does a preset populate it?). NOTE: #24 has an in-flight typecheck red
  (services.ts:280 captureWire/WireCapture.at) — #24's own to fix before it lands, NOT #23's.
- **#22 DONE** (uncommitted, awaits consolidation commit): execution-membership verify gate landed —
  new scripts/verify/tests-execution-membership.ts, wired into the registry + package.json + verify-run
  pins + docs. Both directions proven-to-bite (orphan file REDs; empty glob REDs). Real tree clean (no
  orphan/dead-glob). New stage green; the other 6 red static stages are other lanes' uncommitted files.
- **#12-fixes DONE** (uncommitted): all 16 audit items landed — 2 data-loss killed (failing-generate
  keeps prompt; groupOnly survives edit round-trip), warning-notice restored + wired (maps #9's
  context_trimmed_no_summary/compaction_failed), a11y (autosave roles, composer bg-card, turn-abort
  toast, markdown break-words, world-info reorder + handleLabel), 2 restorations (composer-draft-store
  survives remount + migrates on commit; ShapeTrace panel — dropped main's `hint=` since that primitive
  is the held-trio's, panel uses its own Text line), credential dead-doors (inspector + revoke/clear).
  28 unit + 27 CT green. Its #21 flag RESOLVED by orchestrator: inspect.ts:86 already scrubs the
  response bodyPreview by secret VALUE (redactSecretsFromText) — the echo-leak sink is safe. NOT the
  held trio (PD-147/BG/section-hint — still a future wave).
- **#21 DONE** (security-executor, its own review = the verification): 3 scars CONFIRMED-SAFE +
  hardened the BYO inspect redirect credential-exfil (redirect:"manual" host-pin); pinned the 2
  previously-unpinned scars. Spawned **#25** (same redirect fix for custom-byo/runners/chat.ts, behind #24).

**HELD (sequenced, not forgotten):** #12 held trio (PD-147 ×8 files, BG-C/V ×16, section hint ×2 — big
multi-file FEATURES, own wave); **#18** CT coverage expansion (42-scenario mining backlog + presence
ratchet — needs #12's landed components as evidence, runs after #12).

**PROMOTION** armed for owner's go: legacy-main bookmark → `git branch -f main <HEAD>` → worktree
switch → push legacy + force-with-lease main (origin = github Inktomi93/orbweaver). Ceremony is
independent of the in-flight lanes (all additive atop committed rotation 3).

**ALL 5 LANES REPORTED (tree quiescent, uncommitted together)**: #21 (done, security-executor-verified),
#22 (execution gate, both-directions bite), #23 (sampling launch knob, 76+17 green), #12-fixes (16
items, 28+27 green, its #21 flag resolved — inspect.ts:86 scrubs response bodyPreview by value),
#24 (fidelity harness — RESOLVED the fork: agent-sdk has NO observable wire body, captures SDK QUERY
INPUT not a reconstructed HTTP body; matrix all-agree; compose-injected prod-safe sink). #24 IN
VERIFICATION now (a divergence-tool reporting no-divergence must be proven to actually bite —
esp. the null-fingerprint row not passing vacuously on an empty capture).

**IMMEDIATE NEXT (post #24-verify):** run the FULL gate on the quiesced tree (it was red only from
cross-lane uncommitted files — should go green now) + full battery + full live sweep (WIRE_CAPTURE stays
off; the @live fidelity leg skips honestly) → ONE CONSOLIDATION COMMIT for the whole wave (#21/#22/#23/
#12-fixes/#24) → update this block. THEN board = promotion (armed) + #18 (now UNBLOCKED by #12's landed
components) + #12 held trio + #25 (runner-redirect). Details of every item in the sections below.

## Standing rules minted this program (also in agent memory)

- **THE RIGHT WAY, ONCE (owner, 2026-07-24 — relay into every dispatch)**: "we do things the right way
  once even if it means more work. If there isn't something, then we build it (on the orchestrator's
  approval). No shortcuts or cop-outs. E2E testing is how we know our app works the way it is supposed
  to work." A missing seam/affordance/test-hook = a reported gap with a proposed shape, built on
  approval — never a workaround. E2E legs proving the real user journey are expected deliverables;
  a deliberately-deferred proof is named as an explicit known-gap, never silent.

- **Exhaustive, not minimal**: test coverage and handling are exhaustive by owner ruling — build shared
  kits over per-spec dodges; the global quality-over-quantity test preference is overridden here.
- **No separate reduced modes**: a not-yet-ready state (draft/empty/unprovisioned) renders the ONE real
  surface with inapplicable affordances DISABLED — never a sibling reduced component.
- **Hardcoded values and per-provider specials are the enemy** — generalize; single-home every constant
  (env-own it when two homes must agree, with a parity test). REFINED (owner, 2026-07-24): provider
  keying is legitimate SOMETIMES — when the mechanism is provider-NATIVE (no general form exists to
  write; compaction's sdk machinery — CLAUDE_CODE_* knobs, session-frame formats — is the type
  specimen). The discipline: provider-native code lives INSIDE that provider's backend module behind
  the general seam; the disease is provider special-cases in shared/domain code where a capability
  axis should carry the difference. New candidate exceptions = case-by-case, owner call — lanes stop
  and ask, never improvise one.
- **E2E spends nothing**: `tests/e2e/support/global-setup.ts` pins routing.roleDefaults to vLLM/agent-sdk
  before every run; the routing-honesty spec is the regression guard that the pin is HONORED (settings →
  resolved connection → engine-log traffic → canon `model` on the row). Caveat: the seed writes the real
  single-user settings row — running e2e leaves routing pinned to vllm (restore-after is an open decision).
- **The e2e suite is a BASELINE, not scripture**: it is days old and has already needed three of its
  own specs corrected. Lanes cite it as current evidence and improve it freely — never contort new work
  to match an existing spec's shape, and never call any spec "golden"/"the exemplar" in a brief.
- **Failure artifacts + machine-readable results are mandatory runner config**: trace/screenshot
  retain-on-failure (local retries=0 means on-first-retry artifacts never exist for the runs that need
  diagnosing) + a json reporter (extracting failing test names from html output cost real re-runs).
  Applied to both playwright configs 2026-07-24.
- **One token-estimator home**: `@orb/kit/tokens` `estimateTokens` — server fit, previewFit, compaction
  all ride it; the client NEVER estimates (it asks the server).

## ★ ROTATION 3 — LIVE STATUS (2026-07-24, the compaction-surviving truth; supersedes scattered notes)

**Overall program: ~90% of the original 13 items once rotation 3 commits** (8 committed via rotations
1-2; #9/#10/#14 land in rotation 3; #12 audit complete with rotation 4 specced; #18 seeded).

**LANDED + VERIFIED, riding the rotation-3 commit (uncommitted tree)**:
- **#14 DONE** (verifier: argv byte-parity vs the dead shell, lift, topology invariant, single-homing;
  one env rename documented VLLM_GEN_UTIL→_MULTI/_SINGLE; known-gap: restart-to-apply live drive is
  human-supervised). **#10 DONE** (virtualizer kit + spec GREEN live 13.8s; identity locators; doctrine
  README; flake ledger settled — fuzzy-search product-fixed at source, preset-inspector cured by the
  sortable port). **Macro parity DONE** (166 pins incl. 5 owner-ratified divergences; capability map;
  gap ledger parked). **Mining campaign DONE** (42-scenario shortlist; hidden-test sweep; #21/#22
  evidence). **#12 audit COMPLETE** (17/17 ui files; credentials re-verified; rotation-4 = 18 items +
  held trio; devtools hideUntilHover grabbed immediately). **Seq-guard + exemption, rAF batching,
  scrollToAnchor fix, favicon, e2e→tests-dom, baseline regen** — all verified.
- **#9 COMPACTION — built, twice-refuted, twice-fixed, currently REOPENED (4 items, one lane)**:
  the saga: (1) verifier refuted phantom shrinkage → fixed via toShapeCanon coverage exclusion,
  re-verified CONFIRMED with DB-level proof (311→278 tokensIn); (2) the owner's hosted 90% spike found
  provider tokensIn = PER-TURN DELTA on resuming sessions (neo shipped this bug) → trigger reworked to
  fit-estimate-authoritative, re-verified; (3) side-eye's live misadventure found: GAP-1 post-success-
  only trigger = WEDGE (a failing-model chat can never compact; 41K sent to the 32K window), GAP-2
  RESUMED sessions are compaction-blind (marker truncates the SEED only; the live shrinkage proof was
  MASKED by per-send-cap session forks), P1 pct-arm didn't fire at 56.9%/0.5-threshold (hypotheses:
  arm break vs the reviewer's threshold landing on an inactive preset), P2 preset fields blank on
  first paint. THE REOPENED LANE'S PLATE: pre-turn trigger arm + session-stale-on-compaction + pct
  root-cause (chat ids in the #12-audit section receipts) + preset defaults. Commit HOLDS for it.
- **Side-eye verdict on the three new surfaces: 34/40 ship-with-fixes** — render side exemplary
  (peek focus management, honest-degrade copy 8.45:1, admin flow); all four findings fixed-in-full
  per owner: P1+preset-P2 = reopened #9 lane; deployment-facts P2 = LANDED (infra-owned facts from
  the spawn-env single-home → AdminEngineStatus gains port/storePath, no new proc, 16/16 CTs, the
  comment now true); junk presets deleted via API.

**PROMOTION PREP DONE**: the docs corpus carry is green (12 truly-missing files handled: 8 verbatim
incl. rpg 13-lite-mode + the pain-points audit now finally in git; BUILD-QUEUE bannered; UVD
annotated tsgo→ts7; main's test-baseline manifest correctly REFUSED — it would poison the monotonic
gate). KEY INSIGHT for any future promotion diff: the burn-down RELOCATED history/→proposed/ — always
normalize that axis before reading a path-diff as a loss inventory (~100 apparent losses were 12).
Commit order at close: rotation-3 (code + workboard) → docs-carry (the 11 files) → promotion ceremony
(legacy-main bookmark → main -f to this HEAD → worktree switch → push legacy + force-with-lease main,
owner-triggered).

**ROTATION 3 — CLOSED + COMMITTED (2026-07-24)**. Commits: `7ff2e410` (rotation-3 code + workboard),
`f110bcb7` (docs corpus carry), `0272c980` (live-sweep red fixes). **FULL LIVE SWEEP 24/24 GREEN** (all
3 engines up on GPU 1; repetition_penalty 1.05 session mitigation for #23), check PASS, 971 vitest +
1236 CT. The two live reds the full-engine sweep surfaced were BOTH test-calibration (not product
bugs): usedTokens is the wrong shrinkage signal (recall lands in systemTokens, swings the residual —
assert droppedCount + boundary + the canon stamp instead); disposition "cleared" at a tiny ceiling is
CORRECT (empty seed → nothing to resume; history rides the system-prompt marker; backend-agnostic).
The virtualizer raw-vs-rendered fix uncovered + fixed a sweep race and a wrong-chat-by-updatedAt race.

**NEW CHIPS from the live-sweep + sampler investigation**:
- **#23 ESCALATED + code-verified**: the agent-sdk→vLLM wire threads NO samplers (translate.ts:243 =
  maxOutputTokens only; Anthropic Messages has no penalty fields); stateless (openai-compat body.ts:
  62-68) threads them all per-request. So the sdk path CANNOT self-correct — repetition_penalty MUST
  be a vLLM launch default (Qwen3-VL ships 1.0=loops; card recommends 1.05; proven live turn_127 =
  8192-out api_error). Session mitigation live; #23 wires it into engineLaunch permanently + verifies
  preset→stateless penalty threading. HIGH — it corrupts live long-transcript/compaction specs.
- **E2E shared-DB isolation (chip)**: any spec opening listChats()[0] and asserting identity flakes
  when a foreign spec's fire-and-forget write floats another chat to top. Fix: open-by-unique-title
  (done in the virtualizer spec); a `data-chat-id` on the chat-list row makes it a one-liner (@orb/ui).
- **E2E preset-leak on kill (chip)**: a killed STABLE-leg run leaks a tiny-ceiling defaultPresetId that
  poisons live-context-cutoff; idempotent entry-cleanup (mintFreshCharacter pattern) fixes it.

**PROMOTION READY** — rotation 3 committed, full battery + full live sweep green, docs corpus carried.
Ceremony armed for the owner's go (legacy-main bookmark → main -f to HEAD → worktree switch → push
legacy + force-with-lease main). Engines on GPU 1; GPU 0 is the owner's.

**REMAINING AFTER ROTATION 3 (= rotation 4+)**: the #12-completion lane (items 1-17 at exact file
scope + held trio PD-147×8/BG×16/hint×2 + scroll-spy polish — see the #12 AUDIT RESULTS section);
**#18** CT expansion (seeded: 42 scenarios + macro-parity stock + variant-freeze pin candidate);
**#21** SSRF/credential security review (scope tripled: proxy + card-delimiter injection + privilege
precedence); **#22** execution-membership gate (both directions, triple-evidenced); **#23** gen-engine
sampling-override launch knob (the repetition-loop fix — Anthropic wire carries no penalty fields;
rides #14's engineLaunch infra). Parked-for-rebuild ledgers: FUTURE-RELEVANT items (#12 audit),
macro gap ledger, neo anti-swipe-fishing, hosted auto-compact characterization (probe 1 unsettled).

## The work list (task numbers = the session task board)

### #6 — Context-boundary stale-resurrection bug (the "cutoff line after the first message")
- **Cause (traced + pinned-in-test)**: `packages/client/src/features/chat/lib/context-boundary.ts`
  `resolveContextBoundaryMessageId` walks newest→oldest and returns the FIRST NON-NULL
  `contextBoundaryMessageId` — but the newest assistant generation stamping `null` means "everything fit
  this turn" (authoritative), not "no data". One turn that ever trimmed pins a stale divider forever; the
  unit test ("walks past trailing messages…") pins the bug as intended.
- **Ruling**: the newest ASSISTANT generation's stamp is authoritative, null included — return it, skip
  user rows, never walk past a truthful null. Fix resolver + flip the test + a regression case named for
  the symptom. Server fit layer is already honest (`history-budget.ts` returns null on no-drop).

### #7 — Context/output caps threading + previewFit (de-hardcode the vLLM window)
- **Causes**: (a) `VLLM_GEN_CONTEXT_WINDOW = 32_768` in `resolve-model-capability.ts:48` is a hand-copy
  of `vllm-engine.sh --max-model-len 32768` — in sync by discipline only; (b) preset `maxOutputTokens`
  UI field (params-panel) has no clamp against `capability.output.maxTokens.max` despite capability being
  in scope; (c) `maxContextTokens` has NO UI field at all; (d) the resolved model window/output caps are
  shown nowhere; (e) `connection.resolveChatCapability` + `chat.getShapeTrace` are server-built,
  client-unwired.
- **Ruling** (upgraded 2026-07-24, owner-driven): the vllm window's TRUTH ORDER is (1) the ENGINE's
  self-reported `max_model_len` from loopback `/v1/models` (verified live: present on both id + alias
  entries), cached via the house model-cache pattern; (2) the `VLLM_GEN_MAX_MODEL_LEN` env fallback,
  which also drives the launch flag (script `:-` fallback + a text-parity test pinning script↔env
  defaults equal); (3) the static default, loudly absence-degraded. A test pins that the engine's
  answer WINS over env when available. Params-panel: clamp maxOutputTokens, add
  maxContextTokens, render the resolved caps ("N of window used · M reserved"). Wire
  `resolveChatCapability` where the panel needs live caps. **previewFit** (owner-sanctioned, beats ST):
  a model-free chat procedure running the SAME `fitHistoryToWindow` + kit estimator against current
  history+preset+capability, returning boundary id + budget numbers; the divider consumes it (invalidated
  on message-commit + settings change) so the line tracks knob changes live. Canon stamps stay as
  per-generation provenance (fit semantics already match ST: `ceiling = min(window, maxContextTokens)`,
  output reserve subtracted, newest-back fill).

### #8 — Kill the separate draft-mode surface
- **Cause**: the new-chat DRAFT renders its own reduced options surface instead of the committed room's
  surface with unavailable options greyed out. Owner: "really truly hates" it.
- **Ruling**: one surface, disabled affordances (reason tooltips where cheap). The e2e draft-inventory
  pin (being written) is the before-anchor; side-eye verifies the result. After #6/#7.

### #9 — Managed compaction + memory marker + recall cutoff
- **Causes (scouted)**: the memory substrate is LIVE and good (post-turn digest/segment builders,
  vector recall, memory counted in systemTokens BEFORE fit so it can't be squeezed) but: (a) the
  compaction WRITE side was never wired — `chat.compactSummary` is read into assembly, nothing writes it;
  `DEFAULT_COMPACT_INSTRUCTIONS` + `MANAGED_COMPACT_DEFAULT_PCT` are stranded exports; (b)
  `FLAG[recall-livewindow-cutoff]` (`assemble-gather.ts:161`) — recall can't know the fit cutoff at
  gather time; (c) no user-visible memory marker (only the fit divider; memory visibility is a dev panel).
- **Ruling**: (A) post-turn hook (same home as digest build) refreshes compactSummary when usage ≥ the
  managed pct of the effective ceiling OR the fit dropped rows; span = above the fit boundary;
  instructions preset-overridable. Digests = retrieval tier, compactSummary = linear tier, both keyed off
  the same cutoff. (B) NO second marker: the one divider (present-tense via previewFit) carries the
  memory fact ("older messages compacted into memory" + peek affordance). (C) recall's live-window cutoff
  = the PREVIOUS turn's canon boundary stamp (stored provenance). After #7.
- **AMENDED (owner, 2026-07-24, mid-rotation-3 — overrides (A)'s source-agnostic reading)**: compaction
  GENERATION is AGENT-SDK-SOURCE-ONLY (the stateful layer; history-budget.ts's "NOT compaction — the
  graceful agent-sdk-only layer above this" is load-bearing doctrine). PLACEMENT: an existing
  compactSummary occupies the slot at the TOP of assembled history — above all retained turns — for
  EVERY source. CARRY-FORWARD: the summary is durable chat state; a mid-chat swap to a stateless source
  carries the LAST summary in the top slot (never regenerated, never dropped; its staleness relative to
  post-swap turns is accepted by design). No summary ⇒ the slot is empty. The managed knobs
  (MANAGED_COMPACT_DEFAULT_PCT / DEFAULT_COMPACT_INSTRUCTIONS) are agent-sdk-path knobs. The heart-spec:
  agent-sdk chat compacts → swap source → summary still rides the top slot (live-provable at zero spend —
  the local stack serves agent-sdk via vLLM /v1/messages).
- **RESOLVED (owner, same day) — managed means OURS, via the CHAT'S OWN MODEL**: the SDK's native
  compaction event (kind: "compaction") carries token counts but NOT the summary text (the SDK
  compacts internally, never exposing the summary) — capture-from-SDK is impossible. Managed mode:
  WE fire a QUIET NON-CANON GENERATION through the chat's resolved connection (the same model the
  user chats with — NOT the local-light summarizer rail, owner-vetoed for this) carrying the compact
  instructions over the span, and write chat.compactSummary. Agent-sdk-source-gated; SDK auto-compact
  DISABLED (disableAutoCompact) — our managed summary IS that chat's compaction layer. Mechanism
  precedent: the Principal-less quiet-op factory shape (ExtractQuiet). Free on local vLLM; a normal
  visible-cost generation on hosted (cost stays in the chat's stats, never hidden).
- **SEMANTICS SEALED (owner, same day) — FULL-RESET MARKER, chained**: compaction summarizes the
  ENTIRE in-context conversation (previous marker + all turns since) into ONE new marker — "your new
  starting point, like a new conversation; all previous messages fall out into history." NOT a
  rolling keep-recent-verbatim prefix-summary. Post-compaction prompt = system → marker → turns
  accumulated since; the marker stores its coverage point (the span stamp). Nothing deleted — canon
  + scrollback stay complete. THE BOUNDARY IS SOURCE-MODED, ONE CONCEPT ("above this line isn't in
  the prompt"): agent-sdk chat → the marker's coverage point (the stateless fit pass does not manage
  the sdk window); stateless chat → the fit boundary (carried marker above it). previewFit reflects
  the mode per source. Recall's live-window cutoff on sdk chats = the marker's coverage point.
  **AXIS PRECISION (owner)**: every compaction branch keys on the API/RUNNER axis
  (`api === "agent-sdk"` vs the stateless wires) — NEVER the source/backend axis
  (vllm/openrouter/max-pro-sub/custom). Agent-sdk runs against multiple backends; one solution for
  the axis, zero backend-name conditionals in the compaction path (the lane's report must include the
  proving grep). vLLM in probe/e2e = the free local INSTANCE of the general path, never a special case.
- **RULING (owner, 2026-07-24) — COMPACTION CANNOT BE TURNED OFF**: "erroring out is bad UI — you can
  control WHEN it compacts but not compaction itself." Existence is a SAFETY PROPERTY (no chat may
  ever error from context growth). Consequences: the mode enum is auto|managed ("off" killed; stored
  "off" lifts to managed); UNSET resolves to MANAGED (auto can't be the safe floor while its
  non-Anthropic-backend behavior is unverified); the wall gets a terminal belt — pre-turn arm at/over
  window with no usable marker ⇒ forced reseed (fit-trims) + a VISIBLE warning, degraded-and-loud
  never error-and-dead; live-context-cutoff & kin rework to the compaction-by-default reality.
  CAVEAT under verification: SDK-native compact may be Claude-API-exclusive (likely no-ops/breaks on
  the local vLLM backend) — the lane verifies empirically and documents at the disableAutoCompact
  site (plan-for-small-hardware: no silent hosted/local asymmetry). Prior art: neo-tavern
  (~/inktomi-stack/development/neo-tavern) had working compaction — lane mines it read-only
  (reference, not law).

### #10 — Test-infra kit: virtualizer + strict-mode + no-hand-rolled machinery
- **Causes**: (a) the VIRTUALIZER breaks DOM-truth tests constantly (windowed DOM ≠ full canon; the live
  parity spec had to scope to short transcripts); (b) Playwright STRICT MODE friction — multi-match
  locators forcing ad-hoc `.first()/.last()` picks that can silently assert the wrong row; (c) specs
  hand-roll machinery (the tRPC batch wire shape is hand-built in global-setup; row identity is inferred
  from order/content).
- **Ruling**: one support kit: (1) message rows gain `data-message-id` → identity-scoped locator helpers
  (`messageRow(id)`, `assistantRows()`) so `.first()/.last()` is a deliberate choice, not a strict-mode
  escape; (2) `collectVirtualRows` scroll-sweep + `assertVirtualListMatchesCanon` for full-length parity
  on any transcript size (short-transcript specs stay as the fast core); (3) the shared typed tRPC
  support client (extracted from global-setup) is the ONE way specs touch the API — no per-spec wire
  rolling; (4) CT-side equivalents; (5) a short doctrine note in tests/e2e/support (when `.first()` is
  legitimate; helpers-not-hand-rolls). Exception stays: CONTRACT tests deliberately re-spell literals
  (the test-mirror pattern) — the rule is about MACHINERY, not assertion literals.
- **Kit items minted by rotation 2 (fold into the doctrine note + helpers)**: (a) Base UI select in live
  drives = trigger-click → `expect(listbox).toBeVisible()` → `getByRole("option",{name})` (identity,
  never positional `.first()`) → listbox hidden — clicking through the open animation gives the
  "not stable→not visible" flake; (b) DOM attributes driven by a debounced autosave lag the UI action by
  debounce+save+bus-refetch — gate the DOM assertion on a SERVER-state poll (doubles as the stronger
  render-truth proof); (c) e2e tree now rides the tests-dom program (real DOM types in evaluate
  callbacks — no more DomEl bridges/casts); (d) disabled-affordance CTs assert aria-disabled + title
  (unlock condition) + activation-prevention, per the #8 idiom.

### #11 — Autosave draft/server truth inversion (the localStorage brick)
- **Cause (traced)**: `create-autosave-entity-form.tsx:117` seeds `defaults ⊕ serverValues ⊕ draft` —
  the UNVALIDATED localStorage draft outranks the server, and `lastSavedRef = seed` defines the mount as
  clean. Stale drafts display as saved, resurrect onto the server on first touch, and any non-idempotent
  save/echo/projection hop (coercions, the versioned-config lift, zod `.catch`) oscillates save→revert→
  save forever, with `mirrorDraft` re-poisoning localStorage every cycle (why only hard-clear+reload
  recovers).
- **Ruling**: drafts persist `{values, schemaVersion, baselineHash-of-server-snapshot}`; a draft survives
  mount only if zod-valid AND its baseline matches current serverValues (else discarded — the mirror is
  demoted back to crash-survival, never authority). Per-form convergence property test
  `project(echo(save(x))) === x`. Save-driver circuit breaker (N saves/M sec with no user input → error
  state). Repro tests FIRST: mismatched-draft mount fires zero saves; poisoned mount heals to server.

### #13 — Composer re-mount eats keystrokes during room settle
- **Cause (found live by the e2e lane)**: typing immediately after opening a room registers only the
  FIRST character — the composer re-mounts (losing focus + controlled value) when a background query
  settles or a bus/SSE event lands mid-type. Real users lose input on fast room entry. The shared
  `typeAndSend` retry helper works around it in tests — which CONCEALS the defect (why this task exists).
- **Ruling**: trace the remount trigger (key change on draft/room settle? boundary epoch?), fix at
  SOURCE (composer survives room-settle re-renders: stable key or value/focus preservation). The retry
  helper stays as belt but must EXPOSE whether it retried, so an anti-regression live spec can pin
  zero-retry instant typing.

### #12 — Cherry-review main's ui/shell diff (grab fixes, skip abuse)
- **Context**: main's layout worsened via CLIENT-SHELL abuse (sections 7→10: parties/databank/hubs;
  imageStudio/buddyChat modals) — all discarded by the rollback; the ui FACTORIES stayed disciplined
  (their changes are targeted fixes). The DTCG token pipeline is byte-identical both sides (the
  theme-unfucking — light-dark() intents, generated value-sets — predates the snapshot; drift test
  green). All 235 globals.css diff lines read; the skip set is exactly the six rpg §12.2 polish blocks.
- **GRAB (direct, small)**: reduced-motion `!important` hardening (globals.css ×2 blocks); scroll-fade-x
  both-edge rewrite ATOMICALLY WITH its consumer (context-tabs-panel data-fade toggles + epsilon +
  active-tab scrollIntoView fix); shell.css flex-column fix (latent VirtualList seal-throw — region
  wrapper's flex:1 inert without it); app-shell named `main` landmark (a11y).
- **GRAB (executor, test-verified)**: dialog popup `overflow-y-auto` (FormDialog taller than viewport);
  slider `FOCUS_RING` → `FOCUS_RING_HAS` (bare-slider keyboard ring, WCAG 2.4.7); textarea rows-floor
  under `field-sizing: content` (rows={3} collapses to one line); PD-147 pin-prompt stream scroll
  (message-list + pin-spacer + consumer — `streamScrollMode` is currently a LYING no-op setting in
  retro); the 9-flaky-CT root fixes where they touch live primitives; section `hint` tooltip (benign
  additive, optional).
- **VERIFY-THEN-GRAB**: BG-C/BG-V carried+video backgrounds (`useChatBackground`, video layer,
  `background-video` primitive, resolver split) — retro's SERVER already roots carried backgrounds
  (asset-refs BG-C entries live), so the client half makes a half-shipped live feature whole. Both
  halves or neither.
- **SKIP**: six rpg css blocks; dead-domain icon exports; SECTION_IDS/MODAL_SLOT_IDS growth; rpg/
  expression/party/hub stores. **DELETE here**: MenuGroup/MenuGroupLabel (both trees' liveness lenses
  agree). **Backlog note**: token-counter + plugins context tabs are keeper-domain ideas, rebuild-era
  decisions.

### #14 — De-hardcode vLLM: TS engine-launch builder + engine-facts derived + policy single-homed
- **Causes (scout-inventoried)**: the 8192 triple-hardcode (engine script embed/rerank flags +
  LOCAL_LIGHT_WINDOW + character embed-text EMBED_MAX_TOKENS); the gen 32768 script literal not reading
  its env var; concurrency dead-path defaults drifting from the settings floor (4 vs 32); bare GPU-util
  fractions + two different max_pixels; SUMMARIZER_CONTEXT_FALLBACK's coincidental 8192 collision;
  EMBED_REQUEST_TIMEOUT literal. Root disease: the engine LAUNCH SPEC lives in bash
  (vllm-engine.sh) while the supervisor + capability layers are TS reading foundation/env.
- **Ruling (owner-driven)**: move the launch spec to TS — `buildEngineArgv(engine, gpu)` in
  infra/providers/vllm/engine/, reading EFFECTIVE CONFIG (the AppSettings→layer.ts admin-override ??
  env floor ?? code default pattern — the vllmConcurrency precedent), unit-tested. Config tiers by
  apply-time: HOT policy (concurrency/batch/timeouts) = plain AppSettings, applies on next use;
  LAUNCH config (models/max-model-len/utils/max_pixels/TP) = AppSettings-layered too, applied via the
  existing admin Engines section + engine-control RESTART ("restart to apply" affordance — no new
  subsystem); DEPLOYMENT facts (ports/store paths) stay env-only, displayed not edited. The engine
  self-report seam still outranks all config for capability truth, so a misconfigured setting can
  never lie to the fit math. "Good on our machine" dies: another box tunes utils/window in the admin
  UI and restarts engines from the same UI; the supervisor spawns argv directly;
  `engines.sh` → `tsx scripts/dev/engines.ts` using the SAME builder; vllm-engine.sh dies;
  vllm-setup.sh + stack.sh stay shell. Engine-facts derive from the self-report seam (gen-window
  pattern extended to embed/rerank; embed DIM stays env-pinned as a SCHEMA fact + startup probe assert).
  Policy values (utils, max_pixels, timeouts, concurrency) single-home in env/settings.
- **INVARIANT (HMR protection — must not regress)**: in dev, engines are spawned ONLY by the standalone
  entry OUTSIDE the tsx-watch loop; the watched server only ever ADOPTS (probe-first). The pipe-watchdog
  death-coupling wraps OWNED spawns only. The old constant-engine-restart hell came from ownership
  inside the watched process — the refactor changes where flags come from, never the process topology.
  Pin with a supervisor test: a healthy port is adopted, never respawned.

### #18 addendum — launched-suite coverage mining (owner-directed, 2026-07-24)
- **Input**: two scout inventories of LAUNCHED products' e2e/smoke suites — marinara-engine
  (~/inktomi-stack/development/marinara-engine) and SillyTavern
  (~/inktomi-stack/development/neo-tavern/references/sillytavern). Launched suites encode production
  regression history ("they've launched and they might be thorough").
- **Rule**: adapt SCENARIOS (journey + the assertion that matters), never port test code — rebuilt on
  our kit (identity locators, virtualizer sweep, self-seeding mintFreshCharacter, the doctrine README).
  Skip scenarios for features orbweaver deliberately excludes (D47's out-by-design list).
- **Flow**: scout inventories → cross against the current e2e suite + feature map → transfer shortlist
  becomes #18's seed backlog alongside the CT expansion.
- **INVENTORIES LANDED (2026-07-24), the synthesis**:
  - **ST verdict**: effectively ZERO enforced UI-journey coverage (one 12-line title test; the
    7,300-line macro suite isn't in CI). Orbweaver's 21 live specs already exceed the incumbent's
    entire enforced browser coverage. Chat-flow scenarios must be ORIGINATED, not inherited.
  - **SEED BACKLOG — journeys (from marinara)**: edit-during-stream row-dedupe; historical
    peekPrompt returns THAT turn's prompt not latest; swipe-toggle flip-flop never sticks;
    group membership notices never backfill pre-start; autoscroll follows stream + settles;
    editor save-vs-refetch list flicker; error toasts assert EXACT copy + fallback names the
    replacement; deep-nested modal reachability; expanded-editor edit retention; capability-gated
    UI appears only with its dependency.
  - **SEED BACKLOG — logic (from ST)**: the card-import validator suite (V1/V2/V3 discrimination,
    dual-shape tiebreak, PER-FIELD error naming, character_book malformed shapes, V3 version RANGE,
    validator state reset); path-traversal rejection for zip/png card import; same-role merge +
    name-prefix no-double-prefix + cache-depth-skips-prefill (cross-check ours — much already
    covered by role-squash/names/breakpoint tests, close gaps only); thinking-budget tier clamps
    (when reasoning lands).
  - **TECHNIQUES adopted into the kit doctrine**: deterministic SSE fake with a typed event
    vocabulary; collectUnexpectedErrors console collector as broad smoke; REST-seed + addInitScript
    for not-under-test state; per-field validator error assertions. ANTI-patterns recorded:
    per-test viewport skips (parametrize instead); suites named e2e that CI never runs.
  - **CHIPS**: (1) SECURITY — ST's SSRF/DNS-rebinding filter is a real scar class and orbweaver DOES
    proxy user-supplied endpoints (custom-openai) + fetches remote images: route a security-executor
    review of the endpoint-proxy path (resolved-IP pinning, private-range blocking). (2) INFRA —
    "every test file is executed by SOME runner" membership check (the ST CI lesson; we check TYPE
    membership, not EXECUTION membership — a spec can fall between vitest/playwright globs silently).
  - **SHORTLIST AMENDED to 25** (hidden regression layer mined): +fallback-never-double-answers,
    +user-abort-never-triggers-fallback, +typewriter-reveal-survives-normalization,
    +revision-keyed-not-content-keyed replay gating, +import timestamp monotonicity (tie → +1ms),
    +persona free-text wrap-shape, +worldinfo key dedupe/trim, +lenient-JSON params boundary,
    +jsonish-extraction-from-prose (D48-relevant), +error-message extraction both-shapes. Style
    verdict: their pure-fn-assert vs e2e split is legitimate and orbweaver already has it (vitest
    unit layer) — ENFORCED, unlike theirs.
  - **FINAL: SHORTLIST = 42** (prompt.regression.ts mined: 96 named cases / 4,120 lines — 41% of the
    hidden layer; 17 new transferable incl. the compaction-adjacent gold fed to #9 live: marker-
    present/absent placement two-case, cadence-counts-real-user-turns, duplicate-injection guard,
    macro-resolved-before-scan ordering; per-message-SEEDED random determinism (their swipe-stable
    rolls — compare to our freeze-at-commit volatile registry model); recursion caps; ReDoS gate for
    user regex scripts; items 37/38 routed to #21 security scope). Mining verdict: marinara = strong
    source badly hidden (the hidden unit layer out-yielded the visible e2e suite 17:15 on domain-
    matched scenarios); caveat — none of it is CI-enforced, so scars prove bugs were HIT once, not
    continuously guarded.
  - **ROLL REPLAYABILITY RESOLVED (owner question, main-worktree scouted 2026-07-24)**: main's rpg
    rolls replay via BAKE-ONCE STORAGE (live CSPRNG once inside tool execution → result stamped into
    stored message text + ToolCallRecord; re-render = pure text decoration, never re-executes) — the
    SAME discipline retro's freeze-at-commit volatile registry already generalizes for
    {{roll}}/{{random}}/{{pick}}. NOTHING TO PORT. **THE ROOT INVARIANT (owner): canon bytes are
    immutable EVIDENCE — the design exists to protect the PROMPT CACHE (stored history = the stable
    prefix; per-read re-resolution would churn bytes and invalidate the provider cache every send)
    and DB PROVENANCE (the row records what the model saw, it is not a template), and to keep macros
    from firing hot on every read. Replay is the corollary, not the goal. Same invariant behind: the
    D2 unknown-span ratification, compact-summary slot-0 cache-anchor placement, and the
    shape-breakpoint abort-on-prefix-mutation rule.** Seed-based replay (marinara's per-message-seeded
    model) was explicitly REJECTED in main as a security bug (clock-seeded PRNG brute-forceable from
    log timestamps, fixed → CSPRNG) — storage beats seeding. PARKED for the rpg REBUILD: the
    anti-swipe-fishing guard (player's declared pre-roll = turn-scoped, consume-once, re-feeds the
    SAME face on swipe). Candidate #18 pin: each VARIANT freezes its volatile macros independently
    (swipe = fresh roll; swipe-back = the original's stored value).
  - **MACRO PARITY LANDED**: tests/kit/macro/{st-parity,st-rejected,dos-bounds}.test.ts — 36 parity
    pins + 16 rejection pins + DoS pins; 4 divergences owner-RATIFIED-OURS 2026-07-24 (triple-brace
    left-greedy; unknown-span byte-stability R1 wins; whitespace = multi-arg; addvar renders "") —
    pins flipped to assert ratified semantics. Capability-parity map: ST flags→automation triggers,
    $-sigils→explicit var macros, pipes→block transforms; MISSING ledger: indexed-array var reads,
    named macro args, position-seeded pick, per-render dynamic registration, alias primitive — all
    owner feature decisions, parked.
  - **HIDDEN-TEST SWEEP (owner-tipped, ast-grep structural, 2026-07-24)**: marinara hides 23 files /
    ~10k lines of hand-rolled node:assert regression scripts (scripts/regressions/ — frameworkless,
    invisible to describe/it sweeps; provider-compat + roleplay-streaming ARE the per-source coverage
    the first inventory called absent — shortlist amendment in flight) AND its server pnpm test globs
    match ZERO files (silent no-op). Neo hides tools/st-extract/test (14 vitest files, workspace-only
    invocation, no CI) — st-extract parity oracles are extraction-tooling-specific, LOW transfer for
    orbweaver. ST re-swept: clean negative, prior inventory complete. META: enforcement-vs-existence
    disease confirmed in ALL THREE launched/reference repos → #22 upgraded to check both directions
    (file-in-no-runner AND glob-matching-no-files).

### #12 AUDIT RESULTS (Opus own-eyes delta review vs main, 2026-07-24) — ledger INCOMPLETE, corrected
- **11 MISSED items** (all diff-direction-locked by direct reads). P1 data-loss/silent-failure:
  (1) image-gen fire-and-forget destroys the typed prompt on failure (use-generate-image.ts +
  composer.tsx — main: mutateAsync + clear-on-success only); (2) character-card-form-model.ts:158
  silently strips greeting `groupOnly` on any edit (server contract + serde still support it; main
  had the per-greeting "group chats only" toggle); (3) warning-notice.ts deleted → the bus onWarning
  arm is unwired, ALL capability-degrade warnings swallowed. P2: (4) autosave-status.tsx lost
  role=alert/status — save state silent to SRs; (5) composer bg-input/60 translucency regression
  (main bg-card, dated side-eye fix); (6) turn-abort-notice.ts deleted — stale-lock takeover has no
  honest toast; (7) markdown.tsx lost break-words (long token drags a horizontal scrollbar);
  (8) world-info entry reorder UI + useApplyEntryOrder dropped (server verb LIVE). P3: (9) select
  value slot min-w-0 truncate; (10) members-panel ScrollArea contentClassName; (11) sortable
  handleLabel a11y prop (grab with #8's world-info reorder — its live consumer).
- **HELD scopes CORRECTED**: PD-147 = 8 files (incl. pin-spacer.ts wholesale, use-message-items /
  use-jump-to-latest / use-chat-behavior-prefs hooks, chat-behavior-model.ts + its settings surface —
  the lying streamScrollMode knob's full seam); BG-C/BG-V = 15 files (retro HAS the still-image half:
  theme-background-layer + room-overrides-tab need diffs only; the video primitive + use-chat-background
  + background-source-field + registry-contracts background field are absent-wholesale).
- **FUTURE-RELEVANT (ledger-for-rebuild)**: world-book attach/detach-to-chat hooks (server live;
  returns with the chat context-tab seam); accept-all tag suggestions (tag.bulkAttachTag live); the
  message-tools-renderer/text-decorator/slash-command registry-seam pattern (returns with rpg).
- **OWNER RULED (2026-07-24) — both RESTORE**: (12) composer-draft-store persistence returns (keyed
  store + draft→commit migration; losing typed text on navigation is the image-gen-prompt data-loss
  family, unrelated to the reduced-modes trap); (13) ShapeTraceSummary host-only assembly-trace panel
  returns (wires the live-but-unwired chat.getShapeTrace — the observability surface for the exact
  assembly/fit/compaction machinery this program keeps debugging blind).
- **RE-VERIFICATION of the scout-swept sections (2026-07-24, tool-restricted verifier)**: settings +
  chat verdicts CONFIRMED; **credentials skip OVERTURNED** — 3 more dead-doors onto LIVE server
  capability: (14) endpoint-inspector-dialog + useInspectEndpoint deleted while the full server stack
  incl. the response-echo secret-scrub is intact (custom-byo/inspect.ts:72-75; credentials.ts:93) —
  MEDIUM, re-wire; (15) markRevokedByUser button (verb+tRPC live, credentials.ts:60) — grab;
  (16) clearRevoked button (credentials.ts:70) — grab. Plus a LOW polish note: settings scroll-spy's
  initial-compute still runs the 20-frame rAF poll anti-pattern the sibling scrollToAnchor fix
  root-caused (~line 181) — convert to observer+wall-clock when convenient.
- **(17) TanStack devtools trigger config — GRABBED IMMEDIATELY (owner-recalled, orchestrator-applied
  2026-07-24)**: main's dev-tools.tsx carried `config={{ hideUntilHover: true, position:
  "bottom-left" }}` (trigger invisible until corner-hover, docked away from the composer, position
  persisted); retro lacked it — the dev trigger camped over the UI. 4 dev-only lines, tsc-verified.
  (Neither the audit nor the re-verify named dev-tools.tsx — owner memory beat both.)
- **(18) Admin engines pane: deployment facts not rendered (side-eye P2) — OWNER-ESCALATED TO NOW,
  lane dispatched 2026-07-24** (deferral overridden: "every single one of these need fixed in full"):
  render ports/store-paths read-only in the status rows from the engineDeploymentEnv single-home,
  making engine-launch-config.tsx:6's promise true. All four side-eye findings in-flight-or-done:
  P1 pct-arm + preset-defaults P2 = the reopened #9 lane; deployment-facts P2 = this lane; P3 junk
  presets = deleted via API (verified 0 remaining).
- **ROTATION-4 LANE SPEC = items 1-16 above** (11 audit + 2 owner restorations + 3 credential
  dead-doors) **+ the held trio at corrected scope** (PD-147 ×8 files, BG-C/BG-V ×16 — the audit's 15 + the
  `./background-video` subpath export in packages/ui/package.json, without which the primitive is
  unimportable; section hint ×2) **+ the scroll-spy polish**. UI-diff universe fully closed: 17/17
  files adjudicated (audit 15 own-eyes + orchestrator 2: the export line above; icons/index.ts's 8
  removed exports = the ledger's dead-domain-icon skip, confirmed, trivially re-added per rebuild). Waits for rotation-3 commit (chat-zone overlap with #9's files).
  With this re-verification the #12 delta review is COMPLETE — every section either own-eyes
  adjudicated or independently re-verified.
- **Verified TRUE**: DTCG byte-identical; MenuGroup consumer-free both trees; globals.css skip-set
  exactly the 6 rpg blocks; all named grabs landed; #7/#11/#19/#20 retro-AHEAD confirmed.

### #16 — Settings echo-stability + render-truth (the real oscillation path)
- **Cause (owner repro, pre-revert)**: the oscillation lived in SETTINGS (background, theme) and required
  clearing localStorage AND cache to SEE saved changes — two coupled defects: (a) a save→rewrite→re-save
  loop on the server round-trip (suspect fuel: the versioned-config lift re-running on unstamped rows —
  the "always stamp USER_SETTINGS_SCHEMA_VERSION" gotcha; BG-C background materialization + theme
  .catch(null) are echo≠save BY DESIGN and must be handled as one-rewrite fixed points); (b) a
  DISPLAY-side shadow: some client-persisted layer rendered instead of server truth, so successful saves
  stayed invisible until a manual clear — the persistence-boundary law (device-local ONLY in persisted
  stores) punched through.
- **Ruling**: (1) int tests on the REAL updateUserSettingsSection path (appearance incl. materializing
  background, theme incl. stale id): fixed point in ≤1 legitimate rewrite, repeated parses byte-stable;
  verify every WRITE path stamps the schema version and a lifted row stabilizes. (2) AUDIT current
  persisted stores against server-owned state (the DEVICE_LOCAL_REGISTRY is the checklist; verify the
  gate's semantics actually catch a server-owned field, not just registry membership — probe it). (3)
  live e2e: change background + theme in the UI → visible IMMEDIATELY and after a PLAIN reload with
  storage fully intact (the no-clear-needed pin), exact user-initiated save-request count (zero
  self-triggered tail), breaker never trips. #11's breaker contains any residual loop; this kills the
  fuel and the shadow.

## In flight — INTEGRATION of the #6/#7/#11/#13 wave (2026-07-24, near-complete)

**Everything below is DONE and green unless marked PENDING.** All four lanes landed (see their sections);
integration seam-fixes applied: #11's DOM-touching tests routed (create-entity-draft-store.test.ts →
tsconfig.tests-dom.json include + tsconfig.json exclude; save-circuit-breaker.test imports its pure module
directly, NOT the DOM forms barrel); the load-bearing `?? "null"` in entity-form-base stableStringify is
eslint-suppressed-with-repro (TS lib lies: JSON.stringify(undefined)===undefined); breaker wiring uses the
client's sanctioned `performance.timeOrigin + performance.now()` clock; FABRICATION-OK marker on the
draft-store invalid-shape probe; suppressions baseline regenerated; vitest types project gained
`ignoreSourceErrors: true` (wrong-lib double-reports die; test-file errors still fail).

**CT harness seam (fixed)**: #7's `chat.previewContextFit` rides the same batch as listMessages; the CT
harness's unlisted-proc default (`data:null`) is OUT-OF-CONTRACT for it and crashed the chat surfaces.
Fix: PREVIEW_FIT_STUB folded into ROSTER_STUB in chat-room-surface.ct + message-list-surface.ct. RULE:
any new always-fired query needs a valid stub in the shared chat-surface stub bundle.

**Playwright config findings (both configs committed-pending)**: e2e = list+json reporters, trace/screenshot
retain-on-failure, actionTimeout 15s, UTC/en-US, NO video (owner ruling — pnpm record exists). CT = json
reporter, screenshot only-on-failure, UTC/en-US, but trace STAYS on-first-retry: always-on trace RECORDING
instruments network enough to flip component behavior (bisect-proven repro: message-content's external-image
CT). That CT is now route-intercepted (a real served pixel — "LOADS" finally means loads).

**Battery state**: check PASS · pnpm test PASS (6892 vitest + 1215 CT, 1 retry-passed flake:
settings-shell fuzzy-search anchor — watch item for #10) · routine e2e 12/12 · live 17/18.

**The #7 previewFit null-boundary bug — FIXED (2026-07-24)**: the merge/squash suspects were innocent
(`squashSameRole` is first-wins and preserves extras; an alternating transcript never merges). The real
defect lived in `fitHistoryToWindow` (history-budget.ts): the preview's shaped history ends on the
ID-LESS continuation nudge (preview canon ends on assistant → SHAPE appends `[Continue…]`), and with a
tiny ceiling the prompt budget goes NEGATIVE, so the old "always keep the newest ROW" irreducible rule
kept ONLY the nudge — `kept.find(messageId)` found nothing → null boundary with droppedCount 7 (probe's
usedTokens 11 ≈ the nudge's cost, confirming). Same latent bug on the ENGINE path: a group-nudge tail +
blown budget kept only the nudge and dropped the user's actual message, violating the function's own
"never silently drop the user's current turn" doc. FIX (one home): the irreducible unit is the newest
ID-BEARING turn plus everything after it (trailing synthetics — nudge, depth-0 injections — ride with
the turn they follow); no-id histories keep the old newest-row behavior. Why the parity int-test missed
it: its comment DOCUMENTED the degenerate null as intended and dodged it (odd turn count → no nudge; mid
window) — the per-spec-dodge pattern. Now pinned three ways: unit (blown budget keeps id-turn+nudge,
names boundary), int (even-count transcript + 200-window → boundary = newest row, droppedCount 5), and
live P2. Verifier CONFIRMED (both new tests proven red-on-old-code; engine normal-case unaffected; all
fitHistory callers swept). **WAVE COMMITTED `2ef07b8f`** (68 files) after the full gate: check PASS ·
pnpm test PASS (vitest + 1211 CT; 5 retry-flakes in the known parallelism class → #10's flake-hunt
list) · **full e2e 18/18 including live** — the first fully-green live suite.

**Assertion-quality audit (#17, DONE)**: 205 files / all tests read by 4 sonnet readers — ZERO sick, 2
MIXED-WEAK both fixed (character-library bulk-tag payload pin; theme-picker delete zero-call pin with
ONESHOT-OK marker). No gate needed — the house idiom (consequence testids + trpc.lastInput payload polling
+ the state-store <output> funnel) structurally prevents the disease. #18 grows coverage from healthy stock.

## Rotation 2 — CLOSED (2026-07-24, committed after this edit)

**Landed + verified (every lane got a fresh-context verifier; #8 also side-eyed live):**
- **#8 DONE**: one-surface draft redesign (wand + ⋯ menu were the two real reduced-mode violations; room
  surface/context tabs were already unified). Owner 1:1 ruling landed: NOTHING hides — Delete/Download
  render disabled on a draft; EVERY disabled affordance (menu items AND the wand/image-gen buttons)
  carries a hover reason naming the UNLOCK condition. Mechanism: Base UI disabled MenuItems are
  aria-disabled divs (title surfaces); buttons use `focusableWhenDisabled` (same effect). Copy
  single-homed in lib/injection-copy.ts. Side-eye: 33/40 Nielsen, menus called a model implementation.
- **#15 DONE**: spend/budget enforcement stripped (automation $ ceilings, whole plugin spend tier incl.
  the runExclusive serializer — verifier proved it protected ONLY the spend gate); rate caps + cost
  visibility + DoS caps kept; `budget_refused` = rate-cap terminal; D46 annotated; baseline regenerated.
- **#16 DONE**: echo-stability suite (server exonerated — fuel was #11's client seed, already fixed);
  persisted-store audit clean; gate blind spot proven; live no-clear-needed pin green ×3.
- **#12 ui tranche DONE**: dialog overflow, slider FOCUS_RING_HAS, textarea rows-floor, MenuGroup
  deleted, sortable keyboard-focus restoration (flake root-fix). PD-147 + BG-C/V + section hint HELD.
- **#19 DONE (side-eye P1)**: stuck-composer root cause = `lastEventId:"0"` seed re-replays the durable
  log from zero on subscription churn → re-replayed turnStarted re-opens the terminal turn slot. Fix =
  monotonic per-chat seq guard at the bus adapter with attach-SYNTHESIZED events (chatOpened/
  historyTruncated) exempted BY TYPE (the verifier REFUTED v1 — the guard was swallowing the sole
  reopen catch-up invalidate; the exemption CT is proven-to-bite). LRU-capped mark map.
- **#20 DONE**: rAF-batched token commits (burst of 5 deltas → ONE store commit, deterministically
  pinned; honest finding: a slow local model masks the win — tokens arrive under frame rate).
- **Infra**: e2e tree → tests-dom program (DomEl/FABRICATION casts dead); favicon (the first-load 404
  was the implicit /favicon.ico probe; no icon ever existed); draft spec now MINTS its own character
  (`mintFreshCharacter` support helper) — the rotating-sweep-failure class (seeded characters accumulate
  chats across a sweep; a character with chats resumes instead of drafting) is dead.
- **Battery at close**: check PASS · full battery PASS (1224 CT / 1 retry-flake) · **e2e 21/21 live**.
- **Lesson (artifact discipline)**: a sweep failure's retain-on-failure artifacts live in
  reports/e2e-results/ and are WIPED by the next run — read them BEFORE any re-run (one repro was lost
  to an instant re-run this rotation).

## Rotation 2 integration notes (2026-07-24)

- **DB baseline regenerated** (drizzle-kit generate --name baseline, migrations dir emptied first):
  reconciles #15's drops (plugin_budgets table + automation_budgets spend columns + narrowed CHECKs).
  Verified: schema-baseline-parity.int green (bidirectional set-equal), client.int migration-apply green,
  diff vs HEAD = exactly the intended drops. NOTE the pre-launch convention: a regenerated baseline
  AUTO-RESETS the dev db at next boot (data loss by design; boot re-seeds default characters + persona,
  e2e global-setup self-seeds — nothing breaks, but local dev chats are gone).
- **ANOMALY (unattributed, corrected)**: sometime during the rotation-2 lane window the WORKING-TREE
  0000_baseline.sql was reverted to commit `f4049019`'s pre-burn-down blob (1566 lines, buddies/sprites/
  crew tables) — git-proven byte-identical. All lanes were git-banned; cause unknown. The regen replaced
  it; backup preserved in the session scratchpad. If a working-tree file ever looks main-era again,
  hash-match it against history FIRST (git hash-object + rev-parse walk) before assuming schema drift.
- **Standing latents flagged by verifiers (no action this rotation)**: persistence-boundary gate checks
  store NAMES only, not fields (a registered store could shadow a server-owned field — field-level check
  is a real enforcement design decision); appearance.backgroundLibrary `.catch([])` drops the whole array
  on one malformed entry (entries are server-minted, latent); plugin storage.set 256-key cap has a
  documented race-tolerant TOCTOU (pre-existing, accepted by its own comment).
- **D46 ledger annotated** (spend half retired, rate half + visibility stay) — Core-Path-Registry.md.

## Rotation 3 chips (minted by lanes, pending routing)

- **macro-before-scan (pre-existing, #9-flagged)**: recall's `recent` text feed may reach the
  keyword/semantic scanner with UNRESOLVED `{{...}}` macros (marinara's `:1200` scar class). Predates
  the compaction work — audit what assemble-gather feeds recallMemory and pin resolved-before-scan.
- **auto-mode native-compact characterization (known-gap, documented at the translate site)**: auto
  turns SUCCEED on vLLM but whether SDK-native compaction actually FIRES there was not positively
  confirmed (needs compact_boundary log capture) — revisit when a longer-window probe is cheap.
- **SDK cap-interaction lesson (→ memory after verification)**: maxContextTokens env + disabled
  auto-compact = hard SDK is_error — the domain fit-cap and the SDK env-cap are DIFFERENT mechanisms,
  never force both; managed/off modes drop the context env (translate.ts, 7 tests).

## Open decisions (owner)

- Should the e2e settings seed snapshot-and-restore the user's routing instead of leaving the vllm pin?
- previewFit naming/shape (chat.previewContextFit?) — landing in #7 unless vetoed.
- `orb-readable` parchment treatment: resurrect from main's history if a live feature wants a document
  reading skin (skipped for now).
