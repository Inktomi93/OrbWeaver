---
kind: design
status: complete
updated: 2026-08-31
---

# Motion-audit mobile environment proof (#977)

Status: implementation design, 2026-08-31. This is the build contract for #977. It adds one explicit
mobile arm to motion-audit; it does not add an appearance matrix or a copied matrix loop. The later #953
program owns the one shared `_shared` matrix generator and each tool's derived axes.

## Premise and current rails

Motion-audit currently accepts only a raw viewport. Its `Args` has `viewport` but no device identity
(`tooling/src/motion-audit/contract/types.ts:19-20`), the parser owns only `--viewport`
(`tooling/src/motion-audit/ops/parse.ts:55-58`), and the runner launches the shared browser with that
viewport (`tooling/src/motion-audit/ops/run.ts:58-64`). A narrow viewport does not establish touch,
`pointer: coarse`, a mobile user agent, device scale factor, or Playwright's `isMobile` behavior.

The required mechanism already exists on the correct shared rail. `_shared/browser.ts` accepts a
Playwright device descriptor name (`tooling/src/_shared/browser.ts:51-54`), resolves it from Playwright's
registry (`tooling/src/_shared/browser.ts:299-307`), and spreads the full descriptor into every owned or
persistent context (`tooling/src/_shared/browser.ts:220-226`, `tooling/src/_shared/browser.ts:320-340`).
Snap already maps `--mobile` to `iPhone 14 Pro Max` and documents that this is a full descriptor rather
than a viewport alias (`tooling/src/snap/ops/flags-support.ts:14-18`); design-audit independently repeats
the same literal (`tooling/src/ui-audit/ops/parse.ts:28-31`). The architectural move is therefore one
shared constant plus observable launch evidence on the existing browser session, not a second launcher.

The prior instrumentation lesson is binding here: a nonzero denominator and a planted control are what
separate a clean measurement from an instrument that never measured. This design follows
`rollout_summaries/2026-08-22T00-31-31-CdVc-orbweaver_tooling_plan_and_frame_drop_proof_audit.md` and the
`MEMORY.md` instrumentation-proof index: requested configuration is not actual runtime evidence, and a
zero or echoed value must not be allowed to certify itself.

## Chosen architecture

### One shared device identity

Add `_shared/browser-environment.ts` as the owner of:

- `MOBILE_DEVICE = "iPhone 14 Pro Max"`, derived once and imported by Snap, design-audit, and
  motion-audit. Snap's flag and matrix consumers import the shared owner directly; its support module
  carries no duplicate value or barrel re-export.
- the resolved launch contract recorded by `_shared/browser.ts`: requested viewport/device plus the
  descriptor fields actually passed to Playwright (viewport, screen, user agent, device scale factor,
  touch, and mobile mode);
- a page-runtime observation read after navigation: `page.viewportSize()`, `innerWidth/innerHeight`,
  `screen.width/screen.height`, `navigator.userAgent`, `devicePixelRatio`, `navigator.maxTouchPoints`, and
  all four relevant media-query facts (`pointer: coarse`, `pointer: fine`, `hover: hover`, `hover: none`);
- an exact validator that compares the runtime observation with the resolved launch contract. It returns
  named mismatches; it never echoes requested values into the actual side and never silently defaults a
  missing observation.

`ProbeSession` carries the resolved launch contract because the shared launcher is the only place that
knows what was truly passed to Playwright. A shared `readBrowserEnvironment(session.page, contract)`
function derives runtime evidence through the live page and returns requested, applied, actual, and
mismatch fields. This keeps context construction owned by `_shared/browser.ts` while making its result
auditable by every verdict tool.

Device identity has two levels because a web page cannot read Playwright's registry key. `requestedDevice`
and `appliedDevice` are launcher facts. `actualDevice` is the requested name only when the observable
fingerprint matches every descriptor-owned field; it is `desktop` only for a matching raw desktop
contract, otherwise `unmatched`. This avoids claiming that a request string proves an actual device.

### Motion CLI and verdict

Motion-audit gains `device: string | null` in `Args`, with `--mobile` and `--desktop` handlers. The
viewport/device slot uses the existing Snap/design-audit last-wins semantics:

- `--mobile` selects the canonical full descriptor;
- `--desktop` restores the default viewport and clears the descriptor;
- `--viewport WxH` sets that viewport and clears the descriptor;
- repetitions are accepted and resolved in argv order; missing values, malformed viewports, and unknown
  flags keep the existing strict misuse exit.

`runMotionAudit` passes `device` to the shared launcher, reads environment evidence after readiness and
before the trace window, and adds it to `AuditData`. The order intentionally preserves reach, trace,
reduced-motion, CPU/network, appearance/theme, checkpoint, and cleanup semantics. Environment collection
is outside the measured product-interaction window.

`motionEvidenceGaps` adds one fail-loud environment gap when any mismatch exists. The human report prints
requested, applied, and actual device/viewport, pointer/hover, touch, DPR, mobile mode, screen, user agent,
and every mismatch. The machine verdict pairs carry the same request/actual identity. Exit 2 means the
instrument did not establish the requested environment; it is never converted to a performance failure or
a clean motion result.

### Both-direction anti-fake proof

The shared-browser integration test launches two real Chromium contexts through the production launcher:

1. desktop must observe the requested viewport, fine pointer, hover capability, zero touch points, DPR 1,
   and desktop UA;
2. the canonical descriptor must observe its descriptor viewport/screen/UA/DPR/mobile/touch fields plus
   coarse pointer and no hover.

These opposite observations prove that the helper did not hard-code one polarity. A motion CLI control
then overrides an observable after the real resolver has created the mobile context (same requested
device, fake fine pointer or false touch) and must exit 2 with the exact mismatch. Its untouched twin must
pass. This makes a viewport-only fake fail even when its width and height match the descriptor.

## Rejected alternatives

### Treat 430x740 as mobile

Rejected. It preserves the defect: viewport width alone leaves a desktop UA, fine pointer, hover, DPR,
touch, and `isMobile` behavior. It cannot exercise coarse-pointer disclosure or certify the mobile arm.

### Record only requested descriptor data

Rejected. That is provenance without execution evidence. A dropped descriptor spread, later context
override, or page-visible mismatch would still print clean. Requested/applied/actual are separate facts.

### Implement environment evidence inside motion-audit

Rejected. Shared-browser owns descriptor resolution and context creation. A motion-local reader would
duplicate the trust boundary and leave Snap/design-audit unable to use the same proof.

### Add a mobile/reduced/theme matrix loop

Rejected. #977 is one explicit arm and preserves the caller's existing motion/reduced/theme choices. #953
owns the later one `_shared` generator; introducing a local Cartesian loop here would create the exact
copied matrix the issue forbids.

### Generalize arbitrary named device CLI input

Rejected. #977 asks for an explicit mobile/desktop arm, not a user-facing Playwright registry browser.
The shared launch contract remains capable of a named descriptor because existing callers already use it,
but motion's public CLI adds no speculative `--device <name>` surface.

## Coupled-site inventory

| Site | Required change |
| - | - |
| `tooling/src/_shared/browser-environment.ts` | canonical device constant, contract/evidence types, runtime reader, exact mismatch list |
| `tooling/src/_shared/browser.ts` | expose the resolved contract on `ProbeSession`; preserve the single full-descriptor context spread |
| `tooling/src/snap/ops/flags-support.ts`, `flags-handlers.ts`, `matrix.ts` | retire the duplicate constant and have both Snap consumers import the shared owner directly; behavior and matrix membership stay unchanged |
| `tooling/src/ui-audit/ops/parse.ts` | consume the canonical constant; no output/argv behavior change |
| `tooling/src/motion-audit/contract/types.ts` | `Args.device` and required `AuditData.environment` |
| `tooling/src/motion-audit/ops/parse.ts` | ordered `--mobile`/`--desktop`/`--viewport` handlers and help |
| `tooling/src/motion-audit/ops/run.ts` | pass device, read environment before trace, preserve cleanup and trace ordering |
| `tooling/src/motion-audit/ops/trace.ts` | keep measured-window output environment-agnostic; the orchestrator adds the pre-trace evidence afterward |
| `tooling/src/motion-audit/lib/evidence.ts` | mismatch → instrument gap |
| `tooling/src/motion-audit/ops/report.ts` | human and machine requested/applied/actual evidence |
| `tooling/src/motion-audit/index.ts` | one programmatic evidence/type door if tests need it |
| `tests/tooling/_shared/browser.int.test.ts` | real desktop/mobile opposite-polarity assertions and viewport-only rejection |
| `tests/tooling/motion-audit/index.test.ts` | parser ordering/misuse and environment-gap unit controls |
| `tests/tooling/motion-audit/cli.int.test.ts` | real mobile normal/reduced nonzero windows, mismatch plant, untouched twin, cleanup |

