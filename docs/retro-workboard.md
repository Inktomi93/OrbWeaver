# Retro Workboard — post-burn-down improvement program

> **Living work doc**, not law (the constitution + D-ledger stay authoritative). Written 2026-07-24 so the
> diagnoses and rulings survive context compression. Each item carries its CAUSE (traced, with file refs)
> and its RULING (owner-sanctioned fix shape). Baseline: commit `a4192372` (burn-down complete, full
> battery green: check PASS · 6859 vitest + 1209 CT · e2e 11/11) + `3469212d` (worktree-shared vLLM
> stores) + `34d1829a` (live spec CTA repoint).

## Standing rules minted this program (also in agent memory)

- **Exhaustive, not minimal**: test coverage and handling are exhaustive by owner ruling — build shared
  kits over per-spec dodges; the global quality-over-quantity test preference is overridden here.
- **No separate reduced modes**: a not-yet-ready state (draft/empty/unprovisioned) renders the ONE real
  surface with inapplicable affordances DISABLED — never a sibling reduced component.
- **Hardcoded values and per-provider specials are the enemy** — generalize; single-home every constant
  (env-own it when two homes must agree, with a parity test).
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

## Open decisions (owner)

- Should the e2e settings seed snapshot-and-restore the user's routing instead of leaving the vllm pin?
- previewFit naming/shape (chat.previewContextFit?) — landing in #7 unless vetoed.
- `orb-readable` parchment treatment: resurrect from main's history if a live feature wants a document
  reading skin (skipped for now).
