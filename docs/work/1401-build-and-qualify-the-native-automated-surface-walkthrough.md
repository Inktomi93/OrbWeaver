---
kind: work
status: doing
updated: 2026-10-30
priority: P1
area: testing
lane: surface_walk
plan: surface-walk
---

# Build and qualify the native automated surface walkthrough

## What

A local, opt-in Playwright walkthrough of the production-built app with axe, web-vitals and the existing geometry and design collectors, over synthetic data or a disposable copy of the owner snapshot. The plan is `docs/plans/surface-walk/design.md`.

The work sits on branch `wt/surface-walk` in the worktree `/home/inktomi/.codex/worktrees/surface-walk/orbweaver`: one squashed commit on main that folds in the parked Codex lane copies. Those copies are preserved on `wt/codex-surface-{walk,error,static,collector,home,character}-qualification`; delete them after this branch merges. The launcher is `scripts/surface-walk.ts` (`pnpm e2e:surface`, `pnpm e2e:surface:controls`, `pnpm e2e:surface:read`).

### Owner ruling: two phases

Phase A, now: land the infrastructure and stop.

1. The walkthrough lane builds the fast development loop: a single-journey run (`-- --project=<p> -g "<case>"`), the measurement pass without axe, design census or screenshots, and reuse of an up-to-date production build so a one-case run starts in seconds. It reports one-case wall time before and after.
2. It writes the working method into the plan (below) and a per-surface status table and driver triage into `reports/surface-walk-status.md`.
3. A `verifier` reviews the branch; then it merges. The existing journey drivers merge frozen: no extension until phase B.
4. This item then moves to `parked`, blocked on the UI program.

Phase B, parked until the UI program settles (the tone role tier and variant vocabulary, the page-template tier in the cross-surface acceptance item, and importing test labels from production): rework the journeys, then qualify.

### Method for phase B

- Coverage comes from the generic walker (tab bodies, disclosures, menus, scroll windows) over production registries, rendered controls and the walk's own unvisited-control inventory. A control that is only opened or navigated gets no bespoke code.
- Bespoke driver code exists only for an action with an outcome to assert: create, rename, delete, run, generate, and persistence across reload. Forms that need valid input, destructive actions and multi-step flows stay bespoke.
- Accessible names come from production copy modules, never hand-typed strings.
- Discover a surface's controls and success signals before writing its journey, from the unvisited-control inventory and Snap machine output (`pnpm snap ... --report`), not screenshot review.
- Iterate on one case at a time with the measurement pass. Run the full evidence pass once per surface when its journeys pass.
- Group evidence findings by rule per surface and board one item per rule per surface. Findings do not gate the walkthrough.
- Run one walk at a time on the box.
- Split lanes by driver file on Sonnet: chat (`tests/e2e/support/surface-chat.ts`), config (`tests/e2e/support/surface-config.ts`), and the rails (`tests/e2e/support/surface-sections.ts`). One owner holds the shared runner, collectors, spec registry and `tests/e2e/support/surface-character.ts`.

### Known state at parking

- The drivers are hand-scripted per control and hard-code hundreds of accessible names, so UI copy or flow changes break them. The triage in `reports/surface-walk-status.md` lists each driver function as delete (generic coverage), keep (outcome check) or shared helper.
- Collector controls pass. A synthetic desktop evidence run reached Characters, Chat and part of Config; almost every case failed on product findings, led by label and accessible-name mismatches, heading order, promoted-layer offsets and text over art. Rails were not reached.
- Chat's polish, oracle and arcade journeys are empty and pass vacuously. Chat menu items, plugin-page actions, Refinery runs, Databank ingestion and several Config categories are not exercised.
- On a phone, the bottom navigation stays focusable under the full-screen context sheet; board it with the phase A findings.

## Why

Repeated manual navigation and separate measurements consume model calls and leave fragmented review evidence. Journeys written before the UI program would be rewritten after it.

## Done when

Phase A: the fast loop, method, status table and triage are committed; the branch passes independent review and merges; this item is parked with the UI program as its blocker.

Phase B: the agreed surface, flow, device and pane coverage runs through one documented local command; Base UI, Suspense and Activity handling, the measurement lifecycle and complete accessibility output are proven; no data or artifacts reach GitHub; applicable native checks and independent review pass; coverage gaps and product findings stay explicit.

