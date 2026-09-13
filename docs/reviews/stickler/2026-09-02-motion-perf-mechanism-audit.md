---
kind: review
status: active
updated: 2026-09-02
---

# Motion/perf instrument mechanism audit vs Base UI animation reality + house motion law (#1065)

Lane `cb-motion-mechanism`. Investigation, not a diff review: every motion/perf instrument's SELECTOR
MECHANISM cross-checked against (a) the vendored Base UI 1.7.0 reality (docs + the package source on
this tree) and (b) the house motion law, at the evidence bar of
`tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md` (mechanism the tool uses → mechanism the
vendor/law expresses → MATCHED / BLIND / OVERCLAIMING / UNPROVEN). **Static/source/doc analysis only**
— the full battery owned the box; every UNPROVEN row names the exact live probe a follow-up lane runs
when it quiets. Memory lessons consulted by filename: `cls-recent-input-window-is-a-race`,
`buffered-layout-shift-replay`, `reduced-motion-floor-was-a-per-node-transition-tax`,
`reduced-motion-flip-pending-jolt`, `view-transition-unnamed-root-is-screenshot`,
`echarts-first-resize-swallow`, `throttle-arms-need-their-own-budgets`.

## 0. Instrument inventory (enumerated from the tree, not trusted from the brief)

Read IN FULL:

- **motion-audit tool** (17 files, 2,078 LOC): `tooling/src/motion-audit/{cli,index}.ts`,
  `contract/types.ts`, `lib/{animations,budgets,evidence,frames,verdicts}.ts`,
  `ops/{drive,matrix,matrix-contract,matrix-verdict,page-validate,parse,report,run,trace}.ts`.