No new matrix module, no new launcher, no browser-context duplication, and no ratchet or suppression change.

## Red-first and graduation plan

1. Add parser and evidence tests first. Against pre-implementation source they must fail because motion has
   no device field/flags/environment evidence.
2. Add the real shared-browser desktop/mobile test. The mobile expectation must fail until the resolved
   contract and runtime reader exist; assert actual coarse/fine, hover/no-hover, touch, DPR, viewport,
   screen, UA polarity, and device identity.
3. Add motion CLI fixtures with a compositor-only animation and real `__orb` snapshot. Both normal and
   reduced-motion mobile runs must have nonzero trace events, raw frames, measured window, and snapshot
   evidence. Reduced motion changes only the media preference, not device proof.
4. Plant a same-request runtime mismatch after descriptor resolution; it must exit 2. Run the identical
   non-mutating twin and require exit 0. This proves the mismatch fence bites and is not count-only.
5. Run the full focused motion unit and CLI suites plus shared browser tests cold. Run scoped Biome,
   ESLint, package/graph types, structure, Knip, docs format/catalog, and a repo-wide literal sweep for the
   canonical device name across both `.ts` and `.tsx` test/source populations.
6. Run one live app `pnpm motion-audit --mobile` trace and report requested/applied/actual descriptor,
   viewport, pointer/hover, touch, DPR, mobile mode, nonzero snapshot/frame/window populations, verdict,
   and cleanup. A quiet live surface may legitimately have no frames; if so, drive the existing animated
   surface or widen the window rather than weakening the evidence rule.

## Implementation receipt

The two red-first probes failed against the pre-change source for the intended missing mechanisms:

- `pnpm exec vitest run tests/tooling/motion-audit/index.test.ts -t "full shared device descriptor"`
  failed 1 test (27 skipped): motion-audit returned `unknown flag --mobile`;
- `pnpm exec vitest run tests/tooling/_shared/browser.int.test.ts -t "full mobile descriptor"` failed
  1 test (29 skipped): the production session exposed no `environmentContract`.

After implementation, the cold focused suites passed: motion unit 29/29, motion CLI integration 12/12,
shared-browser integration 30/30, the literal-coupled design-audit unit suite 109/109, and the
literal-coupled Snap unit suite 35/35. The normal/reduced mobile CLI twin kept one motion subject, a
1,000ms window, nonzero trace frames, and exact coarse/no-hover/touch/DPR3 identity in both arms. The
same-request viewport-matched counterfeit exited 2 with named DPR, touch, pointer, and hover mismatches;
its untouched twin exited 0.

The live app proof used the measured collapsible interaction. At a 1,000ms window it exited 0 with 25
raw and budgeted frames and exact requested/applied/runtime `iPhone 14 Pro Max` identity: viewport and
inner viewport 430x740, screen 430x932, coarse pointer, no hover, one touch point, DPR 3, mobile mode, and
zero environment mismatches. A 100ms twin observed two active subjects and seven frames, then honestly
failed the motion budget on the stock collapsible height animation while retaining zero LoAF and zero
environment mismatches. That is the known accepted #824 product behavior, not an instrument failure or
physical-device jank finding.

Static graduation passed for the exact 16 TypeScript paths: Biome, ESLint, graph types, 27 type-test
files/95 tests, Knip, and the scoped structure walk. Documentation format/check passed 107 files. The
source/test literal sweep covered 5,035 tracked `.ts` files and 1,326 tracked `.tsx` files; the canonical
device value has one production definition and its remaining spellings are documentation, examples, and
assertions rather than competing owners.

## Ruled boundary

No owner-sacred prose, push, security surface, or new architecture fork is touched. The selected descriptor
is the already-shipped shared mobile choice. If current Playwright/Chromium runtime evidence contradicts
that descriptor rather than the implementation, the lane stops and reports the contradiction; it does not
rewrite the expected environment to match a failing run.
