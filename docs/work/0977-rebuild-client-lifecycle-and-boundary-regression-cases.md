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
| Title renders in full at 307px and 272px | Real three-digit census settles; the title span is not clipped at either docked list width. | The common-header CT proves only that an unscoped title keeps its width in a constrained host. | CT geometry in the production shell | Rebuild, done in the item 0963 production-shell CT (`tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx`, both panes docked at 1280). The widths come from the `.shell-panel` grid squeeze and `.shell-panel-header` flex box; a story cannot reproduce them without copying shell classes. |
| Neither create door loses its touch box at 307px and 272px | Import and New each render once in the accessibility tree; each short side is at least the fine control step. | None. | CT geometry in the production shell | Rebuild, done in the same 0963 CT. The New pair switches on an `@container` query that resolves against `.shell-panel`. |

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
| Zero registered pages render the title alone | One plugin with no surfaces renders no census. | The common-header CT suppresses numeric zero, but the roster guard `pages.length > 0` decides whether the band receives `0 of 0` or a bare zero. | CT with data hooks | Rebuild in the same CT. The case fails when the roster guard is dropped. |
| Filtered census, named by this item | A finder query keeps a filtered count; a query that matches nothing renders `0 of N`. | None. | CT with data hooks | Rebuild in the same CT. The story writes the production extensions search store that the shell's finder writes. |

Reference `client/features/databank/hooks/use-databank-list-header.ct.tsx`:

| Reference case | Behavior and assertions | Existing coverage | Layer | Decision |
| - | - | - | - | - |
| Both owner-wide sweeps wait for a confirm | No `databank.reindex` call while each confirm is open; confirming sends the owner scope with `chunk-embed`, then `re-extract`. | None. | Controlled-state CT | Rebuild in the [databank-list-header CT](../../tests/client/features/databank/hooks/databank-list-header.ct.tsx), over the corpus bank-health read. |
| Both sweeps are closed over an empty bank and say why | Items disabled; a forced click opens nothing; the reason label is visible. | None. | Controlled-state CT | Rebuild: `toBeDisabled` replaces the forced click; the reason is asserted as the menu group's accessible name, not its copy. |
| A stocked bank shows no disabled reason | The reason label is absent over a stocked bank. | None. | Controlled-state CT | Rebuild inside the confirm case: its menu group is unnamed. |
| Switching Add mode moves neither the mode strip nor the footer | Strip y spread at most 1px across the Add modes; no void under Cancel; the reserved region keeps its floor. | None. | CT geometry in the production modal host | Rebuild, done in the item 0963 modal CT (`tests/client/features/app-shell/surfaces/app-shell-modals.ct.tsx`). Add opens the `addDocument` slot that only the shell's `ModalHost` renders, and the app-shell door does not export it. |
| The Add dialog's teaching sentence reads at least the field-label size | Computed font size relation inside the dialog. | None. | CT in the production modal host | Rebuild, done in the same 0963 CT. |
| The band prints the server census of a bank deeper than one page | A bank past `DATABANK_LIST_DEFAULT_LIMIT` prints its total, never `N+`, and reads no `databank.list`. | None. | Controlled-state CT | Rebuild. `routeTrpc` refuses an unlisted `databank.list`, so the band cannot measure a page. |
| Every Add mode offers Cancel, and Cancel closes | Cancel in every Add mode; the upload mode's Cancel closes the dialog. | None. | CT in the production modal host | Rebuild, done in the same 0963 CT. The band's own half, Add opening the `addDocument` slot, is rebuilt in the confirm case. |
| A failed census does not tell a stocked bank to add a document | Failure label instead of the empty label; sweeps disabled; the re-read item refetches. | None. | Controlled-state CT | Rebuild with recovery: after the re-read succeeds the census renders and the sweeps enable. A second case reads the empty-bank reason from a mounted empty bank, then asserts a failed census renders that text nowhere in the menu and renders its own reason once. The group name alone is not the evidence: it carries only one label. |

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
| The extensions census drops the filtered `0 of N` branch | The filtered case finds no `0 of 2`. |
| The extensions census drops the `pages.length > 0` guard | The empty-roster case finds `0 of 0` in the heading. |
| A sweep request sends on menu selection instead of opening its confirm | The confirm case finds no alert dialog. |
| The empty-bank predicate never matches | The empty-bank case finds `Rebuild all documents` enabled. |
| The empty-bank reason renders over every bank | The confirm case finds a named menu group over a stocked bank. |
| The empty-bank predicate treats an unread census as empty (`(census ?? 0) === 0`) | The failed-census reason case finds the empty-bank reason rendered in the menu. |
| The failed-census re-read item is removed | The failed-census case finds no `Check the bank again`. |
| The band caps its count at `100+` | The deep-bank case finds no full census. |