## Surface status

Source: the synthetic `desktop-1440-all-panes-evidence` walk in private run `surface-AJZ3dB`, which covered cases 0-29 of the spec. Case numbers name that run's `agent-cases/<n>.json`. Coverage counts are inventory dispositions. Two driver fixes are not yet re-run; their rows say so.

Every executed case except three fails. Almost all failures are evidence findings (axe, design audit, design population incomplete, names audit), not driver failures. Board evidence findings per rule per surface (see `docs/plans/surface-walk/design.md`, "Journey authoring method"); do not gate journey work on them.

### Per surface

| Surface | Driver file | Journey exists | Executes | Coverage gaps | Driver bugs left |
| - | - | - | - | - | - |
| Characters (incl. Tags) | `surface-character.ts` | yes, 12 areas (cases 0-11) | yes, all 12 | none in inventory; library 10/10 to editor 56/26 visited/observed; trust-actions 1 skipped, 1 excluded | none seen |
| Chat list and composer | `surface-chat.ts` | yes (12) | yes | 18 unvisited: menu-leaf activation on originals | none |
| Chat Context | `surface-chat.ts` | yes (13) | yes | 3 unvisited | none |
| Chat group room | `surface-chat.ts` | yes (14) | yes | 18 unvisited menu-leaf activations | none |
| Chat game room | `surface-chat.ts` | yes (15) | yes | 16 unvisited menu-leaf activations | none |
| Chat held arrival | `surface-chat.ts` | yes (16) | yes | none | none |
| Chat polish, oracle, arcade | `surface-chat.ts` | yes (17-19) | pass with only one not-applicable row each | journeys are effectively empty | needs real journeys or deletion |
| Chat generation and cancel | `surface-chat.ts` | yes (20) | failed | coverage failure follows the driver error | painted-text comparison fixed (display regex); re-run owed |
| Chat lifecycle commands | `surface-chat.ts` | yes (21) | yes | 4 unvisited | none |
| Chat message operations | `surface-chat.ts` | yes (22) | yes | none; 121 visited, 10 not-applicable | none; persona pre-open check passed with the hard assertion |
| Chat held media | `surface-chat.ts` | yes (23) | yes | none | none |
| Chat reading styles | `surface-chat.ts` | yes | not reached | unknown | unknown |
| Config map, recovery, settings | `surface-config.ts` | yes (24-26) | yes | none | none |
| Config personas | `surface-config.ts` | yes (28) | yes | 35 skipped, 3 excluded | none |
| Config appearance | `surface-config.ts` | yes (29) | yes | 76 skipped, 34 excluded | none; dead-CSS failures on the theme builder are a detector question (below) |
| Config chat-behavior, workloads, backup, connections, automation, admin, about, regex, worldInfo, rosterPreset, plugins | `surface-config.ts` | yes, one case per `CONFIG_GROUP_IDS` member | not reached | unknown | unknown |
| Refinery execution | `surface-sections.ts` | yes (27) | failed at the first stage | stage runs unvisited | structured-connection binding fixed; re-run owed |
| Home, Corpus and Insights, Extensions plugin pages, Databank, Presets, Refinery rail | `surface-sections.ts` | yes, one case per owned `SECTION_IDS` member | not reached | unknown | unknown |
| Boot diagnostic, multi-human admission | spec | yes | not reached | unknown | unknown |

World Info, Regex, Rosters, admin and plugin management are Config categories, not rails. Tags live in Characters. Insights live in Corpus modes.

### Evidence findings in that walk

| Source | Rule and count |
| - | - |
| axe | label-content-name-mismatch 220 (item 1403), heading-order 59, page-has-heading-one 56, region 45, scrollable-region-focusable 9, aria-required-children 2, target-size 1 |
| design audit | promoted-layer-offset 306, text-over-art 228, line-length 111, skipped-heading 59, off-grid-text 53, cohort-anatomy 46, inactive-control-legibility 27, tap-target 24, double-empty-state 22, duplicate-action-door 19, border-contrast 14, obscured-target 14, others under 5 |
| design population incomplete | 319, mostly selection-idiom unmatched-unselected on Group by tag |
| names audit | 187 |

### Detector questions

