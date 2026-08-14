## Lane identity

- Lane: `probes-runtime`
- Semantic scope: remaining runtime, browser, trace, SDK, and SillyTavern golden probe tooling.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00`.
- Working-tree basis: assignment hashes matched at receipt generation; no assigned dirty path was observed in the lane snapshot.
- Assigned files read: 53 / 53 (44 owned, 9 shared).
- Assigned lines read: 19,719 / 19,719.
- Assigned bytes read: 1,088,818 / 1,088,818.
- Dirty assigned paths: 0.
- Exclusions: live/browser/provider/SDK/SillyTavern execution, as recorded in `commands.md`.

## Read receipt

`read-receipt.tsv` contains the complete 53-path assignment, with current line, byte, and SHA-256 values; all match `assignment.txt`.

## Architecture observed

The probe toolkit centralizes browser argv parsing in `scripts/probes/_kit/flags.ts:1-78`, browser/process support in the sibling `_kit` files, and uses individual executable probes as composition roots. The golden rig locates its portable, gitignored corpus through `scripts/probes/st-goldens/rig-paths.ts:1-23`; its demo shells rebuild fixtures, capture SillyTavern payloads, then invoke the Orbweaver capture/comparison arm (`run-demo-complex.sh:91-101`, `run-demo-goldens.sh:57-67`). `tests/tooling/snap-flags.test.ts:1-48` provides focused behavioral coverage only for `splitPageSuffix` and `parseGotoTarget`.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Browser probe argument helpers | 2 | 3 | 2 | 0 | 3 | high | `scripts/probes/_kit/flags.ts:14-78`; `tests/tooling/snap-flags.test.ts:11-47`; direct positive control in `commands.md` |
| SillyTavern golden demo rig | 3 | 3 | 1 | 0 | 1 | high | `scripts/probes/st-goldens/run-demo-complex.sh:43-101`; `scripts/probes/st-goldens/run-demo-goldens.sh:57-67`; `scripts/probes/st-goldens/generate-goldens.ts:92-103` |
| Runtime/browser/SDK probes as a group | 2 | 2 | 0 | 0 | 1 | medium | assigned executable files; excluded execution inventory in `commands.md` |

## Findings

### PROBES-RUNTIME-01 — `parseViewport` accepts negative dimensions despite its contract

- Severity: P3
- Class: behavior-defect
- Confidence: high — a focused positive control reproduced both negative cases; adding `width > 0 && height > 0` would settle the defect.
- Evidence rung: R4
- Scope denominator: 1 documented pure parser (`scripts/probes/_kit/flags.ts`); 0 tests cover it in the focused importer test.
- Receipts: `scripts/probes/_kit/flags.ts:35-42` promises null for non-positive dimensions but checks truthiness, which rejects zero but accepts negative numbers. The control logged in `commands.md` returned `{width:-1,height:100}` for `-1x100` and `{width:100,height:-1}` for `100x-1`. `tests/tooling/snap-flags.test.ts:6` imports only `parseGotoTarget` and `splitPageSuffix`; its assertions at `:11-47` contain no viewport case.
- Established fact: a malformed `--viewport` with either negative dimension is admitted to browser-probe callers.
- User or system impact: callers that rely on the parser's stated non-positive rejection can pass invalid viewport dimensions to the browser layer, producing a late browser error or an ill-defined probe run rather than a clear argument rejection.
- What remains unverified: each individual consumer's error behavior for a negative viewport was not run because browser probes are environment-backed.
- Suggested next check or fix: require each dimension to be finite and strictly greater than zero, then add positive, zero, negative, and malformed cases to `tests/tooling/snap-flags.test.ts`.

### PROBES-RUNTIME-02 — Golden demo scripts mask capture failures and continue to comparison

- Severity: P2
- Class: operability-gap
- Confidence: high — both scripts combine `set -e` with `|| true` on the only SillyTavern capture command.
- Evidence rung: R3
- Scope denominator: 2 checked-in golden demo shell scripts; both use the same suppression construct.
- Receipts: `scripts/probes/st-goldens/run-demo-complex.sh:46,95` and `scripts/probes/st-goldens/run-demo-goldens.sh:61` discard every `generate-goldens.ts` nonzero. Both then run the Orbweaver capture/comparison arm (`run-demo-complex.sh:98-101`; `run-demo-goldens.sh:66-67`). `generate-goldens.ts:97-100` intentionally exits 1 for a missing fixture, establishing that nonzero is a meaningful failure signal.
- Established fact: a missing fixture or failed ST capture does not stop either demo shell, so later comparison may consume stale or incomplete outputs.
- User or system impact: the golden parity evidence can look complete after a failed reference capture; the fixture rebuild loop does not prove each output was freshly produced.
- What remains unverified: the live ST failure path was not induced because the runtime/corpus is gitignored and environment-backed.
- Suggested next check or fix: preserve failure exit status and validate an output matching each requested fixture exists and is fresh before Orbweaver capture/comparison.

## Proven strengths

- `splitPageSuffix` and `parseGotoTarget` have meaningful focused assertions for standard and malformed suffixes plus all documented navigation target forms (`tests/tooling/snap-flags.test.ts:11-47`, R4).
- The direct control confirmed the parser's normal and zero/missing-dimension branches; it exposed the negative-dimension defect rather than being used as a blanket clean claim (`commands.md`, R4).

## Declared versus completed

The argument helper declares five pure parses. Two have a resolved test import and assertion surface (`scripts/probes/_kit/flags.ts:14-78`; `tests/tooling/snap-flags.test.ts:6-47`, R4), while `parseViewport` has a current direct behavioral control that reproduces its boundary defect (R4). The golden rig declares a capture-to-compare workflow but static wiring alone cannot prove a current fresh ST/Orb capture (`run-demo-complex.sh:43-101`, R3).

## Tests and gates

The safe local scripts ran successfully, but they are heuristic inventory probes and their candidate output is not promoted to defects. `snap-flags.test.ts` has meaningful assertions but omits `parseViewport`, leaving its stated input boundary without a regression test. No repository enforcement gate was identified for probe CLI argument contracts or stale golden output detection. The local provider/browser/runtime probes were intentionally not executed; see `commands.md`.

## Cross-lane edges

- The UI/client tooling lane may own the browser consumers of `parseViewport`; reconcile whether they reject negative dimensions downstream before assessing user-visible impact.
- Any test/gate lane should reconcile the absence of a `parseViewport` test and the golden-rig failure masking against broader tooling test policy.

## Tool receipts

`pnpm ast` was run bare, then the repository-native `importers` lens was used for `generate-goldens.ts`, `_kit/flags.ts`, and `_kit/browser.ts`; static import scope excludes executable shell/CLI invocation. Literal checks were not used to make a negative code claim. Safe read-only probe commands and their outputs, scope, and environment exclusions are in `commands.md`. No tool failure was used as absence evidence.

## Lane verdict

The static probe toolkit contains useful focused parser tests and safe read-only inspection commands. One documented parser boundary is objectively wrong for negative dimensions (R4). The two checked-in golden demo scripts also conceal reference-capture failure and can continue with stale evidence (R3); live reproduction is blocked by their environment-backed rig. No claim is made that browser, provider, SDK, or ST runtime probes currently pass.