The databank cases build empty and deep banks from the production `BankHealthView` type with every field agreeing (total, passages, chunks, per-phase counts, stale extraction). The corpus holds one stocked bank-health capture and no empty or deep bank. The `discovery.catalog` and `plugin.listSurfaces` reads have no corpus capture yet; item 0977 does not add them, the corpus shell-read work does.

The stories mount only the production registry, host and stores, and add no production or testkit export. The character docked-width cases and the Add-dialog cases remain open for the production-shell CTs in item 0963.

### Selected case map: flow-walking CTs

This case map classifies the flow-walking CT cases of the app-root, pending route, router, stuck-splash and app-shell reference files.

#### Qualified cases and limits

| Reference scope | Required behavior | Maintained home and limit |
| - | - | - |
| AR13, AR14 | A phone's empty Explore finder opens the understanding overview, moves focus into Content and closes the sheets. | [Empty Explore CT](../../tests/client/features/discovery/lib/corpus-explore-empty.ct.tsx) mounts the production shell over a production root. The empty finder exists only for a library with no characters: Explore lists a character with no digest as Not distilled. The same CT drives the Archetypes door in the open CONTEXT sheet over a library with characters and no digests. The sheets close; the focus handoff to Content has a second path (the shell's rescue of focus that fell to the body), so a missing handoff request alone does not fail the CT. |
| AR8, AR12 and AR16 | Preserve bare, filtered and empty census meanings, including a filtered zero. | The [phone topbar CT](../../tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx) owns the plugin pages title behavior, including a filtered zero. The [census title unit test](../../tests/client/lib/census-title.dom.test.ts) owns the composer. |
| AR18 | Labels prune/delete returns focus to the exact finder target under the real user-bus/refetch race. | [Corpus workbench](../../tests/e2e/corpus-workbench.spec.ts) runs the prune and the row delete on the phone project and expects the finder root itself to hold focus. Finder-only CTs do not reproduce the race. |
| AS43 | Arrival focus puts New before search and rows in forward Tab order. | [List arrival focus](../../tests/client/features/app-shell/surfaces/list-arrival-focus.ct.tsx) lands on the band's action, then walks the Tab stops of Chats, Characters and Presets and expects New, then the search field, then a row. |
| AS66–AS69 | A closed Context sheet remains closed after open, list hide/show, sheet close and another list hide. | [Context carry](../../tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx) runs that sequence with the constrained shell. |
| AS93, AS96, AS97, AS99 | Real-room message rows and composer stay in their corridors from the first painted frame, including scaled docking and Context changes. | [Shell motion CT](../../tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx) holds the row and composer on the Context door, the both-docked List door and the scaled dock. A room with a mounted flank column narrows the row's parent; the carriers are not held there. |
| Production-served corpus boot | The document and its module graph reach the application without aborted lazy-module/CSS startup. | [Cold boot](../../tests/e2e/corpus-cold-boot.spec.ts) asserts that the first navigation finishes with no failed or refused request, and its control aborts one stylesheet and expects the same watch to name it. Harness stacks do not watch sources (`tooling/src/dev/lib/plan.ts`). |

Case names in this case map identify existing or proposed specs. The disposition index below does not assert a new runtime result.

#### Minimum retained coverage

Keep positive controls with absence/refusal assertions. Preserve each distinct failure when cases share a table-driven test.

