---
kind: bug
status: open
updated: 2026-10-22
priority: P2
plan: test-foundation
---

# Rebuild client lifecycle and boundary regression cases

## What

Rebuild client regression cases for initial-read invalidation, PostEventSource subscription lifetimes, invalid auth-config inputs and ListPaneHeader behavior through production entries.

The [restoration register](../plans/restoration-register/design.md) records completed invite cases, including the unavailable-card return-to-sign-in action. This item's open status does not authorize another wholesale invite port. Keep existing OIDC and first-run join journeys in E2E.

## Why

Reference cases identify useful behavior but are outside the maintained test and compiler population.

## Done when

Each selected case records its layer and keep, rebuild, move or drop decision. Uncovered behaviors have maintained replacements and relevant failing defect controls. Preserve strict parsing, subscription cleanup and real client composition. Remove redundant cases and unsupported helpers with their replacements.

## Evidence

Use the external reference cases for initial-read invalidation and PostEventSource only as case descriptions. Corpus producer, clone, search and cleanup qualification belongs to the corpus-lifetime work item.

### Invite runtime evidence

The [restoration register](../plans/restoration-register/design.md) owns current dispositions and maintained test links. The separate [OIDC runtime qualification](../plans/test-foundation/design.md#e2e-runtime-qualification) is complete for its named journey.

The named CTs and pure-function test pass. Removing the production late-focus handler, in-flight confirmation guard or unnamed-room fallback fails the corresponding control. Restoring production source returns the selected tests to green. Fresh CT source maps identify the altered component source during those checks.

The replacements add no production export or copied assembly. Component navigation assertions describe client behavior under scripted HTTP, not session-cookie authority. This evidence does not close the remaining lifecycle, invalid-auth-config or data-list-header cases.

### Selected lifecycle case decisions

The restoration register owns each scope's porting state. The linked maintained tests own the selected behavior; deferred cases remain outside this batch.

| Reference behavior | Primary layer and decision | Coverage boundary |
| - | - | - |
| Invalidation during an initial read, event bursts and facade coalescing | Rebuild through the public data provider, native QueryClient and controlled external reads. | Preserve one trailing read and isolate unrelated queries. |
| Inactive reads, mark-only invalidation and merged refetch targets | Rebuild in the same headless client suite. | Compare observable fetches and staleness with a no-event control. |
| Failed, removed or cancelled initial reads | Rebuild in the same headless client suite. | Preserve error state and prevent stale obligations from affecting replacement queries. |
| Canonical view updates during an initial read | Defer comparison and restoration of this distinct carrier case. | Do not copy the reference carrier assembly. |
| Native view-transition settlement | Defer the browser-specific portion. | Headless facade coalescing does not prove browser transition settlement. |
| POST subscription input, CSRF and committed resume cursor | Rebuild through public createTrpcClient and real loopback HTTP/SSE. | Server authorization and browser journeys remain in their existing integration and E2E homes. |
| Unsubscribe, late responses, reader release and pending retries | Rebuild through public subscriptions and controlled fetch responses. | Keep the actual tRPC link and PostEventSource implementation. |
| One-shot impersonation and terminal stream failures | Rebuild through public subscriptions. | Assert return, EOF, transient HTTP refusal and terminal HTTP refusal. Serialized-error behavior remains unreviewed. |
| Connected metadata and watchdog ownership | Rebuild through public subscriptions with native timer control. | Prove suppression of the native tRPC watchdog and unsubscribe cleanup. Live idle expiry and malformed metadata remain unqualified. |
| Private retry-cap, jitter, Retry-After arithmetic and injected stale callbacks | Defer reference-only private-option cases. | The public transport does not expose these options; add no testing export. |
| EventTarget listener removal | Drop the platform-only assertion. | Test subscription cleanup through the production client instead. |

### Lifecycle runtime evidence

The [initial-read suite](../../tests/client/data/invalidation-initial-read.dom.test.ts) passes through production providers and the public invalidation hook. The [subscription suite](../../tests/client/data/bus/post-event-source.dom.test.ts) passes through the production tRPC client and its actual transport adapter.

Removing initial-read retention fails the trailing-read assertion. Premature cursor commitment fails the reconnect header assertion. Removing unsubscribe abort fails the cancellation assertion. Each temporary source change is restored before the final passing run.

The unavailable-invite CT passes after exercising Back to sign in and observing the sign-in surface without a confirmation request. These tests add no production exports, shared harness or production behavior changes.

Native DOM typechecking and scoped lint and dependency checks establish the selected source boundaries. Whole-application qualification remains separate. The plan records the completed OIDC journey.

### Selected auth-config case decisions

Reference scope: `client/data/auth-config.test.ts` in the external legacy source. The restoration register records completed implementation and runtime status for this reference scope.

| Reference behavior | Decision and primary home | Remaining implementation |
| - | - | - |
| Malformed mode, transport, scope, flags, upload caps and share fields; missing required fields | Move to existing [bootstrap contract tests](../../tests/contracts/auth-config/bootstrap.contract.test.ts). Drop the duplicate client permutation matrix. | Retain both malformed localEnabled and localFirstRun cases in the existing matrix. Keep one client refusal/retry case to prove the fetch path actually parses. |
| Complete served flags and principal-dependent share disclosure | Keep existing [real HTTP tests](../../tests/server/entry/http/auth-meta.int.test.ts). | None; client transport tests do not replace authorization assertions. |
| Concurrent bootstrap reads share a request and successful memo survives query-cache eviction | Rebuild through the public auth-config hook and production providers with independent native query caches. | Add the missing client lifetime assertion without exposing the private fetcher. |
| Network, HTTP and representative schema failure release the memo for retry | Rebuild in the same headless client case. | Control fetch responses at the network boundary; keep the production parser and hook. |
| Live-share reads stay fresh and refuse HTTP failures or incomplete configuration | Rebuild through public fetchLiveShare. | Preserve fresh reads and complete-config parsing, without repeating every schema permutation. |

### Selected list-header case decisions

The reference scope is `client/components/list-pane-header.ct.tsx` and its fixture module. The plan's list-header label refers to ListPaneHeader. Feature-header references below identify distinct remaining cases; common-component coverage does not restore those features.

| Reference behavior | Decision and primary home | Coverage boundary |
| - | - | - |
| Suppress numeric and string zero; retain nonzero and filtered-zero counts | Rebuild as CT through public ListPaneHeaderHost. | Preserve the shared renderer's count semantics. Drop duplicate generic zero-count assertions in feature suites. |
| Title/count hierarchy, tabular figures, normal case and scoped accent | Rebuild the rendered component assertions in a combined CT. | Drop the separate custom audit-ratio calculation; retain observable typography, a positive title/count gap and accent distinction. Exact token-gap and baseline-alignment comparison remains open. |
| Focusable named back button, callback, optional action and conditional action marker | Rebuild through the public host and browser-owned story state. | The marker is a current shell coupling, not a substitute for shell geometry coverage. |
| A constrained unscoped title keeps its width before the count | Rebuild as a constrained-host CT. | This proves component width priority, not the feature's actual docked-pane budget. |
| Mobile title/count shedding, retained scoped/action rows, desktop shell behavior and device-pixel alignment | Move to real shell coverage; replacement remains open. | Do not copy the legacy hand-authored shell wrapper. Existing action-motion references also require actual shell behavior. |
| Character import/create controls at docked widths | Compare separately; this distinct feature case is outside the selected component batch. | Common header CT does not establish the character feature's control budget. |
| Discovery denominator and plugin filtered census | Compare separately; these distinct data/hook cases are outside the selected component batch. | Compare maintained formatter and query coverage before restoring them; generic zero suppression is already assigned above. |
| Databank maintenance/refusal states and Add-dialog behavior | Compare separately; these distinct feature/component cases are outside the selected component batch. | Do not claim these workflows from a presentational header mount. |

### Bootstrap and common-header runtime evidence

The [public-hook bootstrap suite](../../tests/client/data/auth-config.dom.test.ts) and existing bootstrap contract suite pass. Removing failed-memo reset, shared in-flight memoization or full live-share parsing fails the corresponding client assertion. The contract matrix stays in its existing home and includes the reference's distinct malformed localFirstRun field.

The [common-header CT](../../tests/client/components/list-pane-header.ct.tsx) passes through ListPaneHeaderHost. Removing string-zero suppression fails the rendered heading assertion. Making the unscoped title truncatable fails the constrained-width assertion. Fresh browser-build source maps identify the modified production source during both controls; all temporary changes are restored.

The component story contains browser-owned callback state and a constrained layout host, not a copied application shell. No production code, package export or shared testkit change is required. Native DOM typechecking, scoped lint and dependency checks qualify the new test entries.

Feature references awaiting maintained-coverage comparison are `client/features/character/hooks/use-characters-list-header.ct.tsx`, `client/features/discovery/hooks/use-corpus-list-header.ct.tsx`, `client/features/plugin/hooks/use-extensions-list-header.ct.tsx` and `client/features/databank/hooks/use-databank-list-header.ct.tsx`.
