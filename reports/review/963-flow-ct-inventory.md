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
| Moved to e2e (leg 1: 3, leg 2: 3, leg 3: 3, leg 5: 1) | 10 |
| Flow, move later | 0 |
| Stays CT | 262 |
| Total | 272 |

Per file:

| File | Sites | Moved | Move later | Stays |
| - | - | - | - | - |
| `routes/app-root.ct.tsx` | 33 | 8 | 0 | 25 |
| `routes/router.ct.tsx` | 5 | 1 | 0 | 4 |
| `routes/route-pending.ct.tsx` | 3 | 0 | 0 | 3 |
| `routes/stuck-splash.suite.ct.tsx` | 3 | 0 | 0 | 3 |
| `app-shell/surfaces/app-shell.ct.tsx` | 222 | 0 | 0 | 222 |
| config shell and login transition CTs | 6 | 1 | 0 | 5 |

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
| app-root 551 joiner with no persona names one first | moved (leg 5, item 1083) | Real flow in local mode: invite, signup, first-run ask, join dialog. Needs the local project (`corpus-local-*` cells), which this leg may not run |
| app-root 591 control: joiner who speaks gets the join dialog | moved (leg 3) | `corpus-joiner.local.spec.ts` |
| router 66 `/analytics` alias heals before the auth redirect | moved (leg 3) | Signed-out flow. Target: a local-project spec using a cookie-less `browser.newContext()`; single-user never signs out |
| router 116 OIDC pending join Not now | stay | Needs the OIDC project, which `tests/e2e/support/modes.ts` documents as absent. Target: that project when it exists |
| app-shell 406 rail click switches CONTENT and LIST slots | stay | Fake registry strings ("corpus content pane"); Activity pane keeping is component behaviour |
| app-shell 559 rail foot has no modal trigger, Settings routes as a section | stay | Shell chrome in a fake registry; the real Settings route is covered by `corpus-settings.spec.ts` |
| app-shell 1651 You tab opens the sheet | stay | Persona sheet projection over stubbed auth; component |
| app-shell 1819 Refinery row in the You sheet | stay | Coarse-pointer row-floor measurement |
| config-teacher docked 1040px shell | stay | Title-floor geometry measurement |
| config-section 134 cold phone arrival lands on the LIST | stay | Layout-effect ordering at mount; a state a backend does not produce |
| config-section 150 phone back stack pops one rung at a time | moved (leg 3) | Real flow (World Info, book, member, back). The corpus has world books; needs a phone-only spec |
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

## Leg 3 (item 1080)

Moved, one CT case each deleted:

| Deleted CT case | New e2e case | Project |
| - | - | - |
| `app-root.ct.tsx` control: a joiner who already speaks as a persona gets the join dialog at once | `corpus-joiner.local.spec.ts` (same title) | local, desktop and phone |
| `router.ct.tsx` the /analytics alias heals to Corpus Insights before the auth redirect | `corpus-signed-out.local.spec.ts` (heals before the redirect and survives sign-in) | local, desktop and phone |
| `config-section.ct.tsx` the phone's back stack pops ONE rung at a time | `corpus-config-back-stack.spec.ts` (same title) | single-user, phone only |

Differences from the CT cases:

- The local `testMatch` in `tests/e2e/support/modes.ts` now follows the convention `corpus-*.local.spec.ts` for a corpus run (it listed one spec). A non-corpus run keeps `*.local.spec.ts`.
- A loopback request with no relay tell resolves as the box owner even with no cookie, so the signed-out browser sends an empty `forwarded` header. The assertion is stronger than the CT's: after sign-in the app opens on Corpus Insights, rather than a story's probe text.
- The joiner is a real account created by the admin verb, with a real persona and invite; each project mints its own handle because the cells share one local database.
- The back-stack case reads the corpus book and its first entry; the CT stubbed both.
- `ProductionRouterAliasStory` and the CT constants only the deleted cases used are deleted with them.

Stays, with evidence:

- app-root 551 (a joiner with no persona meets the first-run ask; moved in leg 5 below): was not reachable on an automation stack by owner ruling. `domain/persona/seeder/default.ts` keeps its auto-create arm on exactly where `E2E_HARNESS=on` (header, owner ruling of 2026-08-03), so a persona is re-created on the next request after every delete. Observed in the local cell: `persona.list` returned a seeded "Traveler" after the test had deleted the account's personas and nulled both seed pointers. A real stack asks; an e2e stack never does. The case stays in CT as hard-state.
- router 116 (OIDC pending join): not built. An OIDC e2e project needs, at minimum:
  1. an HTTPS mock issuer, because `entry/http/oidc.ts` calls `discovery()` without `allowInsecureRequests`, so an `http://127.0.0.1` issuer is refused by the real client;
  2. a certificate the server child trusts (a generated CA through the child's environment) and a loopback entry in the egress and private-endpoint allowlists;
  3. authorize, token and JWKS endpoints, with RS256 id_tokens that echo the state and nonce and carry the username, uid and groups claims the server maps;
  4. a new project in `modes.ts` with `AUTH_MODE=oidc`, its own ports, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URIS`, `OIDC_SIGNUP=on` and an invite for the pending-join arm, plus global-setup seeding for it.
  That is more than one project and a small mock: a TLS trust chain and four moving parts. The comment in `modes.ts` already refuses an env-selectable substitute for the token exchange, which rules out the shortcut of an insecure issuer.

Verification (leg 3):

- Local cells `corpus-local-desktop-bubble` and `corpus-local-phone-bubble`: control and alias cases passed on both. Single-user `corpus-phone-bubble`: back stack passed. The joiner and alias specs were reformatted by Biome after their last green run; the code is unchanged.
- Planted defects, restored afterwards: `healCorpusModeFrom(params.section)` replaced by `healCorpusModeFrom("chats")` in `router.tsx` turned the alias case red (Insights radio `aria-checked` false); inverting `useViewerCanSpeak` turned the control red (join dialog never opened); renaming the World Info group label to "Lore" turned the back stack red. A first plant that deleted the `healCorpusModeFrom` call left an unused import and a Vite error overlay, so it was replaced as above.
- `pnpm test:ct --legacy` on `app-root.ct.tsx`, `router.ct.tsx` and `config-section.ct.tsx`: 46 passed and 2 failed. The two failures are in `app-root.ct.tsx` ("every registered roster and Corpus mode renders a structural band and search" and "roster census rejects an omitted search"): the story's census navigation renders no buttons, so the production section registry returned no list-bearing sections. They passed on the leg 2 tree, they do not touch any case deleted here, and `git diff HEAD` for `packages/` is empty; the cause is most likely in the main commits fast-forwarded into this branch before leg 3. Reported, not fixed.
- Not run: the other local and single-user cells; CI runs the matrix.

## Planted defects for the two home-launch cases without one (leg 4)

Both ran on `corpus-desktop-bubble` and `corpus-phone-bubble`; both plants were restored and `git status` is clean.

- Library launch (`picking a character in the library creates the chat and lands in it`): an early `return` before `startChat` in `chatWith` (`character-library-surface.tsx`), so the Chat door neither creates nor lands. Red on both cells: `waitForResponse` for `chat.startChat` timed out.
- Persona gate absence (`a user who owns a persona never sees the first-run gate`): the gate's stand-down condition in `first-run-persona-dialog.tsx` forced false from the third document load of a tab, so a set-up viewer meets the gate over the app. Red on both cells, at the settle barrier on line 62: the open gate modal hides the rail and the You tab, so the barrier fails before the `toHaveCount(0)` line is reached. The load-count condition exists because a plain "always open" gate also breaks the harness warm-up and the page fixture's own setup, which run before the case.

## Leg 5 (item 1083): the first-run ask on an e2e stack

Moved: `app-root.ct.tsx` "a joiner with no persona names one in the first-run ask before the join dialog opens" to `tests/e2e/corpus-joiner.local.spec.ts` (same title, local project, desktop and phone). The CT case and its helpers (`arriveWithInvite`, the invite token and preview constants, `settingsWithSeeds`, two imports) are deleted. The earlier "stays" ruling for this case is superseded by the owner ruling recorded in item 1083.

The opt-out:

- Server: `E2E_FIRST_RUN_ASK_HANDLES`, an optional comma list in `foundation/env/index.ts`. `isAutomatedPersonaSeedEnabled(handle)` is now `!asksFirstRun && (E2E_HARNESS=on || DEV_SEED=on)`, so the list can only subtract from an automation arm that is already on; no value turns the auto-seed on, and a stack with neither stamp is unchanged. The seeder policy takes the principal (`autoSeedEnabled(principal)`) so the compose wiring can pass the handle.
- Harness: `tests/e2e/support/modes.ts` names the accounts once. `firstRunAskHandle(projectName)` derives the handle per local cell, `FIRST_RUN_ASK_HANDLES` lists every local cell's handle, and the local project's `webServerEnv` sends them as `E2E_FIRST_RUN_ASK_HANDLES`. Every other account on every stack keeps the seeded persona.
- The first attempt subtracted only from `E2E_HARNESS`. The e2e stack boots through the dev stack tool, which also pins `DEV_SEED=on`, so the policy still returned true for the listed handle and a persona was created on the first page load (confirmed with a stack trace in the seeder). That is why the opt-out subtracts from both stamps.

Evidence:

- Red, seed on: with the account not on the list, or with the opt-out subtracting only from `E2E_HARNESS`, the case failed on both local cells at "waiting for `first-run-persona-dialog`": the page opened the join dialog because a "Traveler" persona had been created on load.
- Green: with the opt-out, the case and its control passed on `corpus-local-desktop-bubble` and `corpus-local-phone-bubble` (4 passed).
- Planted defect: an early return that stops the gate rendering for an empty library turned the case red on both cells; restored.
- Node: `tests/server/domain/persona/seeder/default.int.test.ts` gained "an automation stack leaves the first-run ask intact for exactly the accounts the policy declines". With the seeder calling the policy without the principal it failed (TypeError reading the principal), and it passes with the principal passed; the file's four tests pass.
- CT: `pnpm test:ct --legacy tests/legacy/client/routes/app-root.ct.tsx`: 41 passed, 0 failed. The two roster-census cases that failed on the leg 3 tree pass again, so that failure came from main and has cleared.
- Not run: the other local and single-user cells; the legacy `seed-default-persona.int.test.ts` fails on a database-wiring harness error ("database wiring handle is not registered") before reaching any seeder code, so it gives no verdict here.