| Maintained family | Required observables |
| - | - |
| Corpus shell journeys | Cold focus and first Tab; app readiness under held initial reads; phone and desktop census; section navigation; editor draft/scroll retention; delayed Refinery reads; phone push and Back; room tab-bar behavior; failed-chunk retry and route-crash reporting. |
| Corpus workbench journeys | Explore/Insights/Labels mode switching, keyboard focus, phone landing rules, drill and Back state, finder restoration and real prune completion. |
| Signed-out corpus and OIDC journeys | Slow guards, latest-navigation settlement, exact join-token consumption, unrelated query/hash/history preservation and pending-join dismissal. |
| Notices | Stable content geometry, topbar/composer clearance, bounded scrolling and pointer pass-through; keyboard flag lifetime; stray-file handling without intercepting text or genuine dropzones. |
| Command palette | Durable trigger and final focus; shortcut filtering, default prevention and modal yield; frame/listener cleanup; stable filtered viewport; active descendant; global palette focus across pending content arrival. |
| Modal host | Body focus without accidental Close activation; final focus; document lock and owned scroller; pinned headers; Escape; theme/polarity/density/colorization across portals; Add mode/footer geometry, readable teaching text and Cancel. |
| Panels | Pane capability declarations; accessible collapsed state; deferred body mount; first committed track geometry; width regimes and reading floors; unchanged persisted overrides; carry, scrim, Escape and close focus; keyboard skip and named landmarks. |
| Responsive shell | Curated mobile chrome, You-sheet handoff and scrolling; full-width roster/member screens; one main; DOM order; room tab-bar removal/restoration; sheet geometry, elevation and inert background. |
| Topbar | Member/section identity during held reads; title floors and clipping; glyph chips and touch targets; divider alignment; hit-testable Back and Rename; phone band shedding; registry-owned trail order and empty projection. |
| Motion | Co-motion duration/easing, real layout-shift observation, first-frame and full-path corridors, scaled exit widths, settle cleanup, reduced-motion gating and phone cancellation; Content-only fixed-scale snapshots with no returning old image. |
| Appearance | Glass/elevation precedence, collapsed-carrier cost, whole-pixel tracks and promotion exclusions; preference precedence; grain ownership; wallpaper lifetime; width/font scale; weakest-ink plate contrast over least-dim black art; unchanged dark fills. |
| First-run and pending route | Forced first-run naming without a close path; loading status; motion preference handover without clearing a retained flag or leaking a stale one. |
| Pure rules | Shared census composition, platform shortcut labels and panel mode/override resolution. Keep a CT wiring case where rendered application behavior differs. |
| Feature header handover | Character title/create-door geometry at constrained docked widths and Add-dialog mode/footer/Cancel behavior remain with their production-shell CT owners. Common-header isolation does not prove shell geometry. |

The app-shell CT homes are under `tests/client/features/app-shell/surfaces/`. E2E homes are under `tests/e2e/`. The index uses spec names to avoid duplicating full paths.

#### Retained component and helper scopes

These scopes retain CT ownership because E2E cannot supply their controlled input or browser lifecycle.

| Scope | Distinct retained purpose |
| - | - |
| Pending join and invite dialog | Held preview/confirmation, validation and focus, unavailable/refused states, disclosure, duplicate-submit guards, canonical outgoing requests and completion/dismissal callbacks. Real membership and authentication stay in integration/E2E. |
| Session freshness and durable binding | Injected time/visibility, unreachable retry, signed-out recovery, subscriptions, returning-user storage, foreign hints and legacy adoption. |
| Client mount, state and browser lifecycle | Runtime/cache ownership across rerender/unmount, production provider assembly, state actions, native view-transition settlement and redacted native browser errors. |
| Settings content/search and background upload | Held/cancelled anchor jumps, retained folds, observer cleanup, registry/plugin completions, live-region results and seeded upload identity. |
| Connection prompt cache | Provider ownership, supported options, dependent controls and exact patches, replay disclosure, typography and reading measure. Label-save E2E does not replace these cases. |
| Lists and section identifiers | Successor binding, focus, own echoes, draft lifetime, pending-write ordering, reset and injected add/duplicate identifiers. |
| Plugin Worker and confirmation identity | Native protocol, log and memory limits, boot refusal/retry, captured publication/disable and destructive-confirmation identity across refresh. |
| Notifications and media | Held inbox reads, captured unread/pending actions, request ownership, zoom/consent retention for identical snapshots and closure on replacement, Retry scroller geometry. |
| Character, labels, refinery and RPG | Touch editing, windowed Retry focus, immutable-run expansion, native/foreign media boundaries, inherited-name keys, disabled/enabled game controls, heading/landmark structure and narrow archives. |
| Browser support and gallery | Exact request routing, explicit holds/refusals, socket and measurement boundaries, deterministic helper ownership, startup and render-failure reporting. |

#### Reference flow cases

AR identifies the external app-root reference; RP the pending route; RT the router; SS the stuck-splash suite; AS the app-shell suite.

Every reference identifier retains its recorded disposition below. Implementation recorded means the earlier source record reports delivery, not current whole-application qualification.

The complete original inputs, assertions, collapse groups, review corrections and native evidence are preserved in the private originals under `reports/surface-consistency-private/governed-doc-recovery/originals/docs/work/`.