- The CSS token hygiene scan reports CodeMirror `cm-*` tokens absent from the readable CSSOM in the theme builder. CodeMirror installs its styles at runtime, likely through adopted style sheets that the scan does not read. Prove with a control, then fix the scan narrowly.
- On the phone, a full-screen context sheet covers the bottom navigation, which stays focusable and not inert. Touch findings now report these controls as occluded. Decide whether the background must be inert under that sheet.

### Driver triage

Classes: (a) navigation the generic walker already covers: delete; (b) outcome assertion: keep; (c) generic helper: keep, or move to shared when marked `*` (defined in more than one driver). The class is a first pass from each function's body: a production write, reload, file or response read is (b); a function named for a shared step or called from four or more sites is (c); a body of clicks, checkpoints and reveals is (a). Confirm each (a) before deleting it. An exported `walk*` function in (a) is a registered journey; deleting it removes a case from the spec.

#### tests/e2e/support/surface-sections.ts

Totals: a navigation 29, b outcome 24, c helper 42.

| Class | Function | Line | Lines | Call sites in file |
| - | - | - | - | - |
| a navigation | `switchListScreen` | 198 | 7 | 2 |
| a navigation | `menuBody` | 327 | 27 | 2 |
| a navigation | `terminalMenu` | 366 | 10 | 1 |
| a navigation | `inspectMenuTrigger` | 390 | 25 | 3 |
| a navigation | `contextMenuTabs` | 415 | 35 | 1 |
| a navigation | `pressableChoices` | 876 | 19 | 1 |
| a navigation | `home` | 895 | 65 | 0 |
| a navigation | `returnHome` | 960 | 7 | 1 |
| a navigation | `homeSectionDoor` | 985 | 17 | 2 |
| a navigation | `homeResume` | 1111 | 18 | 3 |
| a navigation | `homeQuickPickDoors` | 1129 | 32 | 1 |
| a navigation | `homeCreationDoors` | 1161 | 33 | 1 |
| a navigation | `homeNavigation` | 1194 | 63 | 1 |
| a navigation | `homeSavedRosters` | 1257 | 59 | 1 |
| a navigation | `corpus` | 1494 | 38 | 0 |
| a navigation | `presets` | 1532 | 41 | 0 |
| a navigation | `presetViews` | 1573 | 27 | 1 |
| a navigation | `presetDrills` | 1600 | 38 | 1 |
| a navigation | `openPresetRowMenu` | 1786 | 12 | 3 |
| a navigation | `moveDisposableSection` | 1972 | 34 | 2 |
| a navigation | `databankAdd` | 2146 | 17 | 1 |
| a navigation | `databankMaintenance` | 2172 | 25 | 2 |
| a navigation | `databankMaintenanceConfirmation` | 2197 | 8 | 1 |
| a navigation | `refinery` | 2419 | 39 | 0 |
| a navigation | `refineryWorkbench` | 2458 | 26 | 2 |
| a navigation | `readonlyDialog` | 2831 | 31 | 3 |
| a navigation | `refinerySetup` | 2873 | 11 | 1 |
| a navigation | `refineryVersions` | 2884 | 33 | 1 |
| a navigation | `walkSection` (export) | 3008 | 29 | 0 |
| b outcome | `labelMenus` | 450 | 84 | 1 |
| b outcome | `disposableLabelDelete` | 534 | 38 | 1 |
| b outcome | `homeCreatedRoom` | 1002 | 81 | 4 |
| b outcome | `corpusTarget` | 1316 | 80 | 1 |
| b outcome | `corpusMember` | 1396 | 98 | 1 |
| b outcome | `createDisposablePreset` | 1659 | 34 | 1 |
| b outcome | `renameDisposablePreset` | 1693 | 21 | 2 |
| b outcome | `runDisposablePreset` | 1714 | 48 | 1 |
| b outcome | `walkPresetCommands` | 1798 | 73 | 1 |
| b outcome | `presetSectionCommands` | 1896 | 76 | 1 |
| b outcome | `duplicateAndDeleteSection` | 2006 | 48 | 1 |
| b outcome | `exportDisposablePreset` | 2054 | 26 | 1 |
| b outcome | `deleteDisposablePreset` | 2080 | 20 | 2 |
| b outcome | `importDisposablePreset` | 2100 | 46 | 1 |
| b outcome | `databankDisposable` | 2205 | 124 | 2 |
| b outcome | `databank` | 2329 | 90 | 0 |
| b outcome | `walkRefineryExecution` (export) | 2484 | 147 | 0 |
| b outcome | `refineryStageRun` | 2631 | 33 | 1 |
| b outcome | `refineryIterate` | 2691 | 22 | 1 |
| b outcome | `refineryCopy` | 2713 | 34 | 1 |
| b outcome | `refineryApply` | 2747 | 23 | 1 |
| b outcome | `refineryVersionRestore` | 2770 | 24 | 1 |
| b outcome | `disposableRefinery` | 2794 | 37 | 1 |
| b outcome | `extensions` | 2925 | 50 | 0 |
| c helper | `usesProgrammaticScroll` | 79 | 4 | 3 |
| c helper | `expectSubject* ` | 83 | 6 | 14 |
| c helper | `observe` | 89 | 6 | 74 |
| c helper | `pane` | 95 | 4 | 64 |
| c helper | `content` | 99 | 4 | 57 |
| c helper | `ready` | 103 | 11 | 29 |
| c helper | `checkpoint* ` | 114 | 14 | 30 |
| c helper | `enter` | 128 | 26 | 9 |
| c helper | `sectionLabel` | 154 | 16 | 1 |
| c helper | `reveal` | 170 | 28 | 20 |
| c helper | `tabBodies` | 205 | 38 | 2 |
| c helper | `disclosures* ` | 243 | 52 | 1 |
| c helper | `nativeDetails* ` | 295 | 32 | 3 |
| c helper | `presetMenuFamily` | 354 | 12 | 1 |
| c helper | `menus` | 376 | 14 | 1 |
| c helper | `loadNativePages` | 572 | 28 | 2 |
| c helper | `loadCorpusCatalog` | 600 | 14 | 2 |
| c helper | `loadRefineryPicker` | 614 | 14 | 1 |
| c helper | `scrollWindows` | 628 | 51 | 1 |
| c helper | `scrollWindow` | 679 | 91 | 1 |
| c helper | `nativeWheel` | 770 | 43 | 2 |
| c helper | `interiorInapplicable` | 813 | 4 | 4 |
| c helper | `scrollGeometry` | 817 | 24 | 5 |
| c helper | `windowReached` | 841 | 17 | 2 |
| c helper | `inspect` | 858 | 7 | 31 |
| c helper | `context* ` | 865 | 11 | 8 |
| c helper | `homeOperation` | 967 | 18 | 11 |
| c helper | `homeRosterApplied` | 1083 | 4 | 1 |
| c helper | `homeChatDoors` | 1087 | 24 | 1 |
| c helper | `expectPresetIdentity` | 1638 | 21 | 3 |
| c helper | `disposablePreset` | 1762 | 13 | 2 |
| c helper | `rememberPresetCommand` | 1775 | 5 | 7 |
| c helper | `presetLibraryRow` | 1780 | 6 | 2 |
| c helper | `settlePresetMenus` | 1871 | 25 | 1 |
| c helper | `databankLibrary` | 2163 | 9 | 6 |
| c helper | `refineryPayloadWitness` | 2664 | 11 | 1 |
| c helper | `refineryRequestCursor` | 2675 | 4 | 2 |
| c helper | `refineryRequestReceipt` | 2679 | 12 | 2 |
| c helper | `refineryDialogs` | 2862 | 11 | 1 |
| c helper | `dismissContext` | 2917 | 8 | 7 |
| c helper | `platformGestures` | 2975 | 28 | 1 |
| c helper | `sectionJourney` | 3003 | 5 | 4 |

