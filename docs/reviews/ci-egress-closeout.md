# Egress GC control closeout

The correction changes the GC proof, not the production egress implementation or its timeout. The caller-abort case proves collection occurred, retains the live normalized Request, and proves its release after abort.

## Cause and evidence

The failed CI run `40242985011` reports a timeout in the GC-enabled caller-abort case at 20,819 ms. Its non-GC case passes at 68 ms. The CI log does not contain phase measurements.

The old GC branch performs twelve whole-heap `queryObjects(Request)` calls and discards every result. It has no observed collection target or stopping condition. That work depends on the worker's entire heap, not the response under test. It therefore adds substantial setup cost without establishing that the intended GC scenario occurred.

A local unmodified run passes at 8,584 ms. Temporary phase instrumentation measures 8,932 ms in the heap-walk loop and another 59 ms through abort, reader rejection and socket closure. These samples establish the apparatus cost locally, not the exact CI phase split or a timing guarantee. The CI timeout is not classified as a flake.

`packages/server/src/infra/network/egress.ts` retains the normalized Request in its request registry until the owned body settles. This preserves its dependent signal through GC. `response-body.ts` propagates the abort reason to the locked consumer and joins physical cancellation. No product defect was reproduced with this ownership intact.

## Correction

`tests/server/infra/network/scoped-endpoint-admission.test.ts` observes the actual normalized Request through a WeakRef while forwarding execution to `systemFetch`. The listener, DNS, connector, request and response remain native.

The GC-enabled branch creates an unowned Request witness. Collection must clear that witness before the live-request retention assertion. The shared collection helper yields between jobs, performs a full collection, and stops when the specific WeakRef clears. Its attempt ceiling remains bounded.

The case checks the live Request in both GC and non-GC branches. After abort, it still requires:

- The pending locked reader rejects with the exact caller AbortSignal reason.
- The physical response closes without finishing.
- The physical socket closes.
- The normalized Request becomes collectible while the egress context remains live.

The EOF, error and cancel ownership cases use the same collection helper. They retain their pre-terminal retention check, actual body outcomes, physical closure and successful subsequent request. The 20,000 ms base timeout remains unchanged. No admission, allowlist or production source change remains in the diff.

## Failing controls

| Temporary change | Required failure | Result | Evidence |
| - | - | - | - |
| Replace the production retained Request with `undefined` in the registry. | The live normalized Request disappears after witnessed GC. | Exit 1 at the retention assertion; 935 ms. | `/tmp/ci-egress-retention-red.log` |
| Omit collection from the helper. | The unowned witness remains alive, so the GC scenario is not established. | Exit 1 at the witness assertion; 37 ms. | `/tmp/ci-egress-gc-control-red.log` |

Both controls use the real physical listener and request. Both temporary changes are removed. The ordinary implementation passes the strengthened isolated case at 1,630 ms before those controls.

## Verification

Base: `36f94b6835dfc7de8445d70c9d0ca1ae7973c669`, branch `closeout/ci-egress`. The previous qualification branch remains preserved.

| Command | Result | Evidence |
| - | - | - |
| `pnpm test tests/server/infra/network/scoped-endpoint-admission.test.ts -t 'caller abort after Request GC=true'` | Unmodified local case passes. The phase-instrumented run also passes. | `/tmp/ci-egress-baseline.log`, `/tmp/ci-egress-phases.log` |
| `pnpm test tests/server/infra/network/scoped-endpoint-admission.test.ts -t 'caller abort after forced GC=true'` | Strengthened isolated control passes before the deliberate failing controls. | `/tmp/ci-egress-observable-control.log` |
| `pnpm test tests/server/infra/network/scoped-endpoint-admission.test.ts tests/server/infra/network/response-body.test.ts tests/server/infra/network/egress-public-policy.int.test.ts tests/server/infra/network/endpoint-connector-port.test.ts tests/server/infra/network/endpoint-port-narrowing.test.ts` | Exit 0; 39 tests pass. | `/tmp/ci-egress-floor.log` |
| `pnpm test tests/server/infra/network/scoped-endpoint-admission.test.ts` | Exit 0; 10 tests pass after moving the live-request assertion outside the conditional. GC-enabled abort takes 1,729 ms. Unchanged coupled cases reuse the preceding run. | `/tmp/ci-egress-final-scoped.log` |
| `pnpm exec biome check tests/server/infra/network/scoped-endpoint-admission.test.ts --diagnostic-level=error` | Exit 0. | Native command output. |
| `pnpm lint:eslint tests/server/infra/network/scoped-endpoint-admission.test.ts` | Exit 0. | Native command output. |
| `pnpm typecheck tsconfig.json` | Exit 0, including the server router declaration dependency. | `/tmp/ci-egress-typecheck.log` |
| `pnpm exec depcruise tests/server/infra/network/scoped-endpoint-admission.test.ts --config .dependency-cruiser.ts --output-type err-long` | Exit 0; no dependency violations across 3051 modules. | Native command output. |
| `pnpm doc format --write docs/reviews/ci-egress-closeout.md` and `pnpm doc format --check docs/reviews/ci-egress-closeout.md` | Exit 0. | Native command output. |

The first Biome check found a conditional assertion. Moving it outside the GC branch fixes that finding and extends the retention assertion to the non-GC case. No suppression is added.

## Limits and security assumptions

The tests assume the platform's full-GC behavior and native fetch implementation. Explicit weak-reference controls verify collection and retention instead of inferring them from global object counts. The loopback listener is admitted only at its actual ephemeral port.

This correction does not change authentication, authorization, cryptography, endpoint admission or public-URL SSRF policy. The coupled security tests retain refusal and admitted-path controls. Full CI rerun and independent review belong to main; the local runs do not establish a green whole-application CI result.