- **In-page collectors** (`packages/client/src/lib/`): `motion-stats.ts` (the ONE LoAF observer + CLS
  three-way split + shift ring), `motion-flaggers.ts` (`[anim]`/`[css]`/`[drop]`/`[space]` push pack),
  `motion-animation-record.ts` (animations() census + Base UI lifecycle binder),
  `motion-animation-state.ts` (`[drop]` lifetime accounting + `Element.animate` boundary),
  `select-entrance-evidence.ts` (#374 sealed-Select seam), `long-task-tracer.ts`
  (`[frame]`/`[reflow]`/`[input]`), `view-transition.ts` (the VT wrapper).
- **Walker grid rules**: `tooling/src/ui-audit/ops/walker/census-grid.ts` +
  `tooling/src/ui-audit/lib/checks-grid.ts` (off-grid-text / promoted-layer-offset /
  off-grid-transform).
- **Gates**: `tooling/src/verify/gates/rest-transform-grid.ts`,
  `tooling/src/verify/gates/motion-token-purity.ts`.
- **Budget suites (#1040)**: `tests/tooling/motion-audit/cli.int.test.ts`,
  `tests/tooling/_load-budget.ts`; `tests/tooling/_shared/appearance.int.test.ts` (header + timeout
  region).
- **Oracles**: `docs/vendor/base-ui/handbook/animation.md` (full),
  `docs/architecture/core/motion-and-animation-guide.md` (full), all 37
  `docs/vendor/base-ui/components/*.md` swept for the animation vocabulary (§3 table), and the VENDOR
  SOURCE at `node_modules/.pnpm/@base-ui+react@1.7.0_*/node_modules/@base-ui/react/`:
  `internals/useAnimationsFinished.mjs` (full), `drawer/viewport/DrawerViewport.mjs` (the
  swipe/release/dismiss regions), `drawer/popup/DrawerPopup.mjs` (state-attr + swipeStrength regions),
  `select/trigger/SelectTrigger.mjs` (aria-controls), `internals/useAnchorPositioning.mjs`
  (floatingStyles region), `@floating-ui/react-dom` 2.1.9 `floating-ui.react-dom.mjs`
  (`roundByDPR` region). Issues read: #990, #991, #1040, #982 (+ comments), #1065.

Regions NOT read (declared per the evidence bar): `motion-dead-class-flagger.ts` (the `[css]` channel
— dead-CSS detection, not a motion mechanism; its shared throttle constant was read via
`motion-flaggers.ts`), the CJS halves of the vendor package, `DrawerViewport.mjs` outside lines
~80–460 and ~550–740, the toast swipe source (same `useSwipeDismiss` family as drawer, not
independently verified), `tests/tooling/motion-audit/{index,ops/*}.test.ts` bodies,
`_shared/{appearance-matrix,variant-matrix,browser-environment}.ts` internals (consumed shapes only),
and the full bodies of the 37 component pages (vocabulary swept by count; drawer/select claims are
backed by SOURCE, not the pages).

## 1. Findings (ranked by consequence)

### F1 — P2 · OVERCLAIMING (lying-instrument class): the `[anim]` flagger convicts guide-RATIFIED motion, with no allowance twin of motion-audit's sanctioned-height policy

- **Instrument mechanism**: `packages/client/src/lib/motion-flaggers.ts:196-232`
  (`flagDirtyAnimationsOn`) — ANY animated property outside `COMPOSITOR_SAFE_PROPS`
  (transform/opacity/filter/translate/scale/rotate) raises
  `[anim] … (guide §3.7) · OVER BUDGET`, with exactly ONE carve-out: paint-only colour on an
  interactive state (#456).
- **Ratified behavior it convicts**:
  1. **Tabs indicator glide** — guide §4.2 item 2 ("BUILT") glides the indicator on Base UI's
     `--active-tab-left/width` runtime vars; the shipped skin is
     `absolute … left-(--active-tab-left) … w-(--active-tab-width) … transition-all`
     (`packages/ui/src/primitives/tabs/variants.ts:34-37`). A tab switch therefore launches
     CSSTransitions on **`left` and `width`** — layout properties, not colour, not height — and the
     first switch per surface prints `[anim] animating non-compositor left/width … OVER BUDGET`.
  2. **Accordion/Collapsible height lifecycle** — guide §4.2 item 3 ("BUILT") + §3.7's own text
     ("Base UI ships `--accordion-panel-height` … so you can transition `height` … scope it to
     occasional expand/collapse"): `h-(--collapsible-panel-height) … transition-all …
     data-starting-style:h-0` (`packages/ui/src/primitives/accordion/variants.ts:17`,
     `collapsible/variants.ts:17`). Every first open per surface prints
     `[anim] animating non-compositor height … OVER BUDGET`.
- **Why this is a defect and not strictness**: motion-audit's animation census carries the
  owner-accepted Base UI height allowance (`tooling/src/motion-audit/lib/animations.ts:8,29-46` —
  lifecycle-bound `["height"]` leaves the budget), minted with #953. The console half of the SAME
  vocabulary never received the twin, so the two instruments disagree about ratified behavior — the
  flagger accuses what the audit sanctions. This is precisely the class the §3.7 amendment history
  records for `hover:bg-accent` ("a live instrument accusing ratified behaviour",
  `docs/history/reviews/side-eye/2026-08-22-rail-home.md` P3-2), and the owner's fix-lying-tools rule
  prices it P2 regardless of surface priority. The tabs `left/width` case is worse than height: NO
  existing allowance vocabulary (colour or height) can express it, so the fork is "amend the
  law/allowance to name the indicator glide" vs "migrate the indicator to a
  transform/translate/width-via-scale glide" — an owner/design call, not a local patch.
- **Refutation attempted**: checked whether a CT pins the current behavior as deliberate —
  `tests/client/lib/motion-flaggers.ct.tsx` pins only the generic non-compositor red (a `width`
  hover, line 272) and the colour carve-out (line 295); no pin claims height/indicator convictions
  as wanted. Dedupe (`motion-flaggers.ts:116-134`) limits it to once per surface+property per
  checkpoint — still a standing false accusation in every side-eye console triage.

### F2 — P2 · BLIND: motion-audit's dirty-animation budget samples once at window END and cannot see the app's whole 130–360ms duration band; the `[anim]` ring that closes the gap is never read

- **Instrument mechanism**: `tooling/src/motion-audit/ops/trace.ts:43-57` — the measured window is
  `settle(page, opts.windowMs)` (default 2,500ms, `ops/parse.ts` `DEFAULT_WINDOW_MS`), then
  `readAnimations(page)` — a single `document.getAnimations()` sample
  (`motion-animation-record.ts` `activeAnimations`).
- **Law/vendor reality**: every house band is 130/220/360ms (guide §2), and Base UI open/close rides
  CSS transitions in the same band. A dirty transition launched by the measured click is finished
  ~2 seconds before the sample (CPU throttling drops frames; it does not stretch wall-clock
  animation durations). So the cli-header budget arm "any active animation with
  `compositorClean:false`" is in practice a continuous-loop detector; the entire `sanctionedLibrary`
  machinery in `lib/animations.ts` judges a population that, for a click at window start, cannot
  contain the transitions it exists to sanction.
- **The family already documents the class**: `motion-flaggers.ts` header — "`__orb.animations()`
  samples `document.getAnimations()` and therefore cannot see a 130ms transition that already
  finished — which is exactly the duration band this app animates in … Catching it at
  `animationstart`/`transitionstart` is the only reliable read." The `[anim]` ring is exposed as
  `__orb.flags()`, checkpoint-scoped and reset by the same `resetEvidence` motion-audit already
  calls (`packages/client/src/lib/agent-bridge.ts:63-66,143`), i.e. after the reach reset the ring
  holds exactly the measured window's raises — and motion-audit never reads it.
- **Absence receipts** (two methods + positive control): literal `grep 'flags()'` over `tooling/src`
  → 0 hits; positive control `grep 'motion()'` in `tooling/src/motion-audit/ops/drive.ts` → 1 hit
  (the bridge reads are evaluate STRINGS, so the textual method decides); structural corroboration
  `ast-grep -p '$X.flags()' -l ts tooling/src` → scannedFileCount=738, 0 matches.
- **The other polarity**: a SHORT `--window` catches ratified motion mid-flight instead — including
  the UA's own View Transition group animations, which animate width/height **by spec design** and
  would read as budgeted-dirty "application css-animation". The arm's verdict is currently a
  function of when the sample lands, not of what animated.
- **Fix shape**: consume `__orb.flags()` (tag `anim`, `overBudget`) for the measured window as the
  dirty-animation input, applying the same (F1-repaired) sanctioning policy; keep the end-of-window
  sample for continuous loops.

### F3 — P2 · BLIND: the interaction-cell CLS budget structurally excludes the input-adjacent storm the collector was explicitly rebuilt to expose

- **Instrument mechanism**: `packages/client/src/lib/motion-stats.ts:242-252` — only
  `!hadRecentInput` shifts accumulate into `cls`; the tool budget gates on `nonVirtualizedCls`
  derived from `cls` (`tooling/src/motion-audit/lib/verdicts.ts` `clsTotals`/`clsOverBudget`). The
  measured click is a REAL CDP dispatch (`page.mouse.click`, `ops/trace.ts:37-44`) → trusted input →
  **every shift within 500ms of it is excluded** from the only CLS number the tool prints or gates.
- **The collector's own paid receipt** (`motion-stats.ts:26-35`): the docked LIST panel toggle moved
  `.shell-main` 272px across 7 entries — 0.207 of instability, every entry `hadRecentInput:true`,
  `cls` read 0.0177, and "**`pnpm motion-audit` passed its CLS budget while the shell was visibly
  thrashing**." The fix at the collector was the two-totals split (`observedCls`, plus the attributed
  `shifts` ring) — and the tool side never consumed it: `observedCls`/`shifts` are absent from the
  tooling `MotionSnapshot` contract (`tooling/src/motion-audit/contract/types.ts:70-87`), absent from
  the report and machine line (`ops/report.ts`), and `grep observedCls tooling/src/motion-audit` → 0
  (the only tooling hit repo-wide is the unrelated `ct-poll-schedule-and-paint` gate).
- **What survives**: the default 4× throttle pushes SOME settle waves past the 500ms cliff (the
  `cls-recent-input-window-is-a-race` 0.30837 lesson), so the budget sees the throttled tail; the
  sub-500ms storm and the margin-to-the-cliff stay invisible and unreported. Entry cells are
  unaffected (no trusted input; the dev-bridge nav does not set `hadRecentInput` — `agentNavigation`
  only mutes the console accusation, `motion-stats.ts:255-262`).
- **Fix shape**: carry `observedCls` (and per-wave `shifts` timing — already present in the receipt
  JSON via validator passthrough, see F4) into the contract, the report line, and the machine pairs;
  decide with the owner whether interaction cells budget on an observed-derived number or merely
  report the margin per wave.

### F4 — P3 · boundary defect + UNPROVEN attribution (directly informs #982): the reach/measure boundary is a fixed 500ms sleep the tool's own default 4× throttle outruns

- **Instrument mechanism**: `tooling/src/motion-audit/ops/drive.ts:80` — `settle(page,
  REACH_SETTLE_MS)` (= 500ms, `lib/budgets.ts:7`) per reach action, then `resetEvidence`; the
  throttle (default ON, 4×) is applied before navigation (`ops/run.ts` `applyCpuThrottle`), and
  `settle` is a bare `waitForTimeout` (`tooling/src/_shared/browser.ts:35-38`) — there is no
  idle/settled barrier between reach and the measured window.
- **Consequence**: under 4× a reached surface still settling >500ms after nav leaks its late waves
  INTO the measured window, attributed to the audited surface. This is the
  `throttle-arms-need-their-own-budgets` class (an arm that keeps un-throttled ceilings under its own
  declared throttle): #836's fix gave snap throttle-scaled drive budgets; motion-audit's reach settle
  never got the same treatment.
- **What this means for #982's 0.183331 entry-cell CLS (436px, Config `<section>` + descendants)**:
  the measurement is honest about WHAT moved but cannot, by mechanism, distinguish "Config's own
  post-arrival instability" from "navigation tail that outlived a fixed 500ms settle under 4×". The
  receipt artifact CAN adjudicate this without new code: `ops/page-validate.ts` `motionSnapshot`
  returns the validated record itself (extra fields pass through), so
  `reports/motion-audit/<slug>-matrix.json` `cells[].data.motion.shifts[]` carries each wave's
  `startTime` and sources.
- **Named probe (post-battery, merged post-train SHA)**: (1) read the existing receipt's `shifts[]`
  startTimes relative to window start — waves clustered in the first ~1s ⇒ boundary leak, spread ⇒
  real Config instability; (2) re-run the cell `--no-throttle` and diff; (3) if still ambiguous, the
  buffered layout-shift replay (`buffered-layout-shift-replay`) on the same route names movers per
  wave with rects. Fix shape if the leak is real: scale `REACH_SETTLE_MS`/`MOUNT_SETTLE_MS` by the
  declared throttle rate (merge-by-max, the #836 pattern), or add a shift-quiescence barrier before
  the reset.

### F5 — P3 · UNPROVEN (false-red risk): the Select-allowance script-attribution veto likely classifies vite dep CHUNKS as "unrelated"

- **Instrument mechanism**: `tooling/src/motion-audit/lib/verdicts.ts:44-66` — "related" iff the
  LoAF script pathname contains `@base-ui`/`@floating-ui` or matches the react regex; otherwise
  `/node_modules/` (among others) ⇒ "unrelated" ⇒ the veto (`hasUnrelatedScriptAttribution`)
  withholds the 140ms first-open allowance AND makes the frame count in `budgetedStyleLayout`
  (`verdicts.ts:130-141`).
- **Environment reality**: in dev, third-party deps are vite-prebundled under
  `/node_modules/.vite/deps/`; entrypoints keep their names (`@base-ui_react_select.js` contains
  `@base-ui` → related) but SHARED modules land in `chunk-<hash>.js` — which contains neither
  `@base-ui` nor the react path and so classifies "unrelated", even when it is exactly the
  library positioning work #374 calibrated the allowance for. Direction: stricter (a genuine
  first-open REDs), not lenient.
- **Probe**: cold Select open on the live stack; dump the confirmation LoAF's `scripts[].sourceURL`
  (`__orb.motion().loafs`); any `chunk-*.js` present with the veto firing ⇒ teach
  `scriptAttribution` the `.vite/deps/chunk-` shape (with a planted control in both directions per
  the lying-tool pin contract).

### F6 — P2 · #1040's premise CONFIRMED on today's tree: the live-drive budget arms are still raw under load; the load-honesty machinery exists and is not wired to them

- `tests/tooling/motion-audit/cli.int.test.ts` — the clean twin still gates the raw 5%
  dropped-frames budget over a real headless drive (`FRAME_WINDOW_MS=1000`, `--no-throttle`; ~60
  frames, so ≥4 stray drops red it — the file's own comment prices ONE stray drop at 5.56% on an
  18-frame window). No withhold arm, no load-aware precondition: the file imports nothing from
  `tests/tooling/_load-budget.ts` (its consumers today: `gate-conformance.int`,
  `_shared/entrypoint.int`, `ast/cli.int`, `check-gates.int`, `verify/ops/conformance.int`,
  `load-budget.int`). `tests/tooling/_shared/appearance.int.test.ts` carries a FIXED
  `RUN_TIMEOUT_MS = 60_000` (line 22) — widened from the 5s the issue cites, still not load-scaled.
- **Mechanism note for the fix row**: #1040's option (b) "budget scaled by loadavg like
  `_load-budget.ts`" transfers to TIMEOUTS but not to a measured dropped-frame PERCENTAGE — load does
  not scale a % linearly (the A/B in the issue: 47.54% → 10% → clean on identical code). Option (a)
  — a quiesced `live-drive` slot + a load-aware WITHHOLD (exit-2 class, planted forced-load control)
  — is the arm that matches the house instrument-honesty law (`_load-budget.ts` header, owner
  2026-08-22).

### F7 — #991's wedge hypothesis REFUTED statically; the live probe reduces to visual continuity

- **Vendor completion mechanism** (`@base-ui/react/internals/useAnimationsFinished.mjs`, read in
  full): `Promise.all(element.getAnimations().map(a => a.finished))`, with an explicit empty-
  population fast path — **zero animations resolves immediately** and `flushSync`-unmounts. A wedge
  ("nothing to await, so unmount never fires") is not constructible in 1.7.0: under
  `transition-property: none !important` (the reduced-motion floor) or any transition-none arm the
  worst case is a hard-cut exit, which §3.9 (REMOVE, not shorten) makes the CORRECT reduced-motion
  outcome. (Corroborates memory `reduced-motion-floor-was-a-per-node-transition-tax`: "Base UI is
  safe by construction … zero animations resolves immediately".)
- **The swipe-dismiss path specifically** (`drawer/viewport/DrawerViewport.mjs:288-313,414-426`):
  `onRelease` → `startSwipeRelease` runs BEFORE the close — `setSwipeDismissed(true)`
  (`data-swipe-dismiss`), **`style.removeProperty('transition')`** (drops the inline suspension the
  drag applied), sets `data-ending-style` synchronously; `swiping` flips false
  (`onSwipingChange`, `:236-239`) and `DrawerPopup` renders `data-swiping` from that state
  (`DrawerPopup.mjs:103-105,160`) — so by exit time the house skin's
  `transition-transform duration-(--motion-layout) … data-swiping:transition-none`
  (`packages/ui/src/primitives/drawer/variants.ts:12`) re-arms and a real `CSSTransition` on
  `transform` exists for `getAnimations()`. The handbook's `opacity: 0.9999` advice is scoped to JS
  animation libraries (Motion), not CSS transitions — no cargo cult needed, matching #991's own
  constraint.
- **What stays live-only** (keep the probe, drop the wedge framing): visual exit continuity (resume
  from the dragged offset without a jump — the vendor's release-velocity scalar rides
  `--drawer-swipe-strength`, `DrawerPopup.mjs:334-337`, which the house skin deliberately does not
  consume; guide §1.1 already marks it unverified), plus focus restoration and scrim lifetime — the
  VNC/real-pointer probe #991 prescribes.

### F8 — P3 · BLIND (fleet-level): gesture-driven motion has no instrument coverage at all

- Guide §3.6 names the gesture class (drawer swipe, drag-reorder) as first-order motion; the
  instrument fleet cannot observe it: motion-audit's action vocabulary is click + nav only
  (`contract/types.ts` `ReachAction`; the measured interaction is a single prepared click,
  `ops/drive.ts` `prepareMeasuredClick`) — no swipe/drag can be driven; during a drag the transition
  is suspended (vendor inline + `data-swiping:transition-none`), so no Animation objects exist and
  both `[anim]` and `[drop]`'s animation-lifetime windows see nothing (dnd-kit's drop settle IS
  covered via the `Element.animate` boundary, `motion-animation-state.ts:151-183`; the drag itself is
  not). Only the `[frame]`/`[input]` console channels would incidentally catch a pathological drag.
  A janky swipe therefore scores clean everywhere. Named probe: the #991 VNC real-pointer drive with
  the CDP trace running (motion-audit's `PipelineReporter` pipeline would see dropped frames if a
  gesture reach action existed — a candidate future `--swipe` arm).

### Low / latent

- **L1** — `motion-animation-record.ts:141-152`: the lifecycle binder deletes the pending Base UI
  state after the FIRST `transitionrun` on the element, by design ("the observation belongs to this
  exact property launch"). The panels are `transition-all`, so a lifecycle launch that ever changes a
  SECOND property across the `data-starting-style` boundary would strand that sibling transition as
  `owner=application` (unsanctionable). Latent today — only `height` differs across `h-0` — worth a
  comment/pin when the sanctioning policy is next touched.
- **L2** — matrix "entry" cells run the reach queue then reset, so they measure ARRIVAL RESIDUE at
  the target surface, not app entry (a bare `motion-audit /` is the true entry arm —
  `ops/drive.ts:82-85` clears only when a reach ran). Correct behavior; the receipt vocabulary
  ("scenario=entry") invites misreading — one help-text line would prevent it.
- **L3** — UA View Transition pseudo-animations animate width/height/transform by spec design; they
  escape `[anim]` (an `animationstart` for a pseudo lands on the originating element, and
  `el.getAnimations()` without `subtree:true` excludes pseudo targets) and generally the sampler
  (~360ms, gone by window end). Correct POLARITY for the ratified VT crossfade — but accidental: a
  custom-named VT region carrying a hand-authored dirty animation escapes identically.

## 2. Mechanism-match table (instrument × behavior)

| # | Instrument · behavior | Tool mechanism (receipt) | Vendor/law mechanism (receipt) | Verdict |
| - | - | - | - | - |
| 1 | Base UI enter/exit lifecycle detection | `data-starting-style` REMOVAL (`oldValue!==null` ∧ now absent) / `data-ending-style` ADDITION (`oldValue===null` ∧ now present), bound at `transitionrun` — `motion-animation-record.ts:118-152` | handbook/animation.md: transitions run FROM the starting-style snapshot when the attr is removed; ending-style present during exit; guide §1.1 | **MATCHED** |
| 2 | Base UI unmount/completion semantics | not modeled (correctly — tooling revalidates lifecycle claims only) | `useAnimationsFinished.mjs`: `getAnimations()`+`finished`, empty ⇒ immediate | **MATCHED** (F7) |
| 3 | Dirty-animation budget vs the 130–360ms band | one `getAnimations()` sample at window end — `ops/trace.ts:43-57` | guide §2: all house motion is 130/220/360ms transitions | **BLIND** (F2) |
| 4 | `[anim]` at transition/animation start | property-set + live `:hover…` matches + colour carve-out — `motion-flaggers.ts:196-282` | guide §3.7 as amended + §4.2 items 2/3 ratifying height + indicator glide | **OVERCLAIMING** on ratified motion (F1); carve-out + documented blind spots otherwise MATCHED |
| 5 | CLS budget, entry cells | spec `cls` (no trusted input ⇒ nothing excluded); dev-bridge nav sets only the console-mute flag — `motion-stats.ts:242-262` | Layout Instability spec; house #109 split | **MATCHED** |
| 6 | CLS budget, interaction cells | budget on `nonVirtualizedCls` ⇐ spec `cls`; real CDP click ⇒ 500ms exclusion; `observedCls` unread | the collector's own header: the exclusion "HIDES the most expensive layout defect this shell has had" | **BLIND** (F3) |
| 7 | Virtualized-CLS classification | `sources.every(closest('[data-slot=message-list-viewport],[data-slot=virtual-list-viewport]'))` — `motion-stats.ts:85,236-240` | both slots exist (`packages/ui/src/primitives/{message-list,virtual-list}/*.tsx`) | **MATCHED** |
| 8 | Dropped-frames ground truth | `PipelineReporter` begins with nested `args.frame_reporter`; `ph:"e"` empty-args excluded; pairing by `pid:tid:id2.local` — `lib/frames.ts` | #389's measured Chrome payload shape; headless % labeled ADVISORY in report | **MATCHED** |
| 9 | Select-entrance trace pairing | `blink.user_timing` instant marks `orb:select-entrance:<id>:start/confirmed/end`, backdated via `performance.mark({startTime})` — `frames.ts:36-79`, `select-entrance-evidence.ts:41-44` | guide §4.1.1 sealed ruling; User Timing marks ride the trace | **MATCHED** (mark-backdating in-trace assumed; would surface as empty `classified` totals, which the report prints) |
| 10 | Select-entrance confirm seam | trusted intent → ARIA-related Positioner (`aria-controls`/`aria-describedby` vs `[id]` descendants), 3 confirm paths (childList, `aria-expanded` attr, quick-reopen microtask) | `SelectTrigger.mjs:126`: `aria-controls` present exactly while open — all three paths run at/after open | **MATCHED** (Select-only scope is RULED, guide §4.1.1 — #990's widening question is an owner call, not an instrument defect) |
| 11 | First-open allowance veto | script pathname classifier — `verdicts.ts:44-66` | vite dev serves shared prebundle chunks as `chunk-<hash>.js` | **UNPROVEN** false-red risk (F5) |
| 12 | LoAF style/layout arm vs ratified height lifecycle | unconditional `styleAndLayoutStart>0` red outside confirmed Select entrances — `verdicts.ts:130-141` | guide §4.1.1 verbatim: "the 50ms blocking ceiling and unconditional style/layout rule still govern ordinary LoAFs"; #824 owns the accepted height-family reds | **MATCHED by ruling** (deliberate strictness; noise routed to #824's acceptance) |
| 13 | Reduced-motion arms | OS media query + independent app-carrier shim; STATIC-EXPECTED needs exact requested/applied/runtime identity on BOTH + a nonzero full-motion control — `matrix-verdict.ts` | §3.9 REMOVE-not-shorten; the floor kills transitions so zero frames is the CORRECT product behavior | **MATCHED** |
| 14 | Zero/absence hygiene | #409 gaps outrank budgets; empty population ⇒ exit 2; readiness vs bridge distinguished (#515) — `lib/evidence.ts`, pinned in `cli.int.test.ts` | house instrument-honesty law | **MATCHED** |
| 15 | Grid Law 2 resolved arm vs Base UI positioners | rest transform judged by device-frac; animating withheld (#987) — `census-grid.ts` | floating-ui rounds x/y by DPR (`floating-ui.react-dom.mjs:70-73,213-218`) ⇒ positioner transforms land grid-clean; `willChange:transform` at DPR≥1.5 makes positioners Law-3 subjects with frac≈0 | **MATCHED** |
| 16 | Grid Laws 3/4 + reading-surface exemption | promotion shapes (backdrop-filter/will-change/3d), ONE typed mirror of the gate's ARM C row — `checks-grid.ts` | integer-line-boxes doctrine; accounting printed per run | **MATCHED** |
| 17 | `rest-transform-grid` gate vs drawer/toast swipe vars | `var()`/`calc()` indirection = declared skip with the LITERAL drawer-var mustPass row (`rest-transform-grid.ts:478-481`); state-keyed rules and `@starting-style` classified MOTION | the swipe transform is a runtime var — resolved landing owned by ui-audit's `off-grid-transform` | **MATCHED** |
| 18 | `motion-token-purity` | raw duration/easing in CSS, comment-blanked, two-directional allowlist ratchet | guide §2 token map; the reduced-motion floor's raw `0.01ms` correctly allowlisted | **MATCHED** |
| 19 | Gesture-driven motion (swipe/drag) | no drivable action; no animation lifetime during drag | guide §3.6 names the class as first-order | **BLIND** (F8) |
| 20 | `[drop]`/CDP double-count coordination | in-page `[drop]` paused for exactly the CDP window, released in `finally` — `ops/trace.ts:24-53`, `motion-animation-state.ts:60-70` | guide §4.1.1's pause clause | **MATCHED** |

## 3. The vendored Base UI animating-component population (the #990 derivable list)

`data-starting-style` mentions per `docs/vendor/base-ui/components/*.md` (grep -c; 0-count pages
omitted: button, checkbox-group, fieldset, form, input, meter, number-field, otp-field, progress,
scroll-area, separator, slider, switch, toggle, toggle-group):

accordion 9 · alert-dialog 20 · autocomplete 9 · avatar 1 · checkbox 1 · collapsible 4 · combobox 22
· context-menu 10 · dialog 43 · drawer 49 · field 1 · menubar 6 · menu 31 · navigation-menu 31 ·
popover 19 · preview-card 13 · radio 1 · select 13 · tabs 7 · toast 16 · toolbar 2 · tooltip 15

`onOpenChangeComplete` (the popup-lifecycle tell): alert-dialog, autocomplete(3), combobox(5),
context-menu(2), dialog, drawer, menu(2), navigation-menu, popover, preview-card, select, tooltip —
twelve popup-family members beside Select, matching #990's thirteen-sibling claim (toolbar/menubar
host popups via menu). The 1-count pages (avatar/checkbox/field/radio) are attribute-reference rows,
not popup lifecycles.

## 4. Verified clean (what my silence covers)

- **All of §2's MATCHED rows**, each re-derived from source this session, including: the LoAF
  single-observer/multi-subscriber shape (one `long-animation-frame` observer in `motion-stats.ts`,
  `[drop]`/`[frame]`/`[reflow]` subscribe — no duplicate observers), checkpoint floors moving
  together through `resetEvidence`, the `[reflow]` per-script `forcedStyleAndLayoutDuration` gate
  (#432 polarity), the `[input]` interaction-family dedupe, the `Element.animate` boundary for
  eventless WAAPI, the strict-CLI misuse posture (typo ⇒ exit 3 before a browser boots), the matrix
  axis/twin planning (pairwise receipt printed, `uncoveredPairs` surfaced), the barrier discipline in
  `ops/run.ts` (every pre-measurement failure ⇒ terminal exit-2, never a fabricated verdict), and
  page-validate's shape-settling at the PAGE→NODE seam (#1004).
- **The reduced-motion contract end-to-end**: floor = `transition-property: none` +
  `animation-duration: 0.01ms` (both arms, unlayered); `hasVisibleDuration`'s 1ms ceiling means
  collapsed animations don't pollute `[drop]` lifetimes; `transitionend`-never-fires consumers were
  swept in #257; the matrix's STATIC-EXPECTED is the only zero-frame exemption and demands a
  nonzero-control proof.
- **`git log` cross-check**: none of the instrument files audited changed after #953/#1004 in a way
  that invalidates the receipts above (all reads from today's tree at `wt/agent-ab56ccc6040480c63`,
  base = local main `adc537db9`).

## 5. Unconfirmed suspicions (low priority — NOT findings)

- The progress indicator's `transition-all` (guide's fourth surviving site) presumably animates a
  layout property on VALUE changes (not user-triggered) — same \[anim] exposure as F1 if a value ever
  changes while visible; not verified which property actually transitions.
- `performance.mark({ startTime })` backdating landing at the backdated ts in the CDP trace was
  assumed, not proven (table row 9's declared assumption).
- Whether any real first-open Select LoAF on the live stack currently attributes to a
  `chunk-*.js` (F5) — that IS the probe, listed under F5.

## 6. Proposed fix rows (for the orchestrator; lying-instrument rule prices F1 at P2)

1. **F1** — \[anim] allowance twin: either amend the law/allowance to name the ratified height +
   indicator-glide lifecycles (lifecycle-gated, mirroring `lib/animations.ts`) or migrate the tabs
   indicator to a transform-based glide; owner fork, CT pins both directions.
2. **F2** — motion-audit consumes `__orb.flags()` (anim channel) for the measured window; keep the
   end-sample for loops; pins: a planted 200ms dirty transition at click time must RED, the ratified
   height lifecycle must NOT.
3. **F3** — surface `observedCls` + per-wave margins in contract/report/machine line; owner decides
   the interaction-cell budget number.
4. **F4** — throttle-scaled reach/mount settles (merge-by-max, #836 pattern) or a shift-quiescence
   barrier; then re-attribute #982's 0.183331 from the existing receipt's `shifts[]` before any
   Config-side fix.
5. **F5** — probe, then teach `scriptAttribution` the `.vite/deps/chunk-` shape with two-direction
   planted controls.
6. **F6** — #1040 option (a): quiesced `live-drive` slot + load-aware WITHHOLD for the measured-%
   arms; wire `_load-budget.ts` into `motion-audit/cli.int` and `_shared/appearance.int`.
7. **F7/F8** — re-scope #991 to visual continuity (wedge refuted with receipts above); consider a
   gesture reach action as the only path to instrumenting §3.6 motion.

## Issue summary (paste for #1065)

Mechanism audit of the motion/perf instrument fleet vs Base UI 1.7.0 (docs + vendored source) and the
house motion law is complete — static/source only per the battery constraint; report at
`docs/reviews/stickler/2026-09-02-motion-perf-mechanism-audit.md` (lane cb-motion-mechanism, branch
`wt/agent-ab56ccc6040480c63`). 8 findings, severity ceiling P2 (three P2s, all lying-instrument
class): **F1** `[anim]` convicts guide-ratified motion (tabs indicator `left/width` glide §4.2-2,
accordion/collapsible height §4.2-3) — the #953 sanctioned-height allowance exists only on the
motion-audit side, the console flagger never got the twin, and no vocabulary can express the
indicator glide at all (owner fork: amend allowance vs transform-based glide); **F2** motion-audit's
dirty-animation budget samples `getAnimations()` once at window END — structurally blind to the
app's whole 130–360ms band; `__orb.flags()` exists, is checkpoint-scoped, and is read nowhere in
tooling (0 hits, positive control + ast-grep 738-file corroboration); **F3** interaction-cell CLS
budget excludes everything within 500ms of the measured CDP click and `observedCls` was never
consumed by the tool — the exact false-PASS the motion-stats header documents as already paid.
Also: **F6** #1040's premise confirmed unfixed (raw 5% dropped-frames arm, no withhold; NB a
loadavg-scaled % budget is mechanically wrong — the withhold arm fits the house law); **F4** the
reach/measure boundary is a fixed 500ms sleep the tool's own 4× throttle outruns, so #982's
0.183331 entry CLS is honest-but-unattributable — the existing matrix receipt's `shifts[]`
(validator passthrough) can settle Config-vs-navigation-tail without new code; **F5** UNPROVEN
false-red risk on the Select allowance veto (vite `chunk-*.js` classifies "unrelated"); **F7** #991's
swipe-dismiss WEDGE is statically refuted (`useAnimationsFinished` resolves immediately on an empty
population; the release path re-arms the transform transition before exit) — re-scope the issue to
visual continuity; **F8** gesture-driven motion (guide §3.6) has zero instrument coverage
fleet-wide. Grid census/gates, the entrance seam, dropped-frames parsing, reduced-motion arms, and
zero-hygiene all verified MATCHED with receipts (floating-ui rounds positioner transforms by DPR —
popups are grid-clean by construction). Proposed fix rows in report §6.
