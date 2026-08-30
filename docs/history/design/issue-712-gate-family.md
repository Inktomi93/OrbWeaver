---
kind: design
status: archived
updated: 2026-08-30
---

# Issue 712 — honest enforcement for the review finding families

## Verdict

Build three new active structural gates, extend the existing tenancy write family, and promote the review mirror into a manual milestone tool. E5, E6, and E7 stay review-tier because their safe forms require semantic/dataflow reasoning; their named candidates and the E7 direct-control census become generated review evidence instead of generic AST accusations.

The design follows the gate self-proof contract (`tooling/src/verify/gates/GATE-AUTHORING.md` §1/§3/§5) and the durable-tool five-slot contract (`docs/design/tooling-package.md` §2.5). The prior tooling lesson consulted was `rollout_summaries/2026-08-21T15-21-19-gDAF-orbweaver_verification_tooling_and_instrumentation_program.md`: missing/empty evidence is an instrument error, never a clean zero.

## Evidence and chosen boundaries

| item | disposition | structural boundary |
| - | - | - |
| E1 | extend active gates | `owner-scoped-writes` and `owner-scoped-upserts` already derive class-(a) tables and own the write/upsert distinction (`tooling/src/verify/gates/owner-scoped-writes.ts:65`, `owner-scoped-upserts.ts:83`). Resolve aliased table bindings through the TypeScript symbol rather than minting an auth-router gate. Reads and membership/control-flow checks remain outside this change. |
| E2 | new active gate | The safe world-info regex execution boundary is the `testRegexKey: createRegexTest()` composition property (`packages/server/src/entry/compose/chat.ts:854`), backed by the VM watchdog (`packages/server/src/kit/regex/index.ts:43`). Gate that property and its canonical import only. Other dynamic regexes are unrelated and pass. |
| E3 | new active gate | Scan only `packages/server/src/entry/http/**` registrations for POST/PUT/PATCH/DELETE. A route that reads `c.req` body data must carry `bodyLimit`/`bodyCap`, or the exact capped-stream `stageCapped(..., *_MAX_*BYTES)` arm. GET and zero-body mutations pass. Add middleware caps to card-frame JSON and OIDC backchannel form bodies; keep bundle import streaming because Hono's body-limit buffers chunked bodies. |
| E4 | new active gate | In `infra/plugin-host/membrane.ts`, every guest-controlled `ctx.dump` must occur inside one canonical helper whose guard call precedes the dump. Route the existing UI-spec and async-arg guards plus the other guest metadata dumps through that helper. Other plugin-host files are not part of the guest-input membrane relation. |
| E5 | review-tier inventory | Name the five confirmed invariant candidates: persona last-delete, preset fork convergence, refinery schema-name uniqueness, world-info primary-book convergence, and tag prune recheck. No marker convention: the code does not expose a total enumerable set of “invariants,” so a completeness claim would be false. |
| E6 | review-tier inventory | Name the three confirmed atomicity candidates: digest+speaker replacement, stats rebuild versus delta, and WAL-complete backup. Do not gate “two writes” or “read then write”; those shapes include legitimate independent effects and cannot prove transaction semantics. |
| E7 | review-tier generated census | Census only direct/one-hop `Button`/`Switch` handlers whose own function body calls `mutate`/`mutateAsync`. Resolve a disabled expression through local variable initializers to classify direct/derived pending guards; report exact component/file/line receipts for unresolved and missing guards. The implemented own-function census scans 588 TSX files and finds 67 controls: 27 direct-pending, 6 derived-pending, 27 with mechanically-proven no `disabled`, and 7 with another guard expression (nested-callback mutations are excluded). Evidence explicitly reports those latter 34 controls as the review residual; it is a migration/review inventory, never an all-clear verdict. Activation is owned by #725 migration waves, not a baseline or blanket marker. |
| E8 | manual milestone tool | Promote `scripts/review-mirror.mjs` to `tooling/src/review-mirror/`, add the root `pnpm review:mirror` front door, generate a fresh mirror plus structured E5/E6/E7 evidence, and fail with tool-error semantics when generation/census evidence is missing or empty. D62 forbids standing CI, so no cron/workflow is added; the tool is run at milestone boundaries. |

## Rejected alternatives

- A new “every authed mutation” gate was rejected because authentication is a transport/control-flow property while the live owner-write/upsert gates already enumerate the stronger table-write proxy. Duplicating the family would create disagreeing exemption vocabularies.
- A repository-wide dynamic-RegExp ban was rejected because literal and bounded internal regex construction is common and safe; only the user-authored world-info execution seam has the canonical VM watchdog contract.
- Requiring body middleware on every mutating route was rejected because logout is intentionally bodyless and bundle import enforces an incremental stream cap without buffering. The gate judges body consumption, not the HTTP verb alone.
- Generic “recursive parse” matching was rejected because recursive schemas are not necessarily host traversals. E4 keys on the QuickJS dump boundary that can corrupt the shared runtime.
- E5 marker conventions, E6 two-write matching, and an E7 literal-only active gate were rejected as noisy proxies. Their false positives would teach agents to add markers or cosmetic `disabled` expressions instead of proving the invariant/interleave.
- Keeping the recurring mirror in `scripts/` was rejected because `Core-0-Architecture-and-Structure.md` §9 makes `scripts/` research-only; a milestone instrument belongs in `@orb/tooling`.
- A scheduled GitHub workflow was rejected by the D62 no-standing-CI ruling. Manual milestone execution is the owner-approved schedule.

## Coupled sites

| change | coupled sites |
| - | - |
| E1 | `tenancy-read.ts`; owner write/upsert descriptors; both descriptors' alias controls |
| E2-E4 | one descriptor per boundary; gate auto-discovery; `check-gates.int` planted fixture; active-gates table/count; paired product files/tests where the real tree currently violates |
| E8 | `tooling/src/review-mirror/{cli,index,contract,lib,ops}`; root `package.json`; `scripts/review-mirror.mjs` deletion; `scripts/README.md` disposition; tooling API/CLI/type tests |
| authored design | docs catalog lane, receipt, generated catalog/state |

## Proof plan

1. Plant focused pre-fix tests for the two real E3 body gaps and the membrane metadata dump gap; run them against the pre-fix source and preserve the red output.
2. Give every active descriptor `mustFlag` and `mustPass` controls for its precise false-positive boundary, including E2 unrelated dynamic regex, E3 GET/zero-body/capped-stream, and E4 non-membrane dump.
3. Add real-tree blindness trips: E2 requires the canonical composition property; E3 requires at least one mutating route; E4 requires the canonical membrane dump helper/dump site. The review-mirror run refuses zero tracked files, zero mirrored code/bytes, generation errors, missing code, zero scanned TSX, zero direct controls, or empty review focus.
4. Run the gate conformance suite, focused gate/product/review-mirror tests, `check:structure`, scoped Biome/ESLint and both owning typecheck programs. Do not run the final full hook; the merge train owns consolidation.

## Activation condition

E1-E4 graduate active only with real-tree zero findings. E5/E6 remain named review focus. E7 may become an active gate only after #725 drains the genuine missing guards and a cold census proves the remaining derived guards are mechanically classified without broad dataflow or admissions.
