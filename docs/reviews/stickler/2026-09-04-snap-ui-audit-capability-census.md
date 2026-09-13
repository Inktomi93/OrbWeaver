---
kind: review
status: active
updated: 2026-09-04
---

# Snap × ui-audit duplicated-capability census (#1322 — prep for #1315)

> Lane `p-capability-census` · stickler · worktree `wt/agent-a12b1e6f81d56f684` off main `cdf3446f6` ·
> the owner's question (2026-09-04): "we'll need to figure out which capability is better when tools
> have duplicated efforts." For every capability both `tooling/src/snap/` and `tooling/src/ui-audit/`
> implement, this census says which implementation survives the fold of `pnpm design-audit` into a snap
> arm, with the receipts a forge lane can execute against. Nothing was fixed; nothing outside this file
> and the gitignored `reports/runs/**` slots was written.

## 0. Verdict table

| # | Capability | ui-audit home | snap home | Verdict | Control |
| - | - | - | - | - | - |
| 1 | Contrast | `ops/walker/resolve.ts` (page-side resolver) · `lib/checks-color.ts` · `ops/pixels.ts` | `lib/contrast-script.ts` · `ops/arms/contrast.ts` · `lib/contrast-fill.ts` · `ops/contrast-pixels.ts` · `lib/contrast-verdict.ts` | **MERGE** — walker's page-side resolver + rule layer survive; snap's per-selector arm, refusal vocabulary, icon-ink, control-track exemption and the FILL arm survive; snap's in-page resolver (`contrast-script.ts:29-142`) retires | RUN (§2.1) |
| 2 | Element resolution + accessible name | `ops/walker/core.ts` `describe()` · `ops/walker/accessible-name.ts` · `census-interactive.ts:334` `doorNameKey` | `lib/map-browser.ts` `accessibleName`/`bestSelector` · `ops/arms/map.ts` `validateMapEntry` · `ops/arms/aria.ts` (`ariaSnapshot`) | **MERGE** — snap map's Node-proven unique locator survives as the selector authority; the walker's `describe()` gains the same anchors + a uniqueness proof; BOTH hand-rolled name resolvers are spec-inverted and fold onto ONE in-page name key with `--aria` as the oracle | RUN (§2.2) |
| 3 | Visibility / occlusion / hit-testing | `ops/walker/hit-extent.ts` · `census-collision.ts` · `census-occlusion.ts` · `core.ts` `isVisible`/`isOperable`/`srOnlyText` · `resolve.ts:304` `occluderOf` | `lib/map-browser.ts:17-33` `inactiveReason` · `contrast-script.ts:29,56` `inViewport`/`occluderOf` · `ops/overflow.ts` | **ui-audit SURVIVES** (hit extent, obscured target, reveal sweep are unique); MERGE the two byte-similar `occluderOf` and the three visibility predicates into the walker core segment | RUN (§2.3) |
| 4 | Stage / attach / session | `ops/stage.ts` · `lib/stage-request.ts` · `ops/audit-session.ts` | `ops/stage*.ts` · `lib/stage-plan.ts` · `lib/stage-bands.ts` · `ops/session-daemon-call.ts` · `lib/session-plan.ts` | **snap SURVIVES; ui-audit RETIRES**. #1321 dissolves: the arm is a session CALL, so it inherits `sessionCallTarget` (route → the daemon navigates its own page; no route → the live page; `--file` → file) — the attach path that navigated the OWNER's page goes away | judged by reading (T8 suite read; live semantics from `session-daemon-call.ts:102-107`) |
| 5 | Appearance / theme / density matrix | `ops/matrix.ts` · `ops/matrix-contract.ts` (theme × device, 3 risk rows) | `ops/matrix.ts` · `ops/matrix-contract.ts` (6 env axes, historical rows, session-hosted cells) · `ops/matrix-scenario.ts` | **snap SURVIVES; ui-audit RETIRES** — both are projections over `_shared/appearance-matrix.ts` + `_shared/variant-matrix.ts`; the arm rides snap's cells like every page arm | judged by reading, not run (29 browser boots for a structural relation) |
| 6 | Drive / nav / file actions | `ops/drive.ts` (click/upload/nav + `--settle`) | `ops/drive.ts` (full Step union, 4-state readiness) · `contract/actions.ts` | **snap SURVIVES; ui-audit RETIRES** — a strict subset; the arm keeps ui-audit's "a failed reveal action is NO VERDICT" exit semantic | judged by reading + the 20 live sweeps (`nav=OK` through the shared `_shared/nav.ts` engine) |
| 7 | Report / artifact | `ops/run.ts:109` hand JSON · `ops/report.ts` printers · `lib/result-rows.ts` · ~70 RESULT pairs | run slot + `run.json` + typed arm facts + findings layer + `--report` | **snap SURVIVES as the envelope; ui-audit's printers survive as the arm's `report()`**; the JSON becomes a registered artifact + a typed fact + problem rows | judged by reading + the artifact shapes of 32 runs this session |
| 8 | Population accounting | `lib/population.ts` · `lib/population-strategies.ts` · `lib/evidence.ts` · `lib/surface-state.ts` | `_shared/evidence.ts` `printVerdict` denominators | **ui-audit SURVIVES** (unique); its non-cap withholds map onto the arm state `withheld` + exit 2 | judged by reading + 5 of 20 live runs exiting 2 through it |
| 9 | Retirement / refusal map (found during the census) | `cli.ts` (74 lines) | `lib/retired-instruments.ts` · `motion-audit/cli.ts` (the precedent door) | the `pnpm design-audit` spelling retires by the motion-audit pattern; the census gains one token, one engine prefix and one migration spec | judged by reading (`unified-instrument.suite.int.test.ts:427-480` is the pattern's pin) |

Finding 10 (`extentTruncated` permanently withholding a surface): **refuted on both pointer arms** — 20
live runs, every one `withheld(extentTruncated=0 cap=0)` and `no-probe-frame=0` (§3).

## 1. Method

### 1.1 What was read, in full

- `tooling/src/ui-audit/**` — all 76 `.ts` files (15,730 lines with `ops/walker/RULE-AUTHORING.md`),
  every file whole: `cli.ts`, `index.ts`, `contract/*` (14), `lib/*` (20), `ops/*` (13), `ops/walker/*`
  (20), the law doc.
- `tooling/src/snap/**` — the arms roster and contract (`contract/arms.ts`, `arm-vocabulary.ts`,
  `run-facts.ts`, `run-index.ts`, `run.ts`, `verdict.ts`, `types.ts`, `help.ts`, `map.ts`, `contrast.ts`,
  `session.ts`, `stage.ts`, `matrix.ts`, `actions.ts`, `overflow.ts`, `plan.ts`, `theme-stamp.ts`,
  `appearance-invariants.ts`), every arm that overlaps a ui-audit capability (`ops/arms/{contrast, map,
  aria, shot, eval, assert, dead-css, motion, help, registry}.ts`), the drive/capture/run/report/verdict
  spine (`ops/{drive, capture, run, report, verdict, run-bundle, run-report, run-report-render, manifest,
  parse, parse-scan, parse-page-targets, flag-grammar, flags-*, guards, scenario, contexts, overflow,
  page-validate, theme-stamp}.ts`), the stage/session substrate (`ops/{stage, session, session-attach,
  session-daemon, session-daemon-call, session-client}.ts`, `lib/{stage-plan, stage-bands, session-plan,
  session-refusals, session-wire, cli-mode, out-names, flag-values, retired-instruments, contrast-fill,
  contrast-script, contrast-verdict, map-browser, map-report, matrix-appearance, motion-problems,
  run-findings, run-finding-*, run-bundle-verdict, selector-shape}.ts`), the matrix (`ops/{matrix,
  matrix-contract, matrix-motion, matrix-scenario}.ts`, `ops/appearance-invariant{-runtime, -dom,
  -checks, s}.ts`, `ops/contrast-{fill, pixels}.ts`), `cli.ts`, `index.ts`.
- `tooling/src/_shared/**` — `wcag, pixel-backdrop, page-validate, evidence, nav, upload, browser,
  browser-context, browser-contract, browser-capture, browser-environment, browser-emulation-guard,
  instrument-argv, appearance-matrix, variant-matrix, variant-matrix-contract, appearance,
  appearance-flags, artifact-out, artifacts, artifact-scope, load-budget, instruments, entrypoint,
  exit-contract, run-tool, theme, panel-flags, panel-presets.json, rated-theme-fixture,
  scoped-run-paths, argv`.
- The two folded siblings as the template: `tooling/src/motion-audit/{cli,index}.ts`,
  `tooling/src/screen-record/{cli,lib/retired}.ts`, `tooling/src/snap/ops/arms/motion.ts`.
- Gates that read ui-audit: `tooling/src/verify/gates/design-audit-rule-proof.ts`,
  `tooling-shared-plumbing.ts` (whole).
- Law/design: `docs/architecture/core/Core-Tooling-Law.md` (whole), `docs/design/1208-instrument-
  substrate.md` (whole, 1425 lines), `docs/design/983-984-ui-audit-population-semantics.md` (whole),
  `tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md` (whole). `Core-Laws-and-Precedents.md` carries zero
  lines matching `ui-audit|design-audit|snap` (grep, 0 hits on a 1-file scan) — no D-row governs this fold;
  the governing rulings are `Core-Tooling-Law.md` §1/§2.4/§2.6/§2.8/§4.2/§9 and 1208 §9/§10.6/§12.3.
- Tests: `tests/tooling/ui-audit/session-attach.suite.int.test.ts`, `tests/tooling/motion-audit/
  cli.int.test.ts`, `tests/tooling/snap/ops/unified-instrument.suite.int.test.ts` (whole);
  `tests/tooling/ui-audit/cli.int.test.ts` lines 1-834 of 2003 and `tests/tooling/ui-audit/index.test.ts`
  lines 1-1076 of 2444 (PARTIAL — the halves read cover the proof shape and every assertion class the fold
  plan depends on; the unread halves are more rule proofs of the same shape).

**Not read** (outside every duplicated capability): snap's perf/heap/filmstrip/lighthouse/requests/
cpu-profile/boot-trace/react-profile/cascade/interaction-perf arms, the DevTools SDK runtime and its
vendored assets, HAR/network/redaction modules, `session-daemon-{request,wire}`, `session-{evidence,
heartbeat,registry,stage-liveness,admin,call-watchdog}`, `stage-{census,git,marker,probe,source,
status}`, `run-bundle-{files,state,receipt,artifacts}`, `run-report-{query,problems,candidates,
identity,legacy,shapes,analyzers}`, `scenario-{facts,host,prepare}`, `diagnostics`, `diff`, `fixture`,
`noise`, `request-ring`, `watch`, `materialize-devtools`; `tests/tooling/snap/**` other than the two
suites above; `tests/tooling/ui-audit/**` other than the three files above (their names were used for the
test-follow map in §4, not their bodies).

### 1.2 What ran (one browser at a time; every run redirected to a log and read whole)

Four planted fixtures in the session scratchpad (`ctl/pcc-{contrast,accname,selector,obscured}.html`,
each declaring `data-app-ready` on `<html>` and carrying a `<main>`), driven through BOTH homes by
`scratchpad/pcc-controls.sh` (`env -C <wt> pnpm -s design-audit … --base file://<dir>` vs `env -C <wt>
pnpm -s snap --file <fixture> …`), plus one `pnpm snap --eval` receipt (`pcc-eval.sh`). Exit ledger:

```text
da-contrast=1  snap-contrast-css=1  snap-contrast-pixel=1
da-accname=1   snap-map-accname=0   snap-aria-accname=0
da-selector=1  snap-map-selector=0  snap-eval-selector=0
da-obscured=1  snap-map-obscured=1
```

Live sweeps on `:5173` (serves main == this lane's base): `pcc-sweep.sh` (desktop, 1280x800, fine
pointer) and `pcc-sweep-mobile.sh` (`--mobile`: iPhone 14 Pro Max, coarse pointer) over `/`, `/chats`,
`/characters`, `/corpus`, `/config`, `/extensions`, `/databank`, `/presets`, `/refinery`, `/analytics`
(`SECTION_IDS`, `packages/client/src/state/section-ids.ts:18`) — 20 runs, artifacts under
`<wt>/reports/runs/ui-audit/agent-a12b1e6f81d56f684-<pid>-2026-09-04T{13-52…13-53,14-10…14-11}Z/design-audit/pcc-{,m-}<section>.json`.

**Could not / did not run:** the matrix (capability 5), the drive subset (6), report/artifact (7) and
population (8) verdicts are judged by reading; the live sweeps and control runs exercised those code paths
incidentally (every RESULT line, every population row, every artifact) but no A/B control was planted for
them because the relation is structural (a subset, a projection, an envelope), not a measurement.

### 1.3 Environment receipts

- `:5173` answered 200; vite pid 3390773 started 2026-09-04 01:40; ten main commits landed 06:00-06:59
  after it (incl. `561ea5ec3 feat(snap): unify the rendered instruments into snap arms (#1292)` and
  `b4e9462b9 fix(ui-audit)`); main HEAD == worktree base `cdf3446f6`. The served app was probed by the 20
  audits themselves: `nav=OK environment-fails=0` on all 20, zero `script-error`, `dom-added=0
  dom-detached=0` on all 20 — the instrument-side premise holds (`instruments-lie-rendered-audit-hub`,
  `long-lived-vite-corrupt-graph`: a corrupt graph would surface as a page error or an unstable census;
  neither occurred). No SendMessage was warranted: no lie, no shared-tree edit, no refuted premise.
- Box load during runs: `load=8.3…10.6/24 budget-factor=1.00` on every snap RESULT line — quiet, budgets
  byte-identical to base.

## 2. The capabilities

### 2.1 Contrast — MERGE

**ui-audit home.** Page side: `ops/walker/resolve.ts` — `probeColor` (canvas two-sentinel, alpha kept)
`:27`, `parseGradientStops` `:99`, `compositeOver` `:124`, `paintLayers` census of fixed/absolute
contentless painted layers `:166`, `paintsOverSubject` `:192`, `paintLayerOver` `:202-216` (the veto:
`unresolved(paint-layer-over-base)` `:243`), `resolveBackdrop` `:258`, `resolveBackdropUnder` `:272`,
`resolveBackdropAt` `:279`, `image-indeterminate` `:232`. Node side: `lib/checks-color.ts`
(`contrastOutcome` partitions dimmed/unresolvedBackdrop/inactive/image/gradient/flat, the inactive
advisory, gray-on-color, quiet-state, the four-rule single-pass `colorTextPopulations`),
`ops/pixels.ts` (ONE viewport screenshot `:30`, `ringBackdropOfRegion` for every `unresolved` text
`:38-60`), `census-region.ts:131` `relLum` (the one in-page luminance spelling — not a duplicate of the
Node kernel, which lives once in `_shared/wcag.ts`).

**snap home.** Page side: `lib/contrast-script.ts` — `inViewport` `:29`, `occluderOf` `:56`, a DOM
ancestor `resolveBackdrop` `:137-142` returning `flat|transparent|indeterminate`, with an
app-specific root-base distrust keyed on `[data-has-bg-image]` `:136` and a STATED gap at `:133-135`:
"GENERIC GAP not covered: any app that paints a fixed sibling over the body without this signal". Node
side: `ops/arms/contrast.ts` (Playwright-engine marking `data-snap-contrast-idx` `:44`,
`captureContrastEvidence` `:217`, `isFillSubject` `:134`), `lib/contrast-verdict.ts`
(`CONTROL_TRACK_ROLES` `:19`, `refuseContrastVerdict` OFF-SCREEN/OCCLUDED `:39-48`),
`ops/contrast-pixels.ts` (per-element clip screenshot `:26` → `ringBackdrop` `:33`),
`lib/contrast-fill.ts` + `ops/contrast-fill.ts` (the #1111 FILL arm: `BUCKET_SIZE` `:32`,
`MIN_SURROUND_SHARE` `:49`, `readFillChannels` `:165`), `--contrast-pixel` `ops/arms/contrast.ts:248-261`.
Shared kernels already one-home: `_shared/wcag.ts`, `_shared/pixel-backdrop.ts`.

**Control** (`ctl/pcc-contrast.html`: a `position:fixed; z-index:-1; background:#fff` 120px band under
white text, an `opacity:.6` group, a light gradient, a disabled control, a fill-only swatch, an icon-only
button, and a clean white-on-black paragraph):

| Subject | design-audit | snap `--contrast` (css-resolve) | snap `--contrast-pixel` |
| - | - | - | - |
| `#layer-text` (white over a fixed white layer the DOM cannot see) | **P1 contrast 1.00:1** (px-backdrops=5: the walker returned `unresolved`, the runner pixel-settled it) | **21.00:1 PASS — FALSE CLEAN** (the `:133-135` gap, reproduced) | 1.00:1 FAIL |
| `#alpha-text` (α0.6 group) | P1 4.01:1 · dimmed α0.60 | 4.01:1 FAIL · dimmed α0.60 | 4.01:1 FAIL |
| `#gradient-text` | **P0 text-over-art 1.00:1 worst-stop** (stop math; `contrast` row `excluded(gradientBackdrop=1)`) | 1.16:1 FAIL (pixel-sample — snap auto-falls back on `indeterminate`) | 1.16:1 FAIL |
| `#disabled-btn` | P3 inactive-control-legibility 2.16:1 (`contrast excluded(inactiveExempt=1)`) | SKIPPED inactive control (WCAG exemption) | SKIPPED |
| `#fill-swatch` (no text) | not a candidate | **FILL 1.32:1 FAIL** (fill-only · 34,34,34 on 0,0,0 · need 3.0) | FILL 1.32:1 FAIL |
| `#icon-btn` (icon ink, no text) | not a candidate | **1.66:1 FAIL** (ui-component · need 3.0) | 1.66:1 FAIL |
| `#good` | clean | 21.00:1 PASS | 21.00:1 PASS |

Logs: `scratchpad/ctl-logs/{da-contrast,snap-contrast-css,snap-contrast-pixel}.log`; artifact
`<wt>/reports/runs/ui-audit/agent-a12b1e6f81d56f684-1206665-2026-09-04T14-08-09-149Z/design-audit/pcc-ctl-contrast.json`
(`pixelSampledBackdrops: 5`, `backdropRefusals: []`).

**Verdict: MERGE, keeping the walker's resolver as the ONE page-side backdrop resolver and snap's arm as
the ONE per-selector door.**

- Survives from ui-audit: `resolve.ts` whole (the paint-layer census is the generic answer to snap's
  stated gap — it needs no app signal), `checks-color.ts` whole (the rule layer: partitions, advisory,
  gray-on-color, quiet-state, stop math), `pixels.ts` (the one-shot viewport pass for a whole-page walk).
- Survives from snap: `ops/arms/contrast.ts` (per-selector marking through the Playwright engine — the
  walker cannot address a `role=` / `>> nth=` selector), `contrast-verdict.ts` (the OFF-SCREEN/OCCLUDED
  refusal vocabulary and `CONTROL_TRACK_ROLES`), the FILL arm (`contrast-fill.ts` + `ops/contrast-fill.ts`
  — nothing in ui-audit measures a fill-only subject), `hasIconInk`/`ui-component` floor for icon-only
  controls (nothing in ui-audit judges an icon glyph), `ops/contrast-pixels.ts` (per-element clip is the
  right shape for a single target), `--contrast-pixel`.
- Retires: `lib/contrast-script.ts:29-142` (`inViewport`, `occluderOf`, `toRgbString`, `isOpaque`,
  `compositeOver`, `resolveBackdrop` with the `[data-has-bg-image]` hint) — replaced by the walker's
  `WALKER_CORE`+`WALKER_RESOLVE` segments wrapped for one element. The `[data-has-bg-image]` signal is
  subsumed: the walker's `paintLayers` census catches the shell's art layer generically (#218's class).
- Stated cost, measured: `paintLayerOver` skips the rect intersection for a FIXED layer
  (`resolve.ts:209-212`), so one fixed painted layer sent 5 of 7 fixture texts to the pixel pass (`px-backdrops=5`). On the 20 live runs `px-backdrops=0` throughout — no cost at rest on the app;
  a conservatism, not a defect. The forge lane should keep it (a fixed layer can scroll under anything).
- Divergence to keep as data, not to resolve: the gradient — ui-audit judges by stop math (P0 on the
  worst stop; a translucent stop refuses), snap by pixels (1.16:1). The merged resolver should return the
  parsed stops AND let the arm pixel-sample; the P0/P1 rule semantics stay `checks-color.ts`'s.

### 2.2 Element resolution + accessible name — MERGE (and a confirmed defect in BOTH homes)

**ui-audit home.** `core.ts:214` `DESCRIBE_MAX_STEPS = 6`, `:223` `matchCount`, `:247-264` `anchorOf`
(id / testid / slot, each only when it matches exactly once), `:265-286` `describe()` — climbs at most
six `tag.class[slot]:nth-of-type(n)` steps and returns the path WHETHER OR NOT it is unique.
`accessible-name.ts:21` `labelledbyText`, `:58` `nativeLabelText` (`el.labels`), `:68` `altTextOf`;
`census-interactive.ts:334` `doorNameKey(aria-label || labelledby || nativeLabel || textContent || title
|| alt)` — aria-label FIRST; `lib/checks-a11y.ts:314-333` `checkAccessibleName` (presence only, by
design — RULE-AUTHORING row 8).

**snap home.** `lib/map-browser.ts:51-55` `accessibleName` — `aria-label` `:52` read BEFORE
`aria-labelledby` `:54`; `:121-134` `bestSelector` (testid → ancestor testid → `[aria-label=…]:visible`
→ `role=X[name=…]` → nth-of-type), `:202` checkVisibility; `ops/arms/map.ts:28-43` `validateMapEntry`
proves `count()===1` + `isVisible` + `isEnabled` in Node and refuses a non-unique locator;
`ops/arms/aria.ts:29` `root.ariaSnapshot()` — Playwright's own accname engine.

**Controls.**

(a) `ctl/pcc-accname.html` — pair one: `#both-a`/`#both-b` share `aria-label="Same label"` but carry
DIFFERENT `aria-labelledby` (`Alpha action`/`Beta action`); pair two: `#dup-a`/`#dup-b` carry different
`aria-label`s (`Open menu`/`Close menu`) but the SAME `aria-labelledby` (`Menu`). Per accname 1.2 step 2B
(labelledby) precedes 2C (aria-label), so the real names are Alpha/Beta (NOT duplicates) and Menu/Menu (a
REAL duplicate).

| Home | Result |
| - | - |
| design-audit `--fail-on P3` | `P3 duplicate-action-door #both-a … 2x button "same label"` — **false positive**; `POPULATION duplicate-action-door candidates=2 judged=2 affected=2` — the real Menu/Menu duplicate **missed** (its keys were `open menu`/`close menu`) |
| snap `--map` | `button "Same label" … >> nth=0`, `button "Same label" … >> nth=1`, `button "Open menu"`, `button "Close menu"` — the same inverted precedence |
| snap `--aria` | `button "Alpha action"`, `button "Beta action"`, `button "Menu"`, `button "Menu"` — **correct** |

Logs: `ctl-logs/{da-accname,snap-map-accname,snap-aria-accname}.log`; artifact `…-1208087-…/design-audit/pcc-ctl-accname.json` (`findings[0].representatives = ["#both-a","#both-b"]`).

(b) `ctl/pcc-selector.html` — two identical seven-deep subtrees with no id/testid/slot, each ending in an
18px `button.tiny` carrying only an `aria-label`.

| Home | Result |
| - | - |
| design-audit | `P1 tap-target` with BOTH representatives = `div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > button.tiny:nth-of-type(1)` (artifact `…-1208991-…/design-audit/pcc-ctl-selector.json`) |
| `pnpm snap --file … --eval 'document.querySelectorAll(<that selector>).length'` | **2** (`["First tiny","Second tiny"]`) — the finding selector is not unique and is unforwardable, the exact class #148 item 5 closed for `data-slot` anchors |
| snap `--map` | `[aria-label="First tiny"]:visible`, `[aria-label="Second tiny"]:visible`, `role=button[name="healthy twin"]` — each proven unique in Node |

**Verdict: MERGE.**

- Selector: snap map's two-tier shape SURVIVES as the locator authority — in-page `bestSelector` anchors
  (testid → aria-label → role+name → nth path) PLUS the Node `validateMapEntry` uniqueness proof. The
  walker's `describe()` stays for the in-page census (it is called thousands of times per walk and cannot
  afford a Node round trip) but must (i) gain the aria-label / role-name anchors `map-browser.ts:133-134`
  already uses and (ii) either anchor on `body` when six steps are exhausted or have the arm post-validate
  every EMITTED finding selector in Node (`page.locator(sel).count()`) and mark non-unique ones. Both halves
  are cheap; the second is the one that makes the emitted row honest.
- Accessible name: the two hand-rolled resolvers fold onto ONE in-page name KEY with spec precedence
  (`aria-labelledby` → `aria-label` → native label → name-from-content → `title` → `alt`), homed in the
  walker's `accessible-name.ts` segment (already the shared arm for labelledby/native/alt) and exported
  through ui-audit's front door for snap's map string. `--aria` (`ariaSnapshot`) is the ORACLE for the
  proof and stays as is. This does not reopen `Core-Tooling-Law.md` §2.8 (line 144: the accname-engine
  merge into `@orb/ui` is refused, and `aria-name` never computes a name) — `aria-name` keeps its presence
  test; the DOOR census and the map both compute a comparison key today and compute it wrong the same
  way. The fold is the moment to make it one key.

### 2.3 Visibility / occlusion / hit-testing — ui-audit SURVIVES; the primitives MERGE

**ui-audit home.** `hit-extent.ts:48` `HIT_PROBE_RADII [11,12,16,22]`, `:188` `ownsPoint`, `:218-227`
`measureHitExtent` (per-point `truncated` vs capped, `pointInFrame`), `census-interactive.ts:204`
`REVEAL_SCROLL_BUDGET = 400` reveal sweep + re-centre + `extentTruncated: lowerBound` `:309`,
`census-collision.ts:208` `elementFromPoint` at the subject's own centre, `:243` `coveredRatio`, `:260-265`
`unaskable` withholding; `census-occlusion.ts` (placement collisions via clipped painted rects — its own
header `:44` names `snap/ops/overflow.ts` as the reasoning home it cannot share bytes with);
`core.ts` `isVisible`/`isOperable`/`accumulatedOpacity`/`srOnlyText` (tri-state), `resolve.ts:304`
`occluderOf`.

**snap home.** `map-browser.ts:17-33` `inactiveReason` (checkVisibility + a reasons vocabulary — the
\#1297 `--include-hidden` / locator-only labelling), `contrast-script.ts:29` `inViewport`, `:56`
`occluderOf` (the byte-similar twin of the walker's), `ops/overflow.ts` (`--expect-no-overflow` child-rect
sweep). Nothing in snap files an occlusion FINDING.

**Control** (`ctl/pcc-obscured.html`: an informative `#badge` first in DOM, a later positioned `#start`
button painted over 62% of it).

| Home | Result |
| - | - |
| design-audit | `P1 obscured-target #badge — "2 rules" is painted here, but a press at its own centre lands on #start (63% covered, 100px overlap)`; `obscured-target candidates=4 judged=4 affected=1` |
| snap `--map --contrast '#badge'` | map lists `Start` and `healthy twin` only (the badge is not interactive; no occlusion notion); `CONTRAST #badge: OCCLUDED 1 in-viewport match(es) of 1, all painted over, behind button#start — NO VERDICT` — the same primitive, used only as a refusal |

Logs: `ctl-logs/{da-obscured,snap-map-obscured}.log`.

**Verdict: ui-audit SURVIVES** — hit extent, the obscured-target and placement-collision rules, the reveal
sweep and the truncated-extent withholding have no snap counterpart. **MERGE the primitives:** one
`occluderOf` (the walker's, `resolve.ts:304`; snap's `:56` retires with the script in §2.1), one
visibility predicate family in the walker core segment (`isVisible`/`isOperable`/`srOnlyText` + map's
`inactiveReason` vocabulary, which is what the #1297 `dom-rendered`/`dom-retained-hidden` accounting
already keys on), exported through ui-audit's front door so the map string reads the same predicate.
`ops/overflow.ts` stays snap's (it answers `--expect-no-overflow`, a different question; the walker's
`census-occlusion.ts` header already declares the two cannot share bytes).

### 2.4 Stage / attach / session — snap SURVIVES; ui-audit RETIRES; #1321 dissolves

**ui-audit home.** `ops/stage.ts:15` imports `ensureStage/shortSha/stageRowBaseUrl/tryResolveRef` from
`../../snap/index.ts` (already the front door, #678), prints `STAGE_DB_NOTE`/`STAGE_WARMUP_NOTE` `:39-40`
and `COLD_STAGE_REFUSAL` `:52`; `lib/stage-request.ts` (`stageArgErrors` refuses `--base`+stage and
`--session`+`--isolated`; `unknownRefRefusal`; `stageLabel`); `ops/audit-session.ts:33-39`
`resolveSessionAttach` → `attachResolvedSession` → `base = opts.baseExplicit ? opts.base :
attach.row.binding.url` — the sibling ATTACH that then navigates the daemon's page from a second CDP
client (T8: `tests/tooling/ui-audit/session-attach.suite.int.test.ts:95-114`).

**snap home.** `lib/stage-plan.ts` (band access/claim/consent, the DB-bound env allowlist),
`lib/stage-bands.ts` (allocator, strand rule, `stageHealthVerdict` `:257-271` — `degraded` on a stale
served-probe), `ops/session-daemon-call.ts:102-107` `sessionCallTarget` + `neverNavigatedRefusal`,
`:131-133` live-page evidence reset, `:139` `navigate: target !== "live"`; `lib/session-plan.ts:308-312`
(`file` / `route` / `live`), `:108` `SESSION_ONLY_FLAGS`; `ops/parse-scan.ts:110-116` refuses `--base`
beside a stage source; `_shared/instrument-argv.ts:133` `SESSION_FLAG_HELP`, `:58` ("design-audit/record
resolves through snap's front door").

**Verdict: snap SURVIVES; `ops/stage.ts`, `lib/stage-request.ts`, `ops/audit-session.ts` RETIRE.**
Judged by reading (the attach suite and the daemon call path were read whole; no control is needed for a
path that ceases to exist).

- **#1321 ("which snap session rule does the folded arm inherit").** As a page arm, design-audit runs
  inside `runOnSession` — so a session call `pnpm snap --session x /chats --design-audit` NAVIGATES the
  daemon's own page (`target === "route"`), `pnpm snap --session x --design-audit` audits the LIVE page
  without navigating (`target === "live"`, refused while the session sits at `about:blank`), and `--file`
  is `file`. The attach-and-navigate-the-owner's-page shape (Arm A/B of #1321) is moot: there is no
  second CDP client any more. The T8 promise ("the session's declared viewport is what design-audit
  measures") survives as a design-audit-arm call on a live session, asserted through the same
  `viewport-actual=`/`environment-fails=0` pairs, in `tests/tooling/snap/ops/session-daemon.int.test.ts`.
- What must be preserved from the retiring half: the COLD-STAGE semantic (`stage-request.ts` refuses a
  stage this run booted) — snap already refuses a `degraded` stage at `ensureStage` and the arm's
  `readinessGap` (`lib/evidence.ts:269`) refuses an `absent` flag; the forge lane owes one planted control
  that a just-booted stage still yields NO VERDICT (the 14-vs-332 census receipt of #678). The
  `STAGE DB:` note (`contract/help.ts:55-60`) has no home in `snap/contract/help.ts` (grep `STAGE DB|copies
  the dev db|cold`: 0 hits) — it moves into snap's stage help block. `stageArgErrors`'s two refusals are
  already snap's (`parse-scan.ts:110-116`; `sessionModeValidationPairs`).
- Coupled-site fork (stated default): with every sibling folded, `snap/ops/session-attach.ts` (whose
  `refuseDirectInvocation` string is `"pnpm design-audit --session <name> <route>"` at `:30`) loses its
  only consumer. Default: delete it with `tests/tooling/ui-audit/session-attach.suite.int.test.ts`; keep
  `_shared/browser.ts` `attachProbeSession`, gate arm H and `tests/tooling/_shared/browser-attach.suite.int.test.ts`
  (the substrate's attach physics is proven there and 1208 §3.4 still names it). The alternative — keep
  the door for a future non-snap sibling — is "unwired ≠ worthless" with no named intent; 1208 §12.3 says
  snap is the sole rendered front door.

### 2.5 Appearance / theme / density matrix — snap SURVIVES; ui-audit RETIRES (judged by reading)

**ui-audit home.** `ops/matrix-contract.ts:33-38` axes = `theme` × `device` (`desktop-fine-hover`,
`mobile-coarse-none`); `:48-64` `auditRiskRows` = `compact-portal-carried`,
`light-art-scrim-glass-elevation`, `mobile-compact-large-document`; `ops/matrix.ts` runs `runUiAudit` per
cell and writes `<base>-matrix.json` through `artifactFile("design-audit", …)`.

**snap home.** `ops/matrix-contract.ts` — six environment axes (theme, device, os-color, os-motion,
contrast, transparency), `riskRows`/`riskTwins`, `historicalRowsForCell`; `ops/matrix.ts` runs the SAME
page arms per cell (1208 §10.9 table: "matrix creates the same rendered cell then invokes the same page
arms"); F10 rides a session (`snapMatrixOnSession`, `session-daemon-call.ts:118-122`); the appearance
invariant rows R1-R7 (`ops/appearance-invariant*.ts`) and the scenario matrix.

**Verdict: snap SURVIVES; `ui-audit/ops/matrix.ts` + `ops/matrix-contract.ts` RETIRE.** Both are thin
projections over `_shared/appearance-matrix.ts` + `_shared/variant-matrix.ts` (`planVariantMatrix`);
snap's projection is the superset (six axes vs two, historical rows, session-hosted cells). The arm's
per-cell run is free: `--matrix --design-audit`. Forge check: the three audit risk-row ids are the same
ids snap's historical rows carry (R1/R3/R4) — pin by test that `--matrix --design-audit` produces a cell
for each, so the fold loses no rated cell. Not run: a 13-cell + 16-cell A/B would cost 29 browser boots
to confirm a relationship the two contract files state in code.

### 2.6 Drive / nav / file actions — snap SURVIVES; ui-audit RETIRES (judged by reading)

**ui-audit home.** `ops/drive.ts` — `page.goto` (domcontentloaded), a GRACEFUL `html[data-app-ready]`
attached-wait `:81-83` feeding the boolean `appReady` (→ `readinessGap`, `file://` exempt), the
argv-ordered queue of `click` / `upload` / nav (`runNav`, `_shared/nav.ts`) `:42-65`, `--settle <ms>`
(default 500, `contract/defaults.ts`), then `rawSamples(await page.evaluate(COLLECT_SAMPLES_JS))`.

**snap home.** `ops/drive.ts:24-57` the four-state readiness ladder (`settled|degraded|dataless|absent`,
`UNSETTLED_REASON`), `:87` `--file` never waits for the flag; the full `Step` union
(`contract/actions.ts`: click/dom-click/force-click/hover/fill/key/wait-for/upload/drop-files/pause/
wheel/wheel-burst/motion-click + the six nav verbs), the run-arm lifecycle around every action
(`beforeAction`/`afterAction`), `splitTrailingEvals`, `settlePage`.

**Verdict: snap SURVIVES; `ui-audit/ops/drive.ts` RETIRES.** ui-audit's vocabulary is a strict subset
and both already share `_shared/nav.ts` + `_shared/upload.ts` (the 20 live runs drove `nav=OK` through
that engine). Three semantics the arm must carry over, each with a home in the arm rather than in drive:

1. `readinessGap` reads snap's ladder — `absent` (and `dataless`) on an app origin → NO VERDICT; `file://`
   stays exempt by construction (`snap/ops/drive.ts:87` already skips the wait for `--file`).
2. A failed reveal action is NO VERDICT (exit 2, `actionsFailedGap`, pinned at
   `tests/tooling/ui-audit/cli.int.test.ts:676-685`), whereas snap's step failure is exit 1
   (`steps-failed=1`). The arm's `exit()` returns `EXIT.toolError` when `ctx.stepFailuresBefore +
   ctx.navFailuresBefore > 0` — the motion arm's `reachFailures` shape (`ops/arms/motion.ts:153`).
3. `--settle <ms>` retires BY NAME → `--pause <ms>` (the `screen-record/lib/retired.ts:43-45` precedent
   already translates `--settle` → `--pause`); the 500ms post-action settle is snap's `settlePage`.

### 2.7 Report / artifact — snap SURVIVES as the envelope; ui-audit's printers survive inside it

**ui-audit home.** `ops/run.ts:109` `artifactFile("design-audit", …)` + `writeFile` of a hand JSON with
~30 top-level keys (`findings`, `populationAccounting`, `populationVerdict`, `censusReach`,
`censusCaps`, `obscuredRecentred/Unaskable`, `hoverPass`, `domPopulation`, `themeEvidence`,
`surfaceStateAccounting`, `browserEnvironment`, `stage`, …), `printVerdict("design-audit", …)` with the
`census` + `scanned-<family>` denominators and ~70 RESULT pairs (`lib/result-rows.ts`, `ops/run.ts`),
the printers in `ops/report.ts` (REACH, SHELL STATE, SURFACE-AXIS, POPULATION, findings table, backdrop
refusals, obscured scan).

**snap home.** `_shared/artifact-out.ts` slot + `registerInstrumentArtifact` metadata,
`contract/run-index.ts` `run.json`, `contract/run-facts.ts` typed `snap-arm-<arm>-v1` facts with
`SNAP_ARM_STATES` (`passed|failed|refused|withheld|absent|off`, `:15`), `armPairLedger`, the findings
layer (`lib/run-findings.ts`, `SnapAnalyzerProblem` rows — `lib/motion-problems.ts` is the shape), the
browser-free `--report … --problems` reader.

**Verdict: snap SURVIVES as the envelope; ui-audit's report layer survives as the arm's `report()`.**
Judged by reading plus the 32 artifacts this session produced in both shapes. The arm owes: `ARMS` member
`design-audit`; `ARM_DEFS.design-audit` (`level: "call"`, `lifecycle.at: "page"` — the walk is a settled-
surface read; hover forcing is a page op); a fact schema `snap-arm-design-audit-v1` carrying `state`,
`detail`, `findings {p0,p1,p2,p3}`, `failOn`, `populationVerdict`, the per-rule
`RulePopulationAccounting` map, `censusReach`, `obscured`, `hover`, `dom` and `theme` accounting (the
RESULT pairs are derived from it — no second spelling); the JSON artifact registered with
`producerArm: "design-audit"`, `schema: "snap-design-audit-v1"`, `completeness: bounded` iff any
`censusCaps[*].dropped > 0`; `designAuditProblems()` (one `SnapAnalyzerProblem` per finding: `kind:
"threshold"`, `metric: <rule>`, `subject: <selector>`, `observed: <value>`, `threshold: <fail-on>`, plus
`evidence-gap` rows for each `EvidenceGap`) so `--report --problems` names the findings without the source.
`--fail-on <P>` becomes the arm's flag unchanged (no snap flag collides; `KNOWN_FLAGS` has none);
`--out` keeps snap's base/path contract and the arm files `<name>-design-audit.json` (the
`${ctx.name}-motion.json` precedent, `ops/arms/motion.ts:310`).

### 2.8 Population accounting — ui-audit SURVIVES (unique)

**ui-audit home.** `lib/population.ts` (the settlement identities \`candidates = judged + withheld\[non-cap]

- excluded`, `affected = emitted + cap + collapsed`, `assertCarried`, `populationEvidenceGap`: any
  non-cap withhold ⇒ NO VERDICT), `lib/population-strategies.ts`(the four rungs and the rung table in`lib/collect.ts:14-98`), `lib/evidence.ts`(census/reach/readiness/thin/cap/failure-surface/nav/actions/
  instrument-page-error/theme-provenance gaps),`lib/surface-state.ts`(the panel/focus/drive axes and the #1122 exclusions),`contract/samples-populations.ts` (`CENSUS_CAP_FAMILIES\`).

**snap home.** `_shared/evidence.ts:120-139` `printVerdictReceipt` — declared denominators with
`refuseWhen: zero|below|unstable` and `honestEmpty`; the arm states in `run-facts.ts`.

**Verdict: ui-audit SURVIVES** — nothing in snap partitions a population per rule. The arm maps the
vocabulary rather than re-deriving it: `populationEvidenceGap !== null` (or any other `EvidenceGap`) ⇒
arm state `withheld` (the state exists, `run-facts.ts:15`) + `exit → EXIT.toolError`; complete ⇒
`passed|failed` by `--fail-on`; denominators `design-audit-census {refuseWhen: "zero"}` and the eight
`scanned-<family>` pairs ride `denominators()`; `reachGap` stays a gap (it is conditional on `offered`).
Receipts: 5 of the 20 live runs exited 2 through exactly this seam (§3).

### 2.9 Retirement / refusal map — the pattern already exists

`tooling/src/motion-audit/cli.ts` is the door (prints `RETIRED …` + `REPLACEMENT  pnpm snap …` and
returns `EXIT.misuse`, parsing nothing, opening no slot); `tooling/src/screen-record/lib/retired.ts` is the
pure translator shape; `tooling/src/snap/lib/retired-instruments.ts` is the census (`LEGACY_COMMAND`
`:23`, `TOKENS` `:24`, `INTERNAL_ENGINE_PREFIXES` `:17`, `MIGRATION_SPECS` `:18`), pinned by
`tests/tooling/snap/ops/unified-instrument.suite.int.test.ts:427-480`. The `design-audit` entry is in §4.

## 3. Finding 10 — the `extentTruncated` sweep

Claim under test: `extentTruncated` is a non-cap withheld reason, so a fixed control in a corner under
44px after re-centring would make every audit of that surface exit 2 forever.

**Result: NOT reproduced on any of the 11 surfaces at either pointer arm.** 20 runs (10 desktop 1280x800
fine, 10 `--mobile` iPhone 14 Pro Max coarse); every RESULT line carries `no-probe-frame=0` and every
`POPULATION tap-target` row `withheld(extentTruncated=0 cap=0)`.

| Surface | desktop exit / verdict | mobile exit / verdict | reason when NO VERDICT (both arms) |
| - | - | - | - |
| `/` (home) | 0 / complete (2×P3: all-caps-body 34 chars; line-length 93 chars on `[data-slot=card-root] > div.flex…`) | 0 / complete (1×P3) | — |
| `/chats` | **2 / NO-VERDICT** | **2 / NO-VERDICT** | `selection-idiom withheld(unmatchedUnselected=1)` — the #1114 rest-regime class (983-984 amendment 1), not extent |
| `/characters` | **2 / NO-VERDICT** (5×P3 duplicate-action-door on `[data-slot=virtual-list-viewport] > …`) | **2 / NO-VERDICT** | `selection-idiom withheld(unmatchedUnselected=1)` desktop, `=2` mobile |
| `/corpus` | 0 (13×P2) | 0 (P2 tap-target 42px `[data-slot=autocomplete-input]`, landmark-missing, double-empty-state, P3) | — |
| `/config` | 0 (2×P2, 5×P3) | 0 (3×P2 incl. tap-target 40px `[data-slot=theme-collection]`, 4×P3) | — |
| `/extensions` | 0 (1×P3) | 0 (landmark-missing P2, P3) | — |
| `/databank` | 1 (P1 aria-name `[data-slot=databank-content]`) | 0 (landmark-missing P2, P3) | — |
| `/presets` | 0 (1×P2) | 0 (landmark-missing P2, P3) | — |
| `/refinery` | **2 / NO-VERDICT** (1×P3 nested-card `[data-slot=command-root]`) | 0 (landmark-missing P2, P3) | `selection-idiom withheld(unmatchedSelected=1)` desktop only |
| `/analytics` | 0 (2×P3) | 0 (landmark-missing P2, P3) | — |

Reach receipts: `REACH n/n offered control(s) measured` on all 20 (desktop: 43/35/42/…; home mobile
34/34 with 2 revealed by 6 scrolls and 1 re-centred; config mobile 79/79 with 6 revealed, 8 re-centred,
`obscured-recentred=9`) — the re-centre ran and never left a truncated frame behind. Artifact paths:
`<wt>/reports/runs/ui-audit/agent-a12b1e6f81d56f684-<pid>-2026-09-04T13-52-…Z/design-audit/pcc-<section>.json`
(desktop; e.g. chats `-1114523-…T13-52-17-099Z`, characters `-1115627-…T13-52-25-081Z`, refinery
`-1118854-…T13-53-02-462Z`, databank `-1117782-…T13-52-50-879Z`, home `-1114092-…T13-52-11-182Z`) and
`…-2026-09-04T14-10-…Z/design-audit/pcc-m-<section>.json` (mobile; chats `-1221350-…T14-10-38-642Z`,
characters `-1221698-…T14-10-44-087Z`, home `-1220923-…T14-10-33-094Z`, config `-1222444-…T14-10-55-121Z`).
Logs: `scratchpad/sweep/pcc-<section>.log`, `scratchpad/sweep-mobile/pcc-m-<section>.log`.

Two things the sweep did surface (not this lane's to file — reported for the orchestrator): (a) at
`--mobile` eight of ten sections file `landmark-missing` (no `<main>` on the phone layout) and
`flat-type-hierarchy`; (b) the three rest-regime `selection-idiom` withholds are the standing #1059/#1114
class — a bare `/chats`, `/characters`, `/refinery` audit is NO VERDICT until driven, exactly as
983-984 amendment 1 rules.

## 4. Sequenced fold plan for the forge lane (#1315)

Template = the motion-audit fold (`561ea5ec3`, 1208 §10.6 "Retirement order", §12.3): the engine stays
in its own tool dir behind `index.ts`, the snap arm imports it through that front door
(`ops/arms/motion.ts:18-32` ← `../../../motion-audit/index.ts`), the parser/stage/launch/run/matrix doors
are DELETED, `cli.ts` becomes a hard-refusal door, the root script name stays as the migration door.
1208 §9's "the daemon EXECUTES sibling ops … a front-door violation" rejected an `ops/**` import, not the
`index.ts` import the motion precedent uses; §12.3 (2026-09-03) is the ruling that supersedes it for every
rendered instrument. Import direction after the fold: snap → ui-audit only (today ui-audit → snap through
`ops/stage.ts:15` and `ops/audit-session.ts:7`, both deleted below; `rg 'snap/' tooling/src/ui-audit`
then leaves comments only — `lib/evidence.ts:43`, `census-occlusion.ts:44,91` — and `rg 'ui-audit'
tooling/src/snap --glob '*.ts'` is 0 today, so no cycle exists to break).

### 4.1 Order

1. **Red-first suite** — `tests/tooling/snap/ops/arms/design-audit.suite.int.test.ts` (new): the
   `pnpm snap … --design-audit` twin of `tests/tooling/ui-audit/cli.int.test.ts`'s first two cases
   (planted 1:1 contrast REDs exit 1; the white-on-black twin exits 0 with `census>0`), the §2.1
   paint-layer control (`#layer-text` must be a P1 through the arm — the walker's resolver is what the
   arm runs, so this is the receipt that snap's false clean is gone), the §2.2 accname pair (Alpha/Beta
   NOT duplicates; Menu/Menu IS), the §2.2 selector control (every emitted finding selector resolves to
   exactly one element), the §2.3 obscured control, the retirement door (`pnpm design-audit /x --settle
   300 --fail-on P2` → exit 3, `REPLACEMENT  pnpm snap /x --pause 300 --fail-on P2 --design-audit`,
   no `run slot` line), the census plant (`retiredInstrumentCensus` finds a planted `pnpm design-audit`
   line and finds none in the tracked corpus), a session-call arm (T8's promise: `--session x --viewport
   700x900 --file f` then `--session x --design-audit` measures `viewport-actual=700x900
   environment-fails=0`), a cold-stage NO VERDICT plant, and a failed-reveal-action NO VERDICT plant.
   Its initial red must name the missing `--design-audit` flag.
2. **Arm** — `tooling/src/snap/ops/arms/design-audit.ts` (new; `level: "call"`, `lifecycle.at: "page"`,
   flags `--design-audit` (boolean) + `--fail-on <P0..P3>` (required-value; default P1), `needs: {}`,
   `defaults`, `help`, `result.schema: "snap-arm-design-audit-v1"`); `contract/arm-vocabulary.ts`
   `ARMS` gains `"design-audit"` (position: after `assert`, before `perf` — it reads the settled surface
   and must precede the shutter); `contract/run-facts.ts` `ARM_FACT_DATA_SCHEMAS["design-audit"]` +
   the `snap-arm-design-audit-v1` id; `ops/arms/registry.ts` row; `contract/arms.ts` `ArmArgs` keys
   `designAudit`, `failOn`; `contract/types.ts` `Args`; `contract/help.ts` `armHelp("design-audit")`
   placement (or `remainingArmHelp` prints it); `lib/design-audit-problems.ts` (new,
   `motion-problems.ts` shape). The arm body is `runUiAudit`'s post-launch half re-hosted:
   `navigateAndReveal` is replaced by the page snap already navigated/drove; then
   `resolvePixelBackdrops` → `resolveHoverStates` → `collectAudit` → the gap ladder → printers → fact.
3. **Engine narrowing** — DELETE `tooling/src/ui-audit/{ops/parse.ts, ops/run.ts, ops/stage.ts,
   ops/audit-session.ts, ops/drive.ts, ops/matrix.ts, ops/matrix-contract.ts, lib/stage-request.ts,
   contract/help.ts, contract/defaults.ts, lib/result-rows.ts}` (1,613 lines; `wc -l` this session).
   REWRITE `ui-audit/index.ts` to drop `DESIGN_AUDIT_HELP`, `parseAuditArgs`, `runUiAudit`,
   `runUiAuditMatrix`, `configureAuditStage`, the seven `stage-request` exports, and to ADD the segments
   the snap arm and map need (`WALKER_CORE`, `WALKER_RESOLVE`, `WALKER_MUTATION_CARRIES`, the
   accessible-name segment, `collectAudit`, `resolvePixelBackdrops`, `resolveHoverStates`, the printers,
   `rawSamples`, the `Args`-shaped options type the arm passes). `ui-audit/cli.ts` → the refusal door
   (translate: positional route verbatim; `--settle N` → `--pause N`; `--fail-on P` verbatim; `--wait`
   → error as today; `--matrix` → `--matrix`; every shared-family flag verbatim; append
   `--design-audit`; print `RETIRED … REPLACEMENT …`; `EXIT.misuse`). The 37 `refuseDirectInvocation(…,
   "pnpm design-audit")` strings in the retained engine files change to `"pnpm snap <route> --design-audit"` (the motion precedent kept its old strings under `INTERNAL_ENGINE_PREFIXES` —
   either is census-safe; the new spelling is the honest one). KEEP everything else (14,222 lines: the
   walker, hover pass, pixels, page-validate, report printers, contract shapes, rules, checks,
   population, evidence, surface-state, ramp, css-color, severity, budgets).
4. **Retirement map** — `tooling/src/snap/lib/retired-instruments.ts`: `LEGACY_COMMAND` →
   `/\bpnpm\s+(?:motion-audit|perf-meter|design-audit)\b/u`; `TOKENS` += `"pnpm design-audit"`,
   `"--settle"` (safe: tokens only count on a `LEGACY_COMMAND` line); `INTERNAL_ENGINE_PREFIXES` +=
   `"tooling/src/ui-audit/"`; `MIGRATION_SPECS` += `"docs/design/983-984-ui-audit-population-semantics.md"`
   (its 12 hits are dated receipt blocks inside an active design doc — the same treatment 1208 got).
   `_shared/instrument-argv.ts` `ALIAS_REFUSALS` += `--settle → --pause`; `SESSION_FLAG_HELP` and the
   `:58` comment drop "design-audit". `_shared/instruments.ts` keeps the `"ui-audit"` row (the proof
   markers stay in `tests/tooling/ui-audit/`; motion-audit's row is the precedent).
5. **Corpus sweep of the retiring spelling** (`rg --hidden`, active corpus, this session): 51 files.
   Rewrite (not `MIGRATION_SPECS`): `.claude/skills/side-eye-design-review/SKILL.md` (6 lines; 13 bare
   `design-audit` tokens), `.claude/agents/side-eye.md` (4; 13) — `.codex/agents/side-eye.toml` (4; 13) is
   regenerated by `pnpm agents:sync`, never hand-edited —
   `.claude/skills/side-eye-design-review/reference/impeccable-adoption.md` (3; 9),
   `.claude/skills/snap-driving/SKILL.md` (1; 2), `docs/design/1208-instrument-substrate.md` (2 — but
   it is a MIGRATION_SPEC; leave), `docs/design/state-paint-census.md` (1; `status: archived` but under
   `docs/design/`, so the census would red it — one-line rewrite or move to `docs/history/design/`),
   `docs/design/design-audit-subject-accounting-976.md` (1), `packages/client/src/lib/app-failure-surface.tsx`
   (1, a comment), `tests/ui/variant-arm-matrix.def.ts` (1), `tests/tooling/ui-audit/ops/walker/
   census-region.int.test.ts` (1), `tests/tooling/ui-audit/cli.int.test.ts` (1),
   `tooling/src/snap/ops/session-attach.ts:30` (deleted with the file, §2.4 default). Lanes never edit
   `.claude/` — those 14 lines are the orchestrator's (the side-eye role prompt names the command in its
   contract; the fold changes the role's recipe).
6. **Tests follow their files.** Stay where they are (they test the retained engine; only import lists
   change): `tests/tooling/ui-audit/index.test.ts` (drop `parseAuditArgs`), `lib/{checks-color.int,
   checks-grid, checks-media, collect-families, css-color, evidence, ramp, surface-state}.test.ts`,
   `ops/{hover-validate, page-validate}.test.ts`, `ops/hover-walker.int.test.ts`, `ops/walker/**` (19
   files), `tests/tooling/design-audit-walker.ct.tsx`, `tests/tooling/_ct-stories.tsx`,
   `tests/ui/variant-arm-matrix.*`. REWRITE in place (the motion precedent: the mirror of the refusal
   `cli.ts` keeps its `@instrument-proof` markers and drives `pnpm snap`):
   `tests/tooling/ui-audit/cli.int.test.ts` — every `runCli("ui-audit", ["/x", "--base", …])` becomes
   `runCli("snap", ["/x", "--base", …, "--design-audit"])`; the `RESULT design-audit` / `POPULATION` /
   `census=` / `p1=0` assertions keep their literals because the printers move unchanged; the three
   stage-flag cases (`--ref` refusal, `--base`+`--isolated`, `--dirty`+`--ref`) already have snap
   twins in `tests/tooling/snap/ops/parse.test.ts` and are deleted here. DELETE: `ops/parse.test.ts`
   (grammar pins move to `tests/tooling/snap/ops/parse.test.ts` for the two arm flags),
   `ops/matrix.test.ts`, `ops/matrix-contract.test.ts` (the risk-row ids become one assertion in
   `tests/tooling/snap/ops/matrix.test.ts`), `lib/stage-request.test.ts`,
   `session-attach.suite.int.test.ts` (→ the session-call arm in step 1). `tests/tooling/_shared/
   instrument-argv.test.ts:3` imports `parseAuditArgs` for the five-parser roster control — the roster
   shrinks to four (snap, cpu-profile refusal, motion refusal, record refusal) and the assertion follows.
   `tests/tooling/check-gates.int.test.ts:264` (`__g_ruleproof` fixture path) and gate
   `design-audit-rule-proof.ts` are untouched (the registry and the proof mirror stay put).
7. **Ledgers and gates.** `docs/test-baseline/manifest.json`: deletions rows for the five deleted specs, a
   `testFiles` row for the new suite (hand-edited in the lane's own worktree, `git add` first).
   `docs/reviews/caught-failure-ownership/population.json`: `ops/run.ts`, `ops/stage.ts`, `ops/drive.ts`,
   `ops/hover.ts` (kept) rows re-derive (`pnpm check:ledgers-fresh`). `tooling/src/verify/gates/
   suppressions.baseline.json` rows `tooling/src/ui-audit/ops/run.ts` (noExcessiveCognitiveComplexity ×1)
   and `ops/report.ts` (useNamingConvention ×1): the first is a stale row the moment `run.ts` is deleted —
   remove it in the same commit; the second stays. `tooling-shared-plumbing` arm G: the new arm files
   artifacts through `artifactFile` inside snap's slot — green by construction; the `mustFlag` rows citing
   `tooling/src/ui-audit/ops/run.ts` (`:648`) and `ops/walk.ts` (`:734`) are in-memory fixture paths and
   need no edit. `tooling-front-door` / cruiser `tooling-internal-direction`: the arm imports
   `../../../ui-audit/index.ts` only. knip: `ui-audit/index.ts` exports that lose their last importer red
   the tree — sweep after step 3. `biome.json` path rows naming `ui-audit/ops/parse.ts` or `run.ts` (if
   any) go with the files.
8. **Docs.** `Core-Tooling-Law.md` §2.6 roster row `ui-audit/` → "the design/a11y walker + rule engine
   behind Snap's `--design-audit` arm; `design-audit` is the hard-refusal migration door" (the
   `screen-record/` row's shape); §2.8 accname paragraph gains one sentence recording that the door key and
   the map share one in-page name resolver (the `@orb/ui` refusal is unchanged). 1208: a §10.10 "design-
   audit arm as built" section in the §10.3/§10.6 shape; §4.1's dialect table loses its design-audit
   column. `RULE-AUTHORING.md` (a `kind: law` doc reached through `dangling-refs.ts:262
   LAW_OUTSIDE_DOCS`) keeps its path — do not move the walker dir. Snap help gains the `STAGE DB:` note.
   Every doc edit rides the two-commit attest with a scoped `pnpm check:docs`.
9. **Floor** (`Core-Tooling-Law.md` §6): biome on touched files; BOTH type programs
   (`node scripts/ts7.cjs --noEmit -p tooling/tsconfig.json` and `-p tsconfig.json`) plus per-package
   client tsc (`tests/tooling/design-audit-walker.ct.tsx` and four `tests/client/**/*.ct.tsx` comment-cite
   ui-audit — only the walker CT imports it); `pnpm check:structure`; `pnpm knip`; `pnpm exec depcruise
   packages tooling --config .dependency-cruiser.cjs`; `pnpm test:scoped tests/tooling/ui-audit
   tests/tooling/snap/ops/arms/design-audit.suite.int.test.ts tests/tooling/snap/ops/unified-
   instrument.suite.int.test.ts tests/tooling/snap/ops/arms/registry.test.ts tests/tooling/snap/index.test.ts
   tests/tooling/_shared/instrument-argv.test.ts --maxWorkers=4`; `pnpm ct:scoped
   tests/tooling/design-audit-walker.ct.tsx --workers=2`; `check-gates.int` (the roster gate
   `tooling-instrument-proof` and `design-audit-rule-proof` read the moved tests); the §3.1 path sweep
   with a positive control; then the live receipts — the 11-surface sweep of §3 re-run through `pnpm snap
   /<section> --design-audit` and diffed against this session's artifacts (findings, population rows and
   RESULT pairs byte-identical except `out=`/`index=`; that diff is the byte-stability receipt 1208 §10.3
   demanded of the arms registry).

### 4.2 What the fold does NOT do (recorded so nobody re-derives it)

- It does not move `tooling/src/ui-audit/` under `tooling/src/snap/` — the 14k-line engine stays a
  sibling tool dir behind its `index.ts` (the motion/cpu-profile precedent; `tooling-slot-template` wants
  `cli.ts` + `index.ts` per dir, which the refusal door and the barrel satisfy).
- It does not build a second walker for snap's `--contrast`; snap's per-selector arm evaluates the
  walker's resolver segment for ONE element. Its `ContrastFacts` contract (`contract/contrast.ts`) keeps
  the `radii`/`hasIconInk`/`foregroundOpacity` members the walker does not carry — the arm reads those
  from its own probe as today.
- It does not fix the accname precedence by importing `ariaSnapshot` into the walk (Playwright's
  snapshot is a YAML view, not a per-node association — 1208 §10.9 alternatives). The in-page key gets
  spec order; `--aria` stays the oracle.

## 5. Issue summary (#1322)

Census complete for the eight candidate capabilities plus the refusal map it surfaced. Verdicts with
receipts: contrast MERGE (walker page-side resolver + rule layer survive; snap's per-selector arm,
refusal vocabulary, icon-ink, control-track exemption and FILL arm survive; snap's in-page
`contrast-script.ts` resolver retires — its stated GENERIC GAP was reproduced as a 21.00:1 false clean
over a fixed white layer that design-audit judged 1.00:1 P1); element resolution + accname MERGE (snap
map's Node-proven unique locator survives; the walker's `describe()` emitted a selector matching 2
elements; BOTH hand-rolled name resolvers are spec-inverted — a planted labelledby/aria-label pair
produced a false `duplicate-action-door` and hid a real one; `--aria` is the correct oracle);
visibility/occlusion/hit-testing ui-audit SURVIVES (obscured-target fired P1 where snap map lists nothing
and snap contrast only refuses), with the two byte-similar `occluderOf` and three visibility predicates
merging into the walker core; stage/attach/session snap SURVIVES and #1321 dissolves (the arm is a
session call under `sessionCallTarget` — route navigates the daemon's page, no route audits the live
page; the owner-page attach path retires with `audit-session.ts`); matrix, drive and report/artifact
snap SURVIVES (ui-audit's are a projection, a subset and a hand JSON respectively — judged by reading);
population accounting ui-audit SURVIVES and maps onto arm state `withheld` + exit 2. Finding 10 is
refuted: 20 live runs (10 desktop, 10 `--mobile`) show `extentTruncated=0`/`no-probe-frame=0` on every
surface; the three exit-2 surfaces (chats, characters, refinery) are the ruled `selection-idiom`
rest-regime withholds. §4 gives the forge lane a nine-step order (red-first suite → arm → engine
narrowing (delete 1,613 lines, keep 14,222) → retirement map → 51-file spelling sweep with the 14
`.claude/` lines routed to the orchestrator → test-follow map → ledgers/gates → docs → floor + live
byte-stability diff). Severity ceiling of what was found: P2 (two instrument false-verdict classes,
both already ruled to be fixed in the same era as found). Report:
`docs/reviews/stickler/2026-09-04-snap-ui-audit-capability-census.md`.

## Appendix A — verification log

- Environment: `:5173` 200; vite pid 3390773 (01:40) vs ten post-01:40 main commits — premise held by
  the served-app probes (20 audits, `nav=OK environment-fails=0 dom-added=0 dom-detached=0`, 0
  `script-error`). Load 8.3-10.6/24, factor 1.00.
- Citation census (`scratchpad/pcc-citations.sh`, literal paths; then `rg --hidden` this session):
  `pnpm design-audit` in the active corpus = 51 files (37 of them the walker/engine
  `refuseDirectInvocation` strings). Bare `design-audit` in hidden dirs: `.codex/agents/side-eye.toml` 13,
  `.claude/skills/side-eye-design-review/SKILL.md` 13, `.claude/agents/side-eye.md` 13,
  `…/reference/impeccable-adoption.md` 9, `.claude/skills/snap-driving/SKILL.md` 2. `--fail-on|--settle`
  in the active corpus: 22 files (led by `tests/tooling/ui-audit/cli.int.test.ts` 19, `ops/parse.ts` 6,
  1208 4).
- Outside importers of `tooling/src/ui-audit` (import lines, not comments): `tests/tooling/
  design-audit-walker.ct.tsx:15-16` (`COLLECT_SAMPLES_JS`, `collectFindings`, types),
  `tests/tooling/_shared/instrument-argv.test.ts:3` (`parseAuditArgs`), `tests/ui/variant-arm-matrix.def.ts:79`
  (`DesignAuditRuleId` via `@orb/tooling/ui-audit`), gate `design-audit-rule-proof.ts` (reads
  `contract/rules.ts` by path), `dangling-refs.ts:262` (`RULE-AUTHORING.md` as law). Everything else is a
  comment cite.
- Controls: 11 runs (§1.2), logs under `scratchpad/ctl-logs/`, artifacts under `<wt>/reports/runs/
  {ui-audit,snap}/agent-a12b1e6f81d56f684-<pid>-2026-09-04T14-08-…Z/`.
- Sweeps: 20 runs (§3).
- Negative claims and their receipts: `Core-Laws-and-Precedents.md` has no ui-audit/design-audit/snap
  row (grep over the one file, 0 hits, file present); `rg 'ui-audit' tooling/src/snap --glob '*.ts'` = 0
  imports (the vendored devtools assets excluded); snap `contract/help.ts` has no STAGE DB note
  (`rg -i 'STAGE DB|copies the dev db|cold'` = 0 hits on 1 file).

## Appendix B — unconfirmed, low priority

- The walker's `paintLayerOver` fixed-layer rule (`resolve.ts:209-212`) may pixel-sample every text
  on a surface whose shell art layer enters the census (a seeded `backgroundImageKind`); `px-backdrops=0`
  on all 20 rest-regime runs so it was not observed live. Cost, not correctness.
- `census-region.ts:131` `relLum` and `_shared/wcag.ts` `relativeLuminance` are two spellings of one
  formula on two sides of the page boundary (necessarily); a drift between them would be a defect and
  nothing pins their equality — one pure test that feeds both the same sRGB triples would close it.

## Appendix C — proposed memory lessons (the orchestrator writes; this lane does not)

- `- [accname precedence inverted twice](accname-key-aria-label-before-labelledby-in-both-homes.md) — snap map + walker doorNameKey read aria-label before aria-labelledby; --aria is the oracle`
  Body: rule — never trust a hand-rolled in-page accessible-name key against `aria-labelledby`; both
  `tooling/src/snap/lib/map-browser.ts:51-55` and `tooling/src/ui-audit/ops/walker/census-interactive.ts:334`
  put `aria-label` first (accname 1.2 2B before 2C is the reverse). **Why:** a planted pair produced a
  false `duplicate-action-door` and hid a real one (#1322 census, 2026-09-04). **How to apply:** when a
  door/name finding looks wrong, run `pnpm snap … --aria` on the same page — Playwright's `ariaSnapshot`
  is the only spec-correct name source in the fleet; a fix goes into ONE in-page key with spec order.
- `- [snap css-resolve is blind to paint layers](snap-contrast-css-resolve-fixed-layer-false-clean.md) — a fixed contentless painted layer under text reads 21:1 PASS; design-audit pixel-settles it`
  Body: `tooling/src/snap/lib/contrast-script.ts:133-135` names the gap itself; reproduced 2026-09-04
  (`#layer-text` 21.00:1 PASS vs 1.00:1 with `--contrast-pixel` and vs design-audit P1). **How to
  apply:** any snap `--contrast` verdict on a surface with a fixed/absolute painted layer (wallpaper,
  scrim, glass pane) owes `--contrast-pixel` or a design-audit receipt until #1315 lands the walker's
  resolver in the arm.
- `- [walker describe() is not unique past six steps](walker-describe-six-step-path-not-unique.md) — an unanchored finding selector can match N elements; snap map proves uniqueness in Node`
  Body: `tooling/src/ui-audit/ops/walker/core.ts:265-286`; measured 2026-09-04 (two identical seven-deep
  subtrees → one selector, `querySelectorAll().length === 2`). **How to apply:** before forwarding a
  design-audit selector that carries no `#id`/`[data-testid]`/`[data-slot]` anchor, count its matches
  with `pnpm snap … --eval`; #1315 owes the Node post-validation.
- `- [session call target answers #1321](design-audit-arm-is-a-session-call-not-an-attach.md) — a folded page arm inherits sessionCallTarget (route→daemon page, none→live page); the owner-page attach path dies with audit-session.ts`
  Body: `tooling/src/snap/ops/session-daemon-call.ts:102-107`, `lib/session-plan.ts:308-312`. **How to
  apply:** when a sibling instrument becomes an arm, its "which page does `--session` drive" question is
  already answered by the daemon; do not port the attach door.
