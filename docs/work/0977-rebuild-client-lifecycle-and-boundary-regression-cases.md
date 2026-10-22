---
kind: bug
status: open
updated: 2026-10-22
priority: P2
plan: test-foundation
---

# Rebuild client lifecycle and boundary regression cases

## What

Rebuild client regression cases for initial-read invalidation, PostEventSource subscription lifetimes, invalid auth-config inputs and data-list-header behavior through production entries.

The [restoration register](../plans/test-foundation/design.md#restoration-register) records completed invite cases, including the unavailable-card return-to-sign-in action. This item's open status does not authorize another wholesale invite port. Keep existing OIDC and first-run join journeys in E2E.

## Why

Reference cases identify useful behavior but are outside the maintained test and compiler population.

## Done when

Each selected case records its layer and keep, rebuild, move or drop decision. Uncovered behaviors have maintained replacements and relevant failing defect controls. Preserve strict parsing, subscription cleanup and real client composition. Remove redundant cases and unsupported helpers with their replacements.

## Evidence

Use the external reference cases for initial-read invalidation and PostEventSource only as case descriptions. Corpus producer, clone, search and cleanup qualification belongs to the corpus-lifetime work item.

### Invite runtime evidence

The [restoration register](../plans/test-foundation/design.md#restoration-register) owns current dispositions and maintained test links. OIDC runtime acceptance remains [separate work](1082-qualify-the-existing-oidc-pending-join-e2e.md).

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

Native DOM typechecking and scoped lint and dependency checks establish the selected source boundaries. Whole-application and OIDC qualification remain separate.