#### tests/e2e/support/surface-chat.ts

Totals: a navigation 20, b outcome 21, c helper 48.

| Class | Function | Line | Lines | Call sites in file |
| - | - | - | - | - |
| a navigation | `menuTerminal` | 374 | 10 | 1 |
| a navigation | `inspectImagineModes` | 426 | 22 | 1 |
| a navigation | `composerCheckpoint` | 683 | 12 | 1 |
| a navigation | `contextCells` | 809 | 28 | 2 |
| a navigation | `sidecar` | 837 | 43 | 1 |
| a navigation | `inspectSidecarColumn` | 880 | 28 | 1 |
| a navigation | `sidecarColumnReady` | 908 | 7 | 2 |
| a navigation | `inspectSidecarSheet` | 915 | 25 | 1 |
| a navigation | `inspectPlugins` | 940 | 19 | 1 |
| a navigation | `reachMessage` | 1025 | 79 | 3 |
| a navigation | `readMessage` | 1104 | 54 | 1 |
| a navigation | `missingLibrarySubject` | 1272 | 12 | 1 |
| a navigation | `walkChat` (export) | 1306 | 21 | 0 |
| a navigation | `walkChatContext` (export) | 1327 | 14 | 0 |
| a navigation | `walkChatGroup` (export) | 1341 | 18 | 0 |
| a navigation | `walkChatGame` (export) | 1359 | 18 | 0 |
| a navigation | `walkChatMessageOperations` (export) | 1952 | 4 | 0 |
| a navigation | `walkChatArcade` (export) | 2241 | 65 | 0 |
| a navigation | `selectHeldRoom` | 2466 | 15 | 2 |
| a navigation | `walkChatMedia` (export) | 2610 | 160 | 0 |
| b outcome | `roomRow` | 141 | 59 | 3 |
| b outcome | `emptySearch` | 259 | 30 | 1 |
| b outcome | `safeDraftDrill` | 504 | 19 | 1 |
| b outcome | `composerMenus` | 642 | 41 | 3 |
| b outcome | `readCanon` | 986 | 15 | 26 |
| b outcome | `walkChatReading` (export) | 1377 | 50 | 0 |
| b outcome | `commandExports` | 1463 | 56 | 1 |
| b outcome | `commandEdit` | 1519 | 31 | 1 |
| b outcome | `walkChatCommands` (export) | 1550 | 119 | 0 |
| b outcome | `messageSavedReply` | 1747 | 69 | 1 |
| b outcome | `messageEdit` | 1816 | 17 | 2 |
| b outcome | `messageFork` | 1833 | 26 | 2 |
| b outcome | `messageVisibilityAndReaction` | 1859 | 54 | 2 |
| b outcome | `expectClipboardContent` | 1913 | 4 | 1 |
| b outcome | `messageCopyAndDelete` | 1917 | 35 | 2 |
| b outcome | `runChatMessageOperations` | 1956 | 128 | 2 |
| b outcome | `disposableRoom` | 2093 | 28 | 7 |
| b outcome | `walkChatGeneration` (export) | 2121 | 120 | 0 |
| b outcome | `walkChatOracle` (export) | 2323 | 90 | 0 |
| b outcome | `walkChatPolish` (export) | 2413 | 53 | 0 |
| b outcome | `walkChatArrival` (export) | 2481 | 103 | 0 |
| c helper | `expectChat` | 67 | 6 | 19 |
| c helper | `record* ` | 73 | 6 | 65 |
| c helper | `checkpoint* ` | 79 | 5 | 31 |
| c helper | `publish` | 84 | 16 | 10 |
| c helper | `readChats` | 100 | 19 | 2 |
| c helper | `displayTitle` | 119 | 4 | 3 |
| c helper | `subjectCoverage` | 123 | 18 | 2 |
| c helper | `enterChatsList` | 200 | 8 | 6 |
| c helper | `openRoom` | 208 | 41 | 14 |
| c helper | `listMenu` | 249 | 10 | 1 |
| c helper | `messageLeafName` | 289 | 9 | 1 |
| c helper | `accountMessageLeaves` | 298 | 29 | 1 |
| c helper | `inspectMenu` | 327 | 47 | 2 |
| c helper | `disabledControl` | 384 | 4 | 2 |
| c helper | `inspectTrigger` | 388 | 32 | 5 |
| c helper | `dismissMenu` | 420 | 6 | 1 |
| c helper | `safeDialogWitness` | 448 | 15 | 1 |
| c helper | `safeDialogDrill` | 463 | 25 | 2 |
| c helper | `safeSelectionDrill` | 488 | 16 | 1 |
| c helper | `safeEditDrill` | 523 | 22 | 1 |
| c helper | `pluginContextReady` | 545 | 8 | 3 |
| c helper | `safePanelsDrill` | 553 | 26 | 1 |
| c helper | `runSafeCommand` | 579 | 23 | 1 |
| c helper | `safeMenuDrills` | 602 | 40 | 1 |
| c helper | `activeContext` | 695 | 4 | 11 |
| c helper | `contextReady` | 699 | 7 | 4 |
| c helper | `closeContextOverlay` | 706 | 18 | 10 |
| c helper | `disclosures* ` | 724 | 53 | 1 |
| c helper | `nativeDetails* ` | 777 | 32 | 3 |
| c helper | `context* ` | 959 | 27 | 6 |
| c helper | `wheel` | 1001 | 5 | 5 |
| c helper | `scrollViewport` | 1006 | 15 | 5 |
| c helper | `mountedMessageSignature` | 1021 | 4 | 3 |
| c helper | `readingChrome` | 1158 | 50 | 2 |
| c helper | `independentMessageMenu` | 1208 | 11 | 1 |
| c helper | `readingPosition` | 1219 | 14 | 2 |
| c helper | `addRoleWitnesses` | 1233 | 16 | 1 |
| c helper | `capabilityStatus` | 1249 | 7 | 2 |
| c helper | `groupSubject` | 1256 | 16 | 1 |
| c helper | `chatCase` | 1284 | 22 | 4 |
| c helper | `commandRoom` | 1427 | 9 | 9 |
| c helper | `commandMenu* ` | 1436 | 19 | 6 |
| c helper | `commandMenuOwner` | 1455 | 8 | 2 |
| c helper | `messageOperationMenu` | 1669 | 72 | 15 |
| c helper | `messageOperationDone` | 1741 | 6 | 11 |
| c helper | `displayedText` | 2084 | 9 | 1 |
| c helper | `runPlacedCommand` | 2306 | 17 | 4 |
| c helper | `mediaNativeFacts` | 2584 | 26 | 3 |

