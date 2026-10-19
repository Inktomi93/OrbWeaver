# 963 flow-walking CT inventory

Scope: CTs that mount a route, the app root or the app shell and drive it over stubbed `routeTrpc` or `page.route` calls. Counts are test sites (a `for` loop is one site). Titles were read for every site; bodies were read for the routes directory and the moved group.

## Survey evidence

- `ast-grep run -l tsx -p 'mount(<$S $$$ />)' tests`: 5517 matches over 723 tsx files under `tests/`. The same pattern with `-l ts` cannot parse JSX and returns nothing (3703 ts files), so tsx is the only language that can hold a mount.
- `ast-grep -l tsx -p 'page.route($$$)' tests`: 196 matches in 70 files. `-l ts`: 26 matches.
- Route and shell stories mounted: `HomePageStory`, `HomePageReadinessStory`, `ProductionRouterStory`, `ProductionRouterAliasStory`, `ProductionRouterOverlapStory`, `RouterTokenHandoffStory`, `ProductionRouterCrashReportStory`, `RegionSuspenseStory` (all in `tests/legacy/client/routes/_ct-stories.tsx`), `AppShell*Story` (`tests/legacy/client/features/app-shell/_ct-stories.tsx`, 19 `<AppShell>`/`<RouterProvider>` sites), `Config*ShellStory` and `LoginConfigTransitionStory`.
- `pnpm ast jsx <Story>` returns 0 hits (scanned=7601) for every story name: the verb resolves production declarations only, so it cannot see test stories. The ast-grep scan is the evidence.
- `codegraph_explore` on the app-root, app-shell and route-pending files returned the router and shell blast radius (`bindRouteCrashReporter` is used only by `main.tsx` and the routes story).

## Counts by class

| File | Sites | Flow (moved) | Flow (next leg) | Stays CT | Unsure |
| - | - | - | - | - | - |
| `tests/legacy/client/routes/app-root.ct.tsx` | 33 | 3 | 6 | 20 | 4 |
| `tests/legacy/client/routes/router.ct.tsx` | 5 | 0 | 0 | 3 | 2 |
| `tests/legacy/client/routes/route-pending.ct.tsx` | 3 | 0 | 0 | 3 | 0 |
| `tests/legacy/client/routes/stuck-splash.suite.ct.tsx` | 3 | 0 | 0 | 3 | 0 |
| `tests/legacy/client/features/app-shell/surfaces/app-shell.ct.tsx` | 222 | 0 | 0 | 218 | 4 |
| config shell and login transition CTs (4 files) | 6 | 0 | 0 | 0 | 6 |
| Total | 272 | 3 | 6 | 247 | 16 |

## app-root.ct.tsx (line numbers are the file before this commit)

- Flow, moved: 307 chats no-selection state; 326 library to chat launch; 422 temp tile ceremony and round trip.
- Flow, next leg: 1008 Corpus workbench modes on desktop; 1047 keyboard mode switch; 1058 Back from an Insights drill keeps search and sort; 1091 Corpus on a phone; 1166 Insights drill on a phone; 1243 Labels editor push and Back on a phone. These need Insights and Labels data that the corpus must be checked for.
- Unsure: 211 fresh Home (the structure is a flow, the teaching empty states need an empty library the corpus does not have); 504 persona owner never sees the gate; 551 and 591 joiner persona ask (need a local invite token).
- Stays, measurement: 242 cold-load focus; 270 phone chips; 640 and 656 census at 320 and 390 and desktop; 958 and 977 per-section census loops; 1121, 1140, 1210, 1226, 1366 focus placement; 1301 and 1328 registry census.
- Stays, hard-state or race: 288 held first reads; 473 zero personas; 1198 empty leaderboard; 1278 name in flight; 1347 pending content; 1474 slow list read. Stays, component: 1403 warm retention of the editor node.

## router.ct.tsx

- 40 slow `/me` on a `/join` landing: stays (slow response, history length). 76 overlapping navigations: stays (race). 95 token handoff: stays (a probe in a hand-built router, component).
- Unsure: 66 `/analytics` alias heals before the auth redirect (signed-out; the corpus owner is signed in); 116 OIDC pending join (the e2e matrix has no OIDC project).

## Other files

- `route-pending.ct.tsx`: 12 component, 19 and 38 reduced-motion animation measurement.
- `stuck-splash.suite.ct.tsx`: 8 failed chunk, 30 render crash, 46 unbounded suspense. All are states a real backend does not produce on demand.
- `app-shell.ct.tsx` mounts through `CtFakeSectionRegistry` with story-injected sections. The 218 stay-sites are chrome, toast geometry, panel clamp, focus, modal, and appearance measurement. Unsure: 406 rail click switches slots, 559 Settings routes as a section, 1651 and 1819 phone You-sheet navigation (all inside the fake registry, so they cannot see a real wire; likely stay).
- Unsure, config and login shells: `config-teacher.ct.tsx` (1), `config-section.ct.tsx` (3), `config-content-surface.ct.tsx` (1), `login-shell-anchor.ct.tsx` (1).

## Moved group: Home launch flows

New spec: `tests/e2e/corpus-home-launch.spec.ts` (tag `@smoke`, corpus-gated). Every case is kept.

| Deleted CT case (app-root.ct.tsx) | e2e case |
| - | - |
| 307 the chats section's own no-selection state is the slim one | the chats section's own no-selection state offers one new-chat door and no composer |
| 326 picking a character in the library creates the chat and lands in it | picking a character in the library creates the chat and lands in it |
| 422 the temp tile starts its room through the shared picker, and the unsent line survives a rail round-trip | the temp tile starts its room through the shared picker and the unsent line survives a section round-trip |

Differences that are real:

- The Chat door resumes an existing room, and every corpus character already has chats. The library case therefore creates a chat-less probe character with a known greeting and removes it in a `finally`; the CT stubbed the character.
- The e2e asserts the greeting row that the real `startChat` seeded, and exactly one `chat.startChat` request, where the CT counted a stub.
- On a phone the Chats section opens on its list screen, so the no-selection case is skipped there (`test.skip(isMobile)` with the reason in code). The phone has no Home rail button, so the temp case reaches Home and Chats through the command palette. The CT ran at the desktop viewport only.
- The deleted CT left unused helpers: `IDENTITY_STUB`, `ONE_CHARACTER`, `createdRoomRoutes`, `PREVIEW_FIT_STUB` and five imports are deleted with it. `createdChat` and `CREATED_CHAT_ID` stay, because the census story still uses them.

## Results

- e2e, desktop and phone, bubble style, single-user (`scripts/corpus-fixture.ts e2e -- tests/e2e/corpus-home-launch.spec.ts --project=corpus-desktop-bubble --project=corpus-phone-bubble`): 5 passed, 1 skipped (phone no-selection, by design). Earlier runs failed on the resume behaviour and on the palette shortcut being ignored in a text field; both were fixed in the spec.
- Planted defect on desktop: `title="No chat selected"` changed to `"No chat chosen"` in `chat-landing-surface.tsx`, and `Start a temp chat` to `Start a scratch chat` in `home-temp-chat-tile-body.tsx`. Result: no-selection and temp cases failed, the library case stayed green (it derives its door name from `chatWithActionName`, so a label change moves with production). Both edits were restored; `git status` showed no change under `packages/`.
- CT: `pnpm test:ct --legacy tests/legacy/client/routes/app-root.ct.tsx`: 46 passed, 0 failed, 0 flaky, 0 skipped.
- Not run: the other 28 project cells (single-user and local, other chat styles). CI runs the matrix.