| Reference identifiers | Recorded disposition | Maintained home or proposed target |
| - | - | - |
| AR1 | Keep maintained coverage | `smoke.spec.ts` |
| AR2, AR3, AR4, AR6, AR7, AR8, AR9, AR23, AR24, AR25, SS1, SS2, AS45, AS47, AS48, AS51, AS179, AS180, AS181, AS182, AS183, AS186, AS187, AS188, AS221 | E2E implementation recorded | `corpus-shell.spec.ts` |
| AR5 | CT implementation recorded | `first-run-persona-dialog.ct.tsx` |
| AR10, AR11, AR12, AR15, AR17, AR18 | E2E implementation recorded | `corpus-workbench.spec.ts` |
| AR13, AR14 | CT implementation recorded | `corpus-explore-empty.ct.tsx` |
| AR16 | Unit implementation recorded | `census-title.dom.test.ts` |
| AR19, AS55, AS56, AS57, AS58, AS59, AS60, AS61, AS163, AS191, AS192, AS193, AS194, AS196, AS197, AS211, AS212, AS213, AS214, AS215, AS222 | CT implementation recorded | `app-shell-topbar.ct.tsx` |
| AR20 | CT implementation recorded | `section-roster-census.ct.tsx` |
| AR21, SS3, AS7, AS41, AS72, AS82, AS98, AS101, AS103, AS131, AS143, AS156, AS216, AS217 | Drop | No replacement |
| AR22, AS15, AS16, AS17, AS18, AS19, AS20, AS21, AS22, AS26, AS27, AS28 | CT implementation recorded | `app-shell-command.ct.tsx` |
| RP1 | CT implementation recorded | `route-pending.ct.tsx` |
| RP2, RP3, AS108, AS114, AS115, AS116, AS117, AS118, AS119, AS120, AS121, AS122, AS124, AS125, AS126, AS127, AS128, AS129, AS130, AS132, AS133, AS134, AS135, AS136, AS137, AS138, AS139, AS140, AS141, AS142, AS144, AS145, AS146, AS147, AS148, AS149, AS150, AS151, AS152, AS153, AS154, AS155, AS157, AS158, AS159, AS160, AS203, AS204, AS205, AS206, AS207, AS208, AS209, AS210 | CT implementation recorded | `app-shell-appearance.ct.tsx` |
| RT1, RT2, RT3 | E2E implementation recorded | `corpus-signed-out.local.spec.ts` |
| RT4 | Keep maintained coverage | `oidc-pending-join.oidc.spec.ts` |
| AS1, AS2, AS3, AS4, AS5, AS6, AS166, AS167, AS168 | CT implementation recorded | `app-shell-notices.ct.tsx` |
| AS8, AS9 | Keep maintained coverage | `corpus-home-launch.spec.ts` |
| AS10, AS11, AS12, AS13, AS39, AS40, AS42, AS43, AS44, AS53, AS54, AS62, AS63, AS64, AS65, AS66, AS67, AS68, AS69, AS71, AS73, AS74, AS75, AS76, AS77, AS78, AS79, AS80, AS81, AS109, AS110, AS111, AS113, AS169, AS170, AS171, AS173, AS174, AS175, AS218, AS219, AS220 | CT implementation recorded | `app-shell-panels.ct.tsx` |
| AS14, AS29, AS30, AS31, AS32, AS33, AS34, AS35, AS36, AS37 | CT implementation recorded | `app-shell-modals.ct.tsx` |
| AS23, AS24, AS25, AS46, AS49, AS50, AS52, AS172, AS176, AS177, AS178, AS189, AS190, AS195, AS198, AS199 | CT implementation recorded | `app-shell-responsive.ct.tsx` |
| AS38 | CT implementation; fabricated seed-density case dropped | `app-shell-modals.ct.tsx` |
| AS70 | Unit implementation recorded | `panel-resolve.test.ts` |
| AS83, AS84, AS85, AS86, AS87, AS88, AS89, AS90, AS91, AS92, AS94, AS95, AS100, AS102, AS104, AS105, AS106, AS107, AS112, AS184, AS185 | CT implementation recorded | `app-shell-motion.ct.tsx` |
| AS93, AS96, AS97, AS99 | CT implementation recorded | `app-shell-motion.ct.tsx` |
| AS123 | CT implementation; no system-message subject | `app-shell-appearance.ct.tsx` |
| AS161, AS162, AS200, AS201, AS202 | Move (done) | `corpus-shell.spec.ts` |
| AS164, AS165 | Unit implementation recorded | `command-shortcut-label.test.ts` |

