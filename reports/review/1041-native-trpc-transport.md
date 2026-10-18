# Native E2E tRPC success transport

The E2E success transport now uses the installed public `createTRPCClient<AppRouter>` and `httpBatchLink` from `@trpc/client` 11.19.0. The generic dotted success façade and its `unknown as TrpcOutput<TPath>` assertion are removed. Ordinary successful responses have one native transport owner.

## Boundary and decisions

- `tests/e2e/support/trpc.ts:77` aliases the public native client, not a local interface. Callers use actual nested `.query` and `.mutate` members.
- `tests/e2e/support/trpc.ts:82` derives `TrpcClientOutput` from those native members. E2E message, participant, binding and tracker aliases use the client output. Native serialization is not asserted back into raw server output.
- `tests/support/browser/trpc-wire.ts:23` exports the existing `ProcedureAt` traversal. Its raw `TrpcOutput` remains unchanged. The deliberately unbranded Node responder `TrpcWireOutput` also remains unchanged. No native dependency enters testkit.
- `tests/e2e/support/trpc.ts:102` binds the caller's origin and headers. Native batching uses the server's canonical `TRPC_BATCH_MAX_ITEMS`. Queries remain GET; mutations remain JSON POST. The native header callback retains the previous mutation JSON content-type precedence.
- Non-2xx responses retain URL, method, status and raw-body diagnostics. Successful `Response` objects pass unchanged to native tRPC parsing, including mixed-result HTTP 207 batches.
- `tests/e2e/support/actors.ts:20` exposes the native client under `trpc`; `headers`, schema-parsed `whoami` and raw `expectError` remain. Login, cookie extraction, CSRF, forwarded-header values and JWT production are unchanged.
- Explicit raw HTTP status/envelope probes remain raw. `batchResultData` still returns `unknown` for the existing envelope-observation consumer, not ordinary successful calls.

Installed-source evidence: `packages/client/node_modules/@trpc/client/src/createTRPCClient.ts:141` constructs the public recursive client; `internals/TRPCUntypedClient.ts:97` returns `unknown` for untyped dotted calls. `links/httpBatchLink.ts` owns batching, native response transformation and error envelopes; `links/internals/httpUtils.ts` owns index-keyed input encoding and header precedence. Production has no transformer (`packages/server/src/transport/trpc/trpc.ts:76`), and its mount limits batches (`packages/server/src/entry/app.ts:362`).

## Exact population

A bounded Babel syntax survey parsed all 55 tracked TypeScript files under `tests/e2e`. It found 237 existing generic success calls in 19 files: 221 calls in this assignment and 16 in the sibling's two owned live specs. No nonliteral generic calls appeared. Literal import/reference searches found no imports of this transport outside `tests/e2e` and no import aliases requiring a second migration path. Other E2E consumers call stable named helpers or consume their aliases; those helpers now return the native client's inferred outputs without caller edits.

For every owned call, the syntax comparison preserved receiver, procedure, query/mutation kind and argument source, apart from whitespace. Existing raw negative probes and assertions remain. The sibling owns eight mechanical host-call migrations in each of `live-hidden-span-resume.local.spec.ts` and `live-reasoning-strip.local.spec.ts`, committed in `bba86464d8c126d253f665aa10ca02a5d719bf1f`.

| Owned caller | Existing calls |
| - | - |
| `tests/e2e/auth-smoke.local.spec.ts` | 1 |
| `tests/e2e/card-import.spec.ts` | 9 |
| `tests/e2e/corpus-conversation.spec.ts` | 12 |
| `tests/e2e/corpus-libraries.spec.ts` | 15 |
| `tests/e2e/corpus-settings.spec.ts` | 18 |
| `tests/e2e/corpus-shared.local.spec.ts` | 5 |
| `tests/e2e/draft-mode-options.spec.ts` | 1 |
| `tests/e2e/live-member-strip.local.spec.ts` | 13 |
| `tests/e2e/live-virtualizer-sweep-parity.spec.ts` | 1 |
| `tests/e2e/members-tab-views.local.spec.ts` | 6 |
| `tests/e2e/multi-human-visibility.local.spec.ts` | 56 |
| `tests/e2e/multi-tab-sync.spec.ts` | 1 |
| `tests/e2e/smoke.spec.ts` | 2 |
| `tests/e2e/support/actors.ts` | 7 |
| `tests/e2e/support/corpus-test.ts` | 2 |
| `tests/e2e/support/global-setup.ts` | 14 |
| `tests/e2e/support/trpc.ts` | 58 |

