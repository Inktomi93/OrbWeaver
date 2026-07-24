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
- **Ruling**: `VLLM_GEN_MAX_MODEL_LEN` env owns the window (foundation/env default + script `:-` fallback
  + a text-parity test pinning the two defaults equal). Params-panel: clamp maxOutputTokens, add
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

## In flight

- **Live e2e suite** (executor, running): live-turn-canon-parity (ghost lifecycle + DOM↔DB order parity +
  bus-event order + engine honesty), live-routing-honesty (the spend guard), live-names,
  draft-mode-options pin (model-free), live-context-cutoff (divider == canon boundary), chat-room
  createChatViaSend kebab→CTA fix. Its findings so far: virtualization breaks full-length DOM parity
  (specs self-seed short chats); a pre-existing event-sequence race (unguaranteed request-order pin —
  fixed to order-independent); resume-or-new multi-row strictness (assert `.last()`).
- **Sequencing**: everything client/ui-touching holds until the e2e lane lands (vite HMR corrupts its
  stability measurements). Then #6 + #7 + #11 (parallel, path-disjoint) → #12 + #10 → #8 → #9.

## Open decisions (owner)

- Should the e2e settings seed snapshot-and-restore the user's routing instead of leaving the vllm pin?
- previewFit naming/shape (chat.previewContextFit?) — landing in #7 unless vetoed.
- `orb-readable` parchment treatment: resurrect from main's history if a live feature wants a document
  reading skin (skipped for now).
