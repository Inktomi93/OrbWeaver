---
kind: bug
status: open
updated: 2026-10-24
priority: P2
plan: restoration-register
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
| Character import/create controls at docked widths | See [feature list-header case decisions](#feature-list-header-case-decisions). | Common header CT does not establish the character feature's control budget. |
| Discovery denominator and plugin filtered census | See [feature list-header case decisions](#feature-list-header-case-decisions). | Generic zero suppression is already assigned above. |
| Databank maintenance/refusal states and Add-dialog behavior | See [feature list-header case decisions](#feature-list-header-case-decisions). | Do not claim these workflows from a presentational header mount. |

### Feature list-header case decisions

Each reference file was read in full. No maintained test covered any of these feature bands before this batch. Rebuilt cases mount the section's production `useListHeader` from `useSectionRegistry()` through the public `ListPaneHeaderHost` under `CtClientProviders`, the composition the app shell uses. Copy strings are not asserted; locators use accessible names.

Reference `client/features/character/hooks/use-characters-list-header.ct.tsx`:

| Reference case | Behavior and assertions | Existing coverage | Layer | Decision |
| - | - | - | - | - |
| Title renders in full at 307px and 272px | Real three-digit census settles; the title span is not clipped at either docked list width. | The common-header CT proves only that an unscoped title keeps its width in a constrained host. | CT geometry in the production shell | Rebuild, deferred to the item 0963 production-shell CT (`app-shell-panels.ct.tsx`, both panes docked at 1280). The widths come from the `.shell-panel` grid squeeze and `.shell-panel-header` flex box; a story cannot reproduce them without copying shell classes. |
| Neither create door loses its touch box at 307px and 272px | Import and New each render once in the accessibility tree; each short side is at least the fine control step. | None. | CT geometry in the production shell | Rebuild, deferred to the same 0963 CT. The New pair switches on an `@container` query that resolves against `.shell-panel`. |

Reference `client/features/discovery/hooks/use-corpus-list-header.ct.tsx`:

| Reference case | Behavior and assertions | Existing coverage | Layer | Decision |
| - | - | - | - | - |
| The band states the distilled count out of the library | `discovery.catalog` 12 of 20 renders `12 of 20 distilled` in the band. | None. | Unit for the phrasing; CT for the band wiring | Rebuild: [corpus-list-header CT](../../tests/client/features/discovery/hooks/corpus-list-header.ct.tsx) proves the catalog read reaches the band through the registry; [corpus-vocabulary unit](../../tests/client/features/discovery/lib/corpus-vocabulary.test.ts) owns the production `distilledCensus` phrasing, including `0 of 5 distilled`. The mode title literal is dropped as copy. |
| A fully distilled library still labels the count | 12 of 12 renders `12 distilled` with no `of`. | None. | Unit | Move to the corpus-vocabulary unit test. |
| A zero distilled count renders the title alone | An empty catalog renders no `0`. | The common-header CT suppresses numeric and string zero. | Unit and common CT | Move the empty-library bare zero to the unit test; keep suppression in the common-header CT. |

Reference `client/features/plugin/hooks/use-extensions-list-header.ct.tsx`:

| Reference case | Behavior and assertions | Existing coverage | Layer | Decision |
| - | - | - | - | - |
| The band names the section and states the live page count | Two plugins with one page each render `2`. | None. | CT with data hooks | Rebuild in the [extensions-list-header CT](../../tests/client/features/plugin/hooks/extensions-list-header.ct.tsx). A third, non-page surface must not count. The section title literal is dropped as copy. |
| Zero registered pages render the title alone | No pages renders no `0`. | The common-header CT suppresses numeric zero. | Common CT | Drop: an empty roster yields the bare zero that the common header already suppresses. |
| Filtered census, named by this item | A finder query keeps a filtered count; a query that matches nothing renders `0 of N`. | None. | CT with data hooks | Rebuild in the same CT. The story writes the production extensions search store that the shell's finder writes. |

Reference `client/features/databank/hooks/use-databank-list-header.ct.tsx`:

| Reference case | Behavior and assertions | Existing coverage | Layer | Decision |
| - | - | - | - | - |
| Both owner-wide sweeps wait for a confirm | No `databank.reindex` call while each confirm is open; confirming sends the owner scope with `chunk-embed`, then `re-extract`. | None. | Controlled-state CT | Rebuild in the [databank-list-header CT](../../tests/client/features/databank/hooks/databank-list-header.ct.tsx), over the corpus bank-health read. |
| Both sweeps are closed over an empty bank and say why | Items disabled; a forced click opens nothing; the reason label is visible. | None. | Controlled-state CT | Rebuild: `toBeDisabled` replaces the forced click; the reason is asserted as the menu group's accessible name, not its copy. |
| A stocked bank shows no disabled reason | The reason label is absent over a stocked bank. | None. | Controlled-state CT | Rebuild inside the confirm case: its menu group is unnamed. |
| Switching Add mode moves neither the mode strip nor the footer | Strip y spread at most 1px across three arms; no void under Cancel; the reserved region keeps its floor. | None. | CT geometry in the production modal host | Rebuild, deferred to the item 0963 modal CT (`app-shell-modals.ct.tsx`). Add opens the `addDocument` slot that only the shell's `ModalHost` renders, and the app-shell door does not export it. |
| The Add dialog's teaching sentence reads at least the field-label size | Computed font size relation inside the dialog. | None. | CT in the production modal host | Rebuild, deferred to the same 0963 CT. |
| The band prints the server census of a bank deeper than one page | A bank past `DATABANK_LIST_DEFAULT_LIMIT` prints its total, never `N+`, and reads no `databank.list`. | None. | Controlled-state CT | Rebuild. `routeTrpc` refuses an unlisted `databank.list`, so the band cannot measure a page. |
| Every Add arm offers Cancel, and Cancel closes | Cancel in all three arms; the upload arm's Cancel closes the dialog. | None. | CT in the production modal host | Rebuild, deferred to the same 0963 CT. The band's own half, Add opening the `addDocument` slot, is rebuilt in the confirm case. |
| A failed census does not tell a stocked bank to add a document | Failure label instead of the empty label; sweeps disabled; the re-read item refetches. | None. | Controlled-state CT | Rebuild with recovery: after the re-read succeeds the census renders and the sweeps enable. |

### Bootstrap and common-header runtime evidence

The [public-hook bootstrap suite](../../tests/client/data/auth-config.dom.test.ts) and existing bootstrap contract suite pass. Removing failed-memo reset, shared in-flight memoization or full live-share parsing fails the corresponding client assertion. The contract matrix stays in its existing home and includes the reference's distinct malformed localFirstRun field.

The [common-header CT](../../tests/client/components/list-pane-header.ct.tsx) passes through ListPaneHeaderHost. Removing string-zero suppression fails the rendered heading assertion. Making the unscoped title truncatable fails the constrained-width assertion. Fresh browser-build source maps identify the modified production source during both controls; all temporary changes are restored.

The component story contains browser-owned callback state and a constrained layout host, not a copied application shell. No production code, package export or shared testkit change is required. Native DOM typechecking, scoped lint and dependency checks qualify the new test entries.

### Feature list-header runtime evidence

The corpus, extensions and databank band CTs and the corpus-vocabulary unit test pass. Each temporary production change below fails its named case for the stated reason. All changes are restored before the final passing run.

| Production change | Failing case and observation |
| - | - |
| `distilledCensus` returns the bare distilled count | The unit test expects `12 of 20 distilled`; the corpus band no longer shows it. |
| Plugin pages keep every anchor except `dialog` | The page-count case finds no `2`; the filtered case finds `0 of 3`, not `0 of 2`. |
| The extensions census drops the filtered `0 of N` arm | The filtered case finds no `0 of 2`. |
| A sweep request sends on menu selection instead of opening its confirm | The confirm case finds no alert dialog. |
| The empty-bank predicate never matches | The empty-bank case finds `Rebuild all documents` enabled. |
| The empty-bank reason renders over every bank | The confirm case finds a named menu group over a stocked bank. |
| The failed-census re-read item is removed | The failed-census case finds no `Check the bank again`. |
| The band caps its count at `100+` | The deep-bank case finds no full census. |

The stories mount only the production registry, host and stores, and add no production or testkit export. The character docked-width cases and the Add-dialog cases remain open for the production-shell CTs in item 0963.