#### tests/e2e/support/surface-character.ts

Totals: a navigation 9, b outcome 22, c helper 15.

| Class | Function | Line | Lines | Call sites in file |
| - | - | - | - | - |
| a navigation | `creationDialogs` | 244 | 10 | 1 |
| a navigation | `tagsJourney` | 302 | 22 | 1 |
| a navigation | `toggleGreetingStudio` | 355 | 5 | 3 |
| a navigation | `greetingJourney` | 360 | 14 | 1 |
| a navigation | `facetJourney` | 482 | 33 | 1 |
| a navigation | `relationsJourney` | 515 | 35 | 2 |
| a navigation | `trustJourney` | 698 | 12 | 2 |
| a navigation | `sourceCharacter` | 825 | 28 | 1 |
| a navigation | `walkCharacterArea` (export) | 1333 | 44 | 0 |
| b outcome | `openCard` | 136 | 17 | 7 |
| b outcome | `listJourney` | 189 | 55 | 1 |
| b outcome | `createRefusalJourney` | 254 | 48 | 1 |
| b outcome | `rowAndBulkJourney` | 324 | 31 | 1 |
| b outcome | `greetingGenerationJourney` | 374 | 95 | 1 |
| b outcome | `lookJourney` | 550 | 38 | 1 |
| b outcome | `snapshotJourney` | 626 | 20 | 1 |
| b outcome | `historyFailureJourney` | 646 | 23 | 1 |
| b outcome | `lookFailureJourney` | 669 | 29 | 1 |
| b outcome | `actionsJourney` | 710 | 50 | 1 |
| b outcome | `recoveryJourney` | 800 | 25 | 1 |
| b outcome | `withDisposableCharacter` | 853 | 24 | 1 |
| b outcome | `createCommandCharacter` | 887 | 27 | 1 |
| b outcome | `duplicateCommandCharacter` | 914 | 48 | 1 |
| b outcome | `selectCommandCards` | 962 | 13 | 3 |
| b outcome | `tagCommandCharacters` | 975 | 41 | 1 |
| b outcome | `exportCommandCharacter` | 1016 | 47 | 1 |
| b outcome | `archiveCommandCharacters` | 1063 | 50 | 1 |
| b outcome | `convertCommandCharacter` | 1113 | 50 | 1 |
| b outcome | `deleteCommandCharacters` | 1163 | 38 | 1 |
| b outcome | `cleanupCommandSubjects` | 1201 | 54 | 1 |
| b outcome | `disposableArea` | 1280 | 53 | 1 |
| c helper | `expectSubject* ` | 82 | 5 | 11 |
| c helper | `alternateFont` | 87 | 8 | 2 |
| c helper | `record* ` | 95 | 6 | 52 |
| c helper | `recordState` | 101 | 11 | 15 |
| c helper | `closeOverlay` | 112 | 8 | 10 |
| c helper | `openList` | 120 | 16 | 10 |
| c helper | `contextTab` | 153 | 27 | 15 |
| c helper | `dialogCancel` | 180 | 9 | 12 |
| c helper | `inspectorWitness` | 469 | 13 | 1 |
| c helper | `releaseHistory` | 588 | 10 | 1 |
| c helper | `historyJourney` | 598 | 28 | 1 |
| c helper | `originalContextJourney` | 760 | 40 | 1 |
| c helper | `completedCommand` | 877 | 4 | 6 |
| c helper | `commandMenu* ` | 881 | 6 | 6 |
| c helper | `commandsJourney` | 1255 | 25 | 1 |

