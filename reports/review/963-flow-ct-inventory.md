# 963 flow-walking CT inventory

Scope: CTs that mount a route, the app root or the app shell and drive it over stubbed `routeTrpc` or `page.route` calls. Counts are test sites (a `for` loop is one site). Every unsure case was read in full for the final ruling; the stay-sites in `app-shell.ct.tsx` and the late `app-root.ct.tsx` cases were classified from titles plus the bodies read for the moved and unsure cases.

## Survey evidence

- `ast-grep run -l tsx -p 'mount(<$S $$$ />)' tests`: 5517 matches over 723 tsx files. `-l ts` cannot parse JSX and returns nothing over 3703 ts files, so tsx is the only language that can hold a mount.
- `ast-grep -l tsx -p 'page.route($$$)' tests`: 196 matches in 70 files. `-l ts`: 26 matches.
- Route and shell stories mounted: `HomePageStory`, `HomePageReadinessStory`, `ProductionRouter*Story`, `RouterTokenHandoffStory`, `RegionSuspenseStory` (`tests/legacy/client/routes/_ct-stories.tsx`), `AppShell*Story` (`tests/legacy/client/features/app-shell/_ct-stories.tsx`), `Config*ShellStory`, `LoginConfigTransitionStory`.
- `pnpm ast jsx <Story>` returns 0 hits (scanned=7601) because it resolves production declarations only. The ast-grep scan is the evidence.
- Corpus data (leg 2): `tests/support/node/corpus.ts` reconciles stats after seeding (`seedCorpusStatsSettings`, then `seedStats`), so the corpus serves a ranked leaderboard (total 2) and a populated overview. `tests/support/node/corpus-seed.ts` seeds one tag, "Orbital ledger", attached to a character, chat, persona, preset and world book. The corpus has no empty-insights state.

## Final counts

| Class | Sites |
| - | - |
| Moved to e2e (leg 1: 3, leg 2: 3) | 6 |
| Flow, move later (needs a local-mode or phone spec) | 4 |
| Stays CT | 262 |
| Total | 272 |

Per file:

| File | Sites | Moved | Move later | Stays |
| - | - | - | - | - |
| `routes/app-root.ct.tsx` | 33 | 6 | 2 | 25 |
| `routes/router.ct.tsx` | 5 | 0 | 1 | 4 |
| `routes/route-pending.ct.tsx` | 3 | 0 | 0 | 3 |
| `routes/stuck-splash.suite.ct.tsx` | 3 | 0 | 0 | 3 |
| `app-shell/surfaces/app-shell.ct.tsx` | 222 | 0 | 0 | 222 |
| config shell and login transition CTs | 6 | 0 | 1 | 5 |

## Moved cases and their specs

| Deleted CT case (`app-root.ct.tsx`) | New e2e case |
| - | - |
| the chats section's own no-selection state is the SLIM one | `corpus-home-launch.spec.ts`: the chats section's own no-selection state offers one new-chat door and no composer |
| picking a character in the library creates the chat and lands in it | `corpus-home-launch.spec.ts`: picking a character in the library creates the chat and lands in it |
| the temp tile starts its room through the SHARED picker, and the unsent line survives a rail round-trip | `corpus-home-launch.spec.ts`: the temp tile starts its room through the shared picker and the unsent line survives a section round-trip |
| a user who owns a persona never sees the gate | `corpus-home-launch.spec.ts`: a user who owns a persona never sees the first-run gate |
| desktop: Back from an Insights drill keeps the leaderboard's search and sort | `corpus-workbench.spec.ts`: Back from an Insights drill keeps the leaderboard's search and sort (desktop) |
| Labels: a tag pushes its editor, and Back restores the finder with its filter | `corpus-workbench.spec.ts`: Labels: a tag pushes its editor, and Back restores the finder with its filter (phone) |

Real differences from the CT cases:

- The Chat door resumes an existing room and every corpus character has chats, so the library case mints a chat-less probe character with a known greeting and removes it.
- The drill case reads its character and search term from the real leaderboard (first ranked row) instead of the stub "Bolt"; the tag case reads the corpus tag. The CT's stubbed `stats.character: null` ("no stats yet") is not part of this case.
- The gate case uses the desktop rail-foot name as its settle barrier; a phone has only the You tab, so its barrier is the Home recents tile.
- The no-selection case is skipped on a phone (the Chats section opens on its list screen). The drill case runs on desktop only and the tag case on a phone only, as the CTs' viewports did.

## Rulings on the 16 cases that were unsure

| Case | Ruling | Reason |
| - | - | - |
| app-root 211 fresh state lands on Home | stay | Its teaching empty states ("Create your first character", "Add your first document") need an empty library the corpus does not have |
| app-root 504 owner persona never sees the gate | moved | Corpus owner has a current persona |
| app-root 551 joiner with no persona names one first | move later | Real flow in local mode: invite, signup, first-run ask, join dialog. Needs the local project (`corpus-local-*` cells), which this leg may not run |
| app-root 591 control: joiner who speaks gets the join dialog | move later | Same spec as 551 |
| router 66 `/analytics` alias heals before the auth redirect | move later | Signed-out flow. Target: a local-project spec using a cookie-less `browser.newContext()`; single-user never signs out |
| router 116 OIDC pending join Not now | stay | Needs the OIDC project, which `tests/e2e/support/modes.ts` documents as absent. Target: that project when it exists |
| app-shell 406 rail click switches CONTENT and LIST slots | stay | Fake registry strings ("corpus content pane"); Activity pane keeping is component behaviour |
| app-shell 559 rail foot has no modal trigger, Settings routes as a section | stay | Shell chrome in a fake registry; the real Settings route is covered by `corpus-settings.spec.ts` |
| app-shell 1651 You tab opens the sheet | stay | Persona sheet projection over stubbed auth; component |
| app-shell 1819 Refinery row in the You sheet | stay | Coarse-pointer row-floor measurement |
| config-teacher docked 1040px shell | stay | Title-floor geometry measurement |
| config-section 134 cold phone arrival lands on the LIST | stay | Layout-effect ordering at mount; a state a backend does not produce |
| config-section 150 phone back stack pops one rung at a time | move later | Real flow (World Info, book, member, back). The corpus has world books; needs a phone-only spec |
| config-section 208 phone draws no in-content drill row | stay | Absence-of-chrome assertions; component |
| config-content-surface door focus and in-viewport | stay | Focus and viewport measurement |
| login-shell-anchor card keeps its top edge while config resolves | stay | Held response plus layout-shift measurement |

Original flow candidates that stay, and why:

- app-root 804 (desktop Corpus modes) and 887, 909 (phone Corpus landing, Insights list door): they assert "No insights yet" and "No stats yet" beside a populated leaderboard. The corpus has stats for its ranked characters, so that empty dashboard cannot be produced; moving them would drop those assertions. Hard-state.
- app-root 843 (keyboard mode switch moves focus into CONTENT): focus order is CT by the layer table.

## Verification

- Floor for the moved cases: `corpus-home-launch.spec.ts` and `corpus-workbench.spec.ts` on `corpus-desktop-bubble` and `corpus-phone-bubble`: 9 passed, 3 skipped by design, 0 failed.
- Planted defects (restored afterwards): `Sort by` to `Order by` in `analytics-list-surface.tsx` turned the drill case red on desktop; `Filter tags` to `Search tags` in `labels-list-surface.tsx` turned the tag case red on the phone. Leg 1 planted the no-selection and temp-tile labels. The gate and library cases derive their names from production and have no planted red; the library case failed for real on the resume behaviour before the probe character was added.
- `pnpm test:ct --legacy tests/legacy/client/routes/app-root.ct.tsx`: 43 passed, 0 failed. The unfed-read ratchet needed `regex.listForCharacter` fed in the held-member case; that case now stubs it.
- `tsconfig.tests-legacy-dom.json` run bare: 86 errors, none in `app-root.ct.tsx`.
- Not run: the other 30 corpus project cells, including all local-mode cells. CI runs the matrix.