All changed paths are the owned caller table, `tests/e2e/support/trpc.dom.test.ts`, `tests/support/browser/trpc-wire.ts`, root `package.json`, root `pnpm-lock.yaml`, and this report. The root-generated lock change contains only the root importer for the existing catalog pin. Product package manifests and versions are unchanged.

## Verification

Every pnpm invocation used `npm_config_verify_deps_before_run=false PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm --config.verify-deps-before-run=false`.

`test:scoped tests/e2e/support/trpc.dom.test.ts` exercises the composed production root and native ephemeral HTTP listeners. It checks real persistence, distinct batched outputs, mixed-success/error envelopes, cookie identity, CSRF refusal and admission, forwarded fallback refusal, raw error observations, upstream status failure and native malformed-JSON refusal. All listeners and roots use native asynchronous disposal.

| Control or run | Result | Artifact under `reports/runs/test/` |
| - | - | - |
| Original façade, native API adoption controls | Expected red: missing native procedure members; this is API adoption evidence, not a behavioral defect control | `codex-item898-3127956-2026-10-18T04-25-48-641Z/test-report.json` |
| Initial native controls | Green, 2/2 | `codex-item898-3192171-2026-10-18T04-26-41-209Z/test-report.json` |
| Upstream/parser control added | Green, 3/3 | `codex-item898-3306916-2026-10-18T04-28-07-865Z/test-report.json` |
| Drop caller headers at native link | Expected red: owner identity arrives instead of member identity; restored | `codex-item898-3335208-2026-10-18T04-28-27-120Z/test-report.json` |
| Remove non-2xx refusal | Expected red: HTTP 503 with genuine product success bytes resolves; status diagnostics also fail; restored | `codex-item898-3363908-2026-10-18T04-28-50-856Z/test-report.json` |
| Restored source with mixed-result control | Green, 3/3 | `codex-item898-3439240-2026-10-18T04-30-01-939Z/test-report.json` |
| More simultaneous calls than the server batch cap, before native maxItems | Expected red: actual mount answers 400, batch exceeds maximum | `codex-item898-3476829-2026-10-18T04-30-34-256Z/test-report.json` |
| Canonical maxItems applied | Green, 3/3 | `codex-item898-3510116-2026-10-18T04-31-04-446Z/test-report.json` |
| Caller text/plain header before preserving mutation JSON precedence | Expected red: actual mount answers 415 | `codex-item898-3556159-2026-10-18T04-31-44-026Z/test-report.json` |
| Final source with cap and mutation header precedence | Green, 3/3 | `codex-item898-3584628-2026-10-18T04-32-06-423Z/test-report.json` |

Exact-path `pnpm exec biome check <changed paths> --diagnostic-level=error` checked the 19 changed TypeScript files. Its first write pass found one array-constructor style error, corrected without suppression; the subsequent full changed-file pass was green. The final two edited files passed their matching scoped command. `git diff --check` passes. The bounded syntax survey passed with every owned call preserved; its scratch command was `pnpm exec node /tmp/native_trpc_transport_1041-survey.cjs`.

Root owns dependency resolution and the private install. Its frozen offline install succeeded without changing product dependency pins. No install, generator, stack operation, world compiler, whole-tree check or browser E2E ran in this lane. Root owns the combined Node, DOM and ISO compiler floor after integrating both sibling changes, independent review and real-stack qualification. The commit excludes the expensive `check` hook under the explicit root exception; commit-message validation remains enabled.

## Assumptions and remaining qualification

The app router remains the authority for successful payloads. The maintained native client supplies output inference and tRPC envelope parsing; it does not promise runtime validation of every application payload field. No new authn, authz or crypto authority is introduced. Production still owns session admission, cookie CSRF, proxy trust, permissions and payload projection. The controls prove the transport preserves those selected observations, not every production visibility path.

The generic `TrpcOutput` assertion seam is removed in source and has bounded behavioral controls. Full successor qualification still requires root's combined native compiler and independent review results. SSE/auth observation repairs are a separate sibling assignment. `WireReady` remains HOLD. No production security gate, grant or suppression is deleted by this assignment.
