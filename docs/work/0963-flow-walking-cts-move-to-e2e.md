---
kind: work
status: open
updated: 2026-10-24
priority: P2
plan: restoration-register
---

# Flow-walking CTs move to e2e

## What

Classify flow-walking CT cases using the [restoration decisions](../plans/test-foundation/design.md#restoration-decisions). Move uncovered critical journeys to corpus E2E. Reuse existing E2E coverage for duplicates and delete superseded flow CTs. Keep component, measurement and controlled-state cases in CT.

## Why

Complete journeys need the real application wires. Controlled component states, browser measurements and lifecycle boundaries require their own focused cases.

## Done when

No CT uses a fabricated backend to walk a complete route or app-shell journey. Each selected case names its retained coverage, replacement or reason for removal. Cross-layer cases identify distinct failures; they do not repeat the same permutation matrix.

Keep every unfinished case and qualification limit below until its owning work supplies current evidence. Source delivery alone does not change restoration status.

## Unfinished cases and ownership

| Reference scope | Required behavior | Owner and boundary |
| - | - | - |
| AR13, AR14; G34 | A phone's empty Explore finder opens the understanding overview, moves focus into Content and closes the appropriate sheets. | [Empty Explore subject](1342-corpus-empty-explore-subject.md) must supply a production-backed viewer or capture with characters and no digests. Rebuild one controlled-empty CT over the actual Corpus section. |
| AS161, AS162, AS200, AS201, AS202; G9 | Stored boot hints preserve motion, font scale, density and theme through the first shell commit while settings are pending. No-hint controls invent no preference or theme. | Add pre-mount cases to `corpus-shell.spec.ts` through the real boot entry. A CT that reproduces boot stamping does not prove its ordering. |
| AR8, AR12 and AR16 | Preserve bare, filtered and empty census meanings, including a filtered zero. | [Plugin phone title](1313-plugin-pages-phone-screen-name-is-untested.md) owns its remaining title behavior. Pure composer evidence and list-band evidence do not automatically qualify phone-shell wiring. |
| AR18 | Labels prune/delete returns focus to the exact finder target under the real user-bus/refetch race. | [Labels focus](1311-a-labels-prune-on-a-phone-lands-focus-on.md) requires the phone-shell E2E reproduction. Finder-only and socket-stubbed CTs do not reproduce that race. |
| AS43 | Arrival focus puts New before search and rows in forward Tab order. | [List arrival focus](1331-list-arrival-focus-lands-on-the-band.md). A case that only keeps focus out of main does not establish the first Tab stop. |
| AS66–AS69 | A closed Context sheet remains closed after open, list hide/show, sheet close and another list hide. | [Context carry](1329-context-carry-resurrects-a-closed-sheet.md). Preserve visibility transfer without changing stored preference semantics. Shorter carry sequences do not cover this sequence. |
| AS93, AS96, AS97, AS99 | Real-room message rows and composer stay in their corridors from the first painted frame, including scaled docking and Context changes. | [Room carriers](1341-centred-room-carriers-jump-on-pane-doors.md). Keep current main acceptance separate from earlier shell-box-only evidence and held-out carriers. |
| Production-served corpus boot | The document and its module graph reach the application without aborted lazy-module/CSS startup. | [Production boot](1310-a-production-served-e2e-boot-can-abort-its.md). Keep a cold failure distinct from warm-server and fresh-browser evidence. |

Case names in this document identify existing or proposed specs. The disposition index below does not assert a new runtime result.

## Minimum retained coverage

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

## Retained component and helper scopes

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

## Reference flow cases

AR identifies the external app-root reference; RP the pending route; RT the router; SS the stuck-splash suite; AS the app-shell suite.

Every reference identifier retains its recorded disposition below. Implementation recorded means the earlier source record reports delivery, not current whole-application qualification.

The complete original inputs, assertions, collapse groups, review corrections and native evidence are preserved at `reports/surface-consistency-private/governed-doc-recovery/originals/docs/work/0963-flow-walking-cts-move-to-e2e.md`.

| Reference identifiers | Recorded disposition | Maintained home or proposed target |
| - | - | - |
| AR1 | Keep maintained coverage | `smoke.spec.ts` |
| AR2, AR3, AR4, AR6, AR7, AR8, AR9, AR23, AR24, AR25, SS1, SS2, AS45, AS47, AS48, AS51, AS179, AS180, AS181, AS182, AS183, AS186, AS187, AS188, AS221 | E2E implementation recorded | `corpus-shell.spec.ts` |
| AR5 | CT implementation recorded | `first-run-persona-dialog.ct.tsx` |
| AR10, AR11, AR12, AR15, AR17, AR18 | E2E implementation recorded | `corpus-workbench.spec.ts` |
| AR13, AR14 | Open controlled-state CT | `corpus-explore-empty.ct.tsx` |
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
| AS93, AS96, AS97, AS99 | CT partial: real-room carrier qualification remains separate | `app-shell-motion.ct.tsx` |
| AS123 | CT implementation; no system-message subject | `app-shell-appearance.ct.tsx` |
| AS161, AS162, AS200, AS201, AS202 | Open pre-mount E2E | `corpus-shell.spec.ts` |
| AS164, AS165 | Unit implementation recorded | `command-shortcut-label.test.ts` |

### Drop decisions

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

### Partial and unsupported subjects

- AS38 retains custom density inheritance. A seed theme with an invented stored density is not a valid production subject.
- AS123 retains user/assistant bubble wiring. No available corpus producer writes its system-message subject; do not claim that role covered.
- AS122 does not claim an alert dialog over a room. No shell flow opens one there; shared popup styling does not prove that journey.
- AS125 does not separately carry the phone bubble scenario. The shared breakpoint case does not invent a missing room observation.
- AS40's same-section member projection is not established by its section-change case.
- AS42 does not retain a next-Tab assertion against the reference story's invented content control.
- AS93/AS96/AS97/AS99 retain their real-room carrier limitation until current evidence qualifies the named boxes and widths.
- G9 and G34 remain unfinished as listed above. Do not infer their completion from other boot or Corpus cases.

## Harness and execution

Mount the production `AppShell` under `CtClientProviders`. Use current request-aware corpus helpers; do not reconstruct a section registry or ambient backend per spec.

Use actual corpus room reads and production navigation for room subjects. Keep provider execution scripted only at external boundaries.

Journeys use the real stack and the corpus fixture wrapper. Select the appropriate single-user/local and desktop/phone projects; a bare E2E command without its corpus fixture can skip the intended cases.

Network shaping may hold a real read or replace a failed lazy chunk. Keep the real router, parser, boundary and production request handling.

Capture a new read only when the exact procedure/input lacks a supported capture. Reuse nested cohorts and request-aware production serving first.

Run applicable native CT, unit and E2E cases for changed behavior. Preserve cold failures, native artifacts and the difference between emitted source and executed behavior.

The path-rule owner must adjudicate the proposed shell/first-run/home verification guidance. This item does not change `.claude/rules/browser-tests.md`.

## Evidence

Retain completed implementation and defect-control evidence in the private original document and Git. It does not close this work item.

The [restoration register](../plans/restoration-register/design.md) owns porting state. Preserve its Partial/Unreviewed distinctions until the named remaining cases are qualified.