##### Drop decisions

| Reference scope | Reason and preserved coverage |
| - | - |
| AR21 | Tests a DOM-mutating roster helper against itself rather than product behavior. AR20 retains the actual roster/search behavior. |
| SS3 | Injected region suspension duplicates the real delayed Refinery-read journey in AR25. |
| AS7 | Asserts an injected story body. Actual boot/Home rendering remains in smoke coverage. |
| AS41 | Browser word separation passed without a product fix. Named landmark behavior remains in AS40. |
| AS72 | A width-specific Home assertion has no stronger journey evidence. AS65/AS70 retain the regime rule; smoke retains Home rendering. |
| AS82 | The simultaneous overlay/modal state is unreachable through Base UI modality. AS32 retains modal Escape. |
| AS98, AS101 | Extra touch-emulation variants add no distinct defect beyond AS95 and AS99/AS100. |
| AS103 | Removing restart reflow and live-animation cancellation did not fail the reconstructed case. It does not establish a product regression. |
| AS131 | Confirms browser media emulation rather than application behavior. Contrast cases retain the actual product assertions. |
| AS143 | No shell flow supplies an out-of-grid Card. Do not fabricate that state to retain its CSS-only scenario. |
| AS156 | Duplicates the rendered root font-size assertion in AS159. |
| AS216 | Default ordering passed without a defect. AS214/AS215 retain the actual registry projection. |
| AS217 | The reference invents a popup that opens Context. Existing production doors are plain controls, so its focus scenario has no product subject. |

##### Partial and unsupported subjects

- AS38 retains custom density inheritance. A seed theme with an invented stored density is not a valid production subject.
- AS123 retains user/assistant bubble wiring. No available corpus producer writes its system-message subject; do not claim that role covered.
- AS122 does not claim an alert dialog over a room. No shell flow opens one there; shared popup styling does not prove that journey.
- AS125 does not separately carry the phone bubble scenario. The shared breakpoint case does not invent a missing room observation.
- AS40's same-section member projection is not established by its section-change case.
- AS42 does not retain a next-Tab assertion against the reference story's invented content control.
- AS93/AS96/AS97/AS99 hold the row and composer in a room without a flank column. A mounted flank column is not a subject of the carrier cases.
- G9's boot replay asserts the motion, font-scale and theme stamps on `<html>` before React mounts. Density has no root channel and renders only on the shell's theme scope, so the e2e cases do not assert it.

##### Shell chrome, boot hint and chrome assembly

| Reference case | Decision | Maintained home or reason |
| - | - | - |
| Boot veil: hold and dissolve on ready, the minimum display floor, no veil over a ready app, the degraded ready, reduced motion | Rebuild | [Boot veil CT](../../tests/client/features/app-shell/components/boot-veil.ct.tsx), over the production veil under `CtClientProviders`. The caption text is dropped as copy. |
| Mobile bar: the waiting-count badge, the label ramp step, label fit at the narrowest phone, the current-section tab | Rebuild | [Mobile bar CT](../../tests/client/features/app-shell/surfaces/mobile-bar.ct.tsx), over the production shell. The inbox is the real list with its read state set per case. |
| Rail: the single Home affordance | Rebuild | Mobile bar CT, at a desktop and a phone width. |
| `rail.end` widget sheet view and the sheet's modal row | Keep | [Responsive](../../tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx): the persona row is the widget view and the Jump row is the modal row. No modal ships on `rail.end`. |
| Boot hint: the server answer replayed on the next boot, a corrupt hint healing to the floors, seed palette names only, the pre-paint read keeping the other axes | Rebuild | [Boot hint CT](../../tests/client/state/appearance-boot-hint.ct.tsx), which remounts over the real stored blob. The pre-paint read is the store's `getState`, which the hook shares. The stamps on `<html>` stay in corpus shell. |
| Chrome assembly: rail entries, `rail.end`, the `topbar.trail` modal entry, unmapped placements, order and curation, widget identity, `(order, id)` | Rebuild | [Assembly test](../../tests/client/state/assemble-chrome.dom.test.ts), derived from the shipped sections, modals and widgets. No modal ships on `rail.end`, so that placement has no shipped subject. |

Defect controls: the veil floor, the latch and the degraded value, the boot hint's seed guard, theme replace and axes write, the badge, the label voice and the displaced-tab swap, and in assembly the section order, trigger order, widget copy, an extra mapped placement, the tie break and the section zone.