#### tests/e2e/support/surface-config.ts

Totals: a navigation 18, b outcome 6, c helper 19.

| Class | Function | Line | Lines | Call sites in file |
| - | - | - | - | - |
| a navigation | `folderChooser` | 188 | 25 | 1 |
| a navigation | `inspectControls` | 227 | 42 | 3 |
| a navigation | `inspectMenus` | 269 | 30 | 1 |
| a navigation | `inspectSelects` | 299 | 20 | 1 |
| a navigation | `neutralDialogs` | 375 | 27 | 2 |
| a navigation | `themeBuilder` | 402 | 36 | 1 |
| a navigation | `connectionAuthoring` | 438 | 26 | 1 |
| a navigation | `personas` | 464 | 46 | 1 |
| a navigation | `aboutOnly` | 554 | 11 | 1 |
| a navigation | `themeFileChooser` | 640 | 28 | 1 |
| a navigation | `appearanceSectionScroll` | 668 | 30 | 2 |
| a navigation | `appearanceJourney` | 698 | 104 | 1 |
| a navigation | `groupJourney` | 802 | 53 | 1 |
| a navigation | `originalEntry` | 914 | 6 | 1 |
| a navigation | `worldInfoRecovery` | 1076 | 32 | 1 |
| a navigation | `walkConfigCategory` (export) | 1172 | 8 | 0 |
| a navigation | `walkConfigRecovery` (export) | 1180 | 7 | 0 |
| a navigation | `walkConfigSettings` (export) | 1187 | 6 | 0 |
| b outcome | `regex` | 855 | 31 | 1 |
| b outcome | `rosterJourney` | 886 | 28 | 1 |
| b outcome | `openBook` | 920 | 10 | 1 |
| b outcome | `worldInfo` | 930 | 115 | 1 |
| b outcome | `librarySetting` | 1045 | 31 | 1 |
| b outcome | `walkConfigMap` (export) | 1149 | 23 | 0 |
| c helper | `checkpoint* ` | 41 | 5 | 26 |
| c helper | `closeContext` | 46 | 7 | 2 |
| c helper | `map` | 53 | 18 | 20 |
| c helper | `category` | 71 | 27 | 11 |
| c helper | `inViewport` | 98 | 15 | 4 |
| c helper | `unavailableControl` | 113 | 52 | 1 |
| c helper | `identity` | 165 | 19 | 13 |
| c helper | `controls` | 184 | 4 | 4 |
| c helper | `observedControl` | 213 | 14 | 2 |
| c helper | `scroll` | 319 | 28 | 10 |
| c helper | `nestedScroll` | 347 | 28 | 5 |
| c helper | `remainingDisclosures` | 510 | 18 | 1 |
| c helper | `disclosures* ` | 528 | 26 | 5 |
| c helper | `teacher` | 565 | 25 | 8 |
| c helper | `groupDetails` | 590 | 10 | 1 |
| c helper | `sameLabelCensusControl` | 600 | 28 | 1 |
| c helper | `collectionDetails` | 628 | 12 | 1 |
| c helper | `configCase` | 1108 | 15 | 4 |
| c helper | `configInventory` | 1123 | 26 | 1 |

## Evidence

Filled at landing: what ran and where its output is.
