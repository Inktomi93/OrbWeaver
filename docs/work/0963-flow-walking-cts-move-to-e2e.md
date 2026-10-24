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

A flow CT pays the cost of stubbing every call and still cannot see a broken wire, which e2e sees for free.

## Done when

No CT uses a fabricated backend to walk a complete route or app-shell journey. Each selected case names its retained coverage, replacement or reason for removal. Cross-layer cases identify distinct failures; they do not repeat the same permutation matrix.

## Evidence

Filled at landing: what ran and where its output is.

Leg B, the e2e moves:

- Run corpus cases with `pnpm exec node scripts/corpus-fixture.ts e2e -- <paths> --project=<cell>`. It clones the committed corpus, sets `E2E_LIVE=0` and `E2E_ALLOW_DEV_TARGET=0`, and adds `--grep=@smoke`. The bare `E2E_LIVE=0 E2E_ALLOW_DEV_TARGET=0 pnpm e2e <paths>` selects no corpus fixture, so every corpus case skips.
- The final run covered every corpus spec in the `corpus-desktop-bubble`, `corpus-phone-bubble`, `corpus-local-desktop-bubble` and `corpus-local-phone-bubble` cells, on the production-built client the e2e modes serve. Two runs on the committed tests: in the first, all 110 selected cases passed with no 429; the exit was 1 only because the working-tree guard saw this item edited mid-run. In the second, 110 passed and one boot failed, see the next finding.
- Finding, production-served e2e: one boot inside the corpus page fixture stayed blank. The document answered 200, then ten module and CSS requests from the server origin failed as aborted, retries included, so the module graph never loaded. The failing case was the phone-only Labels editor case in its desktop project, which skips once the fixture is done. It happened once in four production-served runs and never on the dev server. It is open as a harness finding in [1310](1310-a-production-served-e2e-boot-can-abort-its.md).
- Earlier runs on the dev server: the first case of a cold run came up `data-app-ready="degraded"` twice, inside the corpus page fixture, while vite compiled the lazy authed-app chunk. It did not recur once the e2e modes served a production build.
- Finding, AR18: after a prune on a phone, focus lands on the finder's `More tag actions` trigger, not the finder root `pruneFinalFocus` aims at. Filed as item 1311.
- Defect controls, each a scratch production change that was reverted afterwards: phone Back sending a room resumed from Home to Chats (`leaveRoom`), a hidden skip link, an app-ready gate that settles on its first check, an Insights overview that takes no focus on mount, a join handoff that scrubs the wrong query field, a join handoff that takes the last `join` value (RT3 never reaches `Join chat`), and a narrowed library census that prints the bare total (`Characters · 38` against `Characters · 5 of 38`, in both regimes). Each failed its intended case for the intended reason. The overlapping-navigation case has no plant; it settles on the second location through the real router.
- Rate cap: one app boot sends 6 to 21 tRPC requests (the Insights drill case's trace), so no client request storm exists. The 429s came from many boots a minute for one owner. With the cap lifted, the busiest 60-second window of a single-user corpus cell reached 896 requests against the default `RATE_LIMIT_AUTHED` of 600. `tests/e2e/support/modes.ts` sets it to 1200 for the single-user and local e2e modes; production's default is unchanged.

## Survey

Scope is every maintained `tests/**/*.ct.tsx`. A file is a candidate when any of these hold:

- it stubs three or more distinct tRPC procedures through `routeTrpc`;
- its story mounts a router, the app shell or the section registry;
- a case navigates (`goto`, history, `setActiveSection`) or switches sections;
- a case leaves and re-enters a surface (`unmount`, `update`) over a stubbed backend.

Result: no maintained CT mounts the app shell, `AppRoot` or the production `router`. The only router in a story is the two-route router in `tests/client/features/auth/components/_pending-join-stories.tsx` (`/login` and a destination probe), which the [test-foundation plan](../plans/test-foundation/design.md#selected-case-map-chat-permissions-and-history) keeps in CT. Every other candidate mounts one production surface or one hook owner through `CtClientProviders`. Section switches in stories call the production state actions without a backend.

Old-pattern check (Spine-Testing section 7): every mount is `mount<typeof Story>(id, props)`, every story import is `import type`, and no CT carries inline JSX or inline callback props. Scoped ESLint over the CT and story directories passes with zero warnings, so the syntax rules that enforce this report no hit. The `Old pattern` column is `-` for every row.

## Case map

Layer is the primary layer from the plan's [layer ownership table](../plans/test-foundation/design.md#layer-ownership-and-overlap). `E2E` names the spec that exercises the same journey, or `none`. Every decision is Keep: each case owns a component, measurement, focus, lifetime or controlled-state purpose that a corpus run cannot reach (held reads, injected clocks and visibility, forced refusals, snapshot identity, geometry, touch).

### Public login and pending join

| Case | Proves | Layer | E2E | Decision | Distinct failure | Old pattern |
| - | - | - | - | - | - | - |
| `login-pending-join` / a held preview offers no Join until the room is available | Join control absent while preview is held; enabled after the room arrives | CT | `oidc-pending-join.oidc.spec.ts` / leaving an OIDC pending join retires its invite and preserves other query bytes, hash and history | Keep | The held read is a controlled state the real server never holds. E2E owns callback, dismissal and URL cleanup. | - |
| `login-pending-join` / an unavailable pending join exposes no persona or confirmation | Unavailable state hides persona and confirm; Back to sign in returns to login without a confirm request | CT | none | Keep | A forced 404 preview. E2E has no unavailable-invite case. | - |
| `login-pending-join` / an unnamed persona focuses its error without a request, then submits only the canonical persona and CSRF | Name validation, focus, trimmed body, CSRF header, destination route | CT | none | Keep | Outgoing-request shape and focus. Session cookies and backend authentication stay in integration and E2E. | - |
| `login-pending-join` / a held confirm cannot submit twice and a non-signed-in result waits for approval | Double submit refused; approval-pending result renders | CT | none | Keep | Held confirm response; double submit is a client guard. | - |
| `login-pending-join` / a refused confirm stays unsigned and renders the server refusal inline | 409 refusal renders inline without a destination | CT | none | Keep | Scripted refusal presentation. | - |
| `join-invite-dialog` / a controlled loading preview becomes ready and focuses its newly mounted primary action | Loading, ready, focus move, preview input, no redeem | CT | `corpus-joiner.local.spec.ts` / a joiner with no persona names one in the first-run ask before the join dialog opens | Keep | Held preview and focus order. E2E owns the first-run ask and dialog open. | - |
| `join-invite-dialog` / popup focus delivered after a ready preview still lands on Join chat | Late native focus does not strand the primary action | CT | none | Keep | Focus ordering only. | - |
| `join-invite-dialog` / an invalid preview discloses no room or host and closes through the caller callback | Dead-invite sentence, no disclosure, Close completes | CT | none | Keep | Forced NOT_FOUND. | - |
| `join-invite-dialog` / Not now dismisses the ready component without redeeming the invite | Dismissal without redemption | CT | none | Keep | Negative with a positive ready-state control. | - |
| `join-invite-dialog` / a refused redemption replaces the previous preview with the same flat invalid state | Redeem refusal swaps to the dead state and drops preview bytes | CT | none | Keep | Scripted refusal after a ready preview. | - |
| `join-invite-dialog` / successful redemption completes through the caller callback | Redeem input and completion callback | CT | `corpus-joiner.local.spec.ts` (same test) | Keep | Callback contract. Membership stays in integration. | - |

### Session, binding and lifecycle

| Case | Proves | Layer | E2E | Decision | Distinct failure | Old pattern |
| - | - | - | - | - | - | - |
| `session-freshness` / a genuine recovery confirms the injected clock; hidden and under-floor edges stay quiet and teardown unsubscribes | Recovery read count against the freshness floor, hidden edge, unmount unsubscribes | CT | none | Keep | Needs an injected clock and visibility host. A real server cannot be driven to a floor edge. | - |
| `session-freshness` / an unreachable visibility read retries, while a real signed-out verdict opens recovery without discarding the workspace | Aborted read retries; signed-out verdict opens reauth and keeps the bound section | CT | none | Keep | Forced network abort and signed-out verdict. | - |
| `durable-local-binding` / verified binding preserves returning-user bytes and rejects another user's boot hint | Per-user storage key reuse and foreign-hint refusal across remounts | CT | none | Keep | Storage and remount lifetime. | - |
| `durable-local-binding` / first verified binding adopts the actual legacy store bytes without clearing the projection | Legacy store adoption on first binding | CT | none | Keep | Storage migration at mount. | - |
| `core-lifecycle` / one section intent coalesces native transitions and completes follow-up work after visual settlement | Two section actions in one intent start one native transition; follow-up runs after settlement | CT | none | Keep | Native browser transition. Two state actions, no backend. | - |
| `core-lifecycle` / installed browser error observers retain safe frames without private messages, hosts, paths or query tokens | Safe error ring redaction | CT | none | Keep | Native error events. | - |
| `client-mount` / a provider rerender retains its data runtime and warmed cache | Runtime identity across rerender | CT | none | Keep | Composition lifetime. | - |
| `client-mount` / unmount releases the warmed cache held by the retired data owner | Cache release on unmount | CT | none | Keep | Composition lifetime. | - |
| `client-mount` / the real registry door supplies the authenticated command, palette and message-tool providers | Registry door provides all three providers | CT | none | Keep | Mounting door qualification. | - |
| `state-lifecycle` / four cases (draft, selection, preset selection, steer recovery) | State actions and readers through production stores | CT | none | Keep | Store behavior across observer unmount. No backend. | - |

### Config and settings surfaces

| Case | Proves | Layer | E2E | Decision | Distinct failure | Old pattern |
| - | - | - | - | - | - | - |
| `config-content-surface` / a registered delayed body still receives its canonical anchor and lands visibly | Anchor jump waits for a held settings read, then flashes and scrolls | CT | `corpus-settings.spec.ts` (persistence only) | Keep | Held read and flash class. E2E proves saving and reload, not anchor timing. | - |
| `config-content-surface` / a superseded delayed anchor cannot flash or scroll after its read arrives | Later jump cancels the earlier target | CT | none | Keep | Race between two jumps. | - |
| `config-content-surface` / the group's Advanced fold keeps its open state when the content leaves and returns | Fold state survives unmount and remount | CT | `corpus-config-back-stack.spec.ts` / the phone's back stack pops ONE rung at a time | Keep | Remount lifetime of one fold. E2E owns back-stack order. | - |
| `config-content-surface` / unmount disconnects a pending anchor observer from its retired browser element | Observer disconnect on unmount | CT | none | Keep | Resource cleanup. | - |
| `config-search-input` / `@in:` offers the visible group names as completions | Completion list from the section registry | CT | none | Keep | Component completion. | - |
| `config-search-input` / `@plugin:` offers the installed plugin slugs as completions | Completion from the plugin list read | CT | none | Keep | Component completion. | - |
| `config-search-input` / a search with no match is announced through a status live region | Live-region announcement | CT | none | Keep | Accessibility. | - |
| `background-upload` / an uploaded background is saved under the id the runtime's source minted | Upload to patch with seeded ids | CT | `corpus-settings.spec.ts` (settings save and reload) | Keep | Injected id source; upload route is an external edge. | - |
| `connection-prompt-cache` / native implicit caching explains provider ownership without invented controls or price claims | Provider-managed cache prose, no controls, concurrency bound | CT | `corpus-libraries.spec.ts` / Connections edit an owned endpoint label without changing its transport | Keep | Cache editor presentation. E2E covers a label edit, not the cache tier. | - |
| `connection-prompt-cache` / modern prefix caching retains provider minimum prose and saves the implicit-disable control | Switch writes the expected `connection.update` input | CT | same | Keep | Outgoing patch shape. | - |
| `connection-prompt-cache` / automatic placement disables manual markers but leaves applicable retention available | Dependent control states and patch | CT | same | Keep | Controlled state. | - |
| `connection-prompt-cache` / earlier OpenAI retention offers only its supported provider choices | Retention options and patch | CT | same | Keep | Controlled state. | - |
| `connection-prompt-cache` / header-requested complete-response replay is reported separately from prefix caching | Replay disclosure | CT | same | Keep | Prose. | - |
| `connection-prompt-cache` / cache explanations retain their own prose typography and reading cap (two widths) | Typography and measure | CT | none | Keep | Measurement. | - |
| `list-lifetimes` / native nested lists preserve typing and successor bindings, retain own echoes, and close replaced draft editors | Editor list keys, focus, echo and draft lifetime across revisions | CT | none | Keep | Draft lifetime and refused saves. | - |
| `list-lifetimes` / pending writes cannot replace newer edits, and explicit reset admits a new usable list owner | Held writes, reset | CT | none | Keep | Held writes. | - |
| `section-ids` / an added section and its duplicate take their ids from the runtime's source | Seeded ids on add and duplicate | CT | none | Keep | Injected id source. | - |

### Plugin, notifications and media

| Case | Proves | Layer | E2E | Decision | Distinct failure | Old pattern |
| - | - | - | - | - | - | - |
| `native-guest-protocol` / native Worker log limits (lines, chars) | Log caps keep severity and refuse overflow | CT | none | Keep | Native Worker. | - |
| `native-guest-protocol` / the native Worker exchanges boot, render, event, host-call/result and settlement | Full guest protocol and retry | CT | none | Keep | Native Worker frames. | - |
| `native-guest-protocol` / a native guest boot failure publishes ready:false and reports the original cause | Boot failure report and retry | CT | none | Keep | Native Worker failure. | - |
| `native-guest-protocol` / the default shared corpus renders its native Ledger publication and captured disable through Extensions | Corpus plugin page, then disabled stage | CT | `corpus-libraries.spec.ts` / Plugins toggle the actual installed corpus plugin and persist its activation | Keep | Rendering from captured stages. E2E owns the real toggle and persistence. | - |
| `native-guest-protocol` / native engine memory reservation refusal retires the real Worker without charging the plugin | Browser memory refusal handling | CT | none | Keep | Browser limit. | - |
| `confirmation-identity` / a refreshed action cannot inherit another action's open destructive confirmation | Confirm identity across refresh | CT | none | Keep | Held host call. | - |
| `notification-inbox` / the registered bell settles a held native inbox read into the captured unread state | Bell unread badge; foreign blob refused | CT | `corpus-settings.spec.ts` / Personas notification preferences survive reload | Keep | Held read. E2E covers preferences, not the inbox. | - |
| `notification-inbox` / the captured read stage keeps pending invitation actions without marking the inbox again | No extra read or mark on open | CT | none | Keep | Request-count negative with a visible positive control. | - |
| `media-lifetime` / Tide retains zoom for identical snapshots and closes obsolete media on message replacement | Zoom survives identical reads, closes on replacement | CT | `scripted-chat.spec.ts` (transcript render only) | Keep | Snapshot identity across revisions. | - |
| `transcript-retry` / a transcript that settles after Retry keeps a bounded scroller | Scroller height and focus after Retry | CT | none | Keep | Geometry and focus. | - |
| `example-lifetime` / example preview retains native link consent for identical reads and drops it when the transcript is replaced | Consent lifetime across revisions | CT | none | Keep | Snapshot identity. | - |

### Character, tag, refinery and rpg

| Case | Proves | Layer | E2E | Decision | Distinct failure | Old pattern |
| - | - | - | - | - | - | - |
| `filter-rail-tag-edit` / a tag chip opens its editor from a tap on a visible control, with no context menu | Touch path to the tag editor | CT | none | Keep | Coarse-pointer touch. | - |
| `labels-retry` / Retry on a windowed tag list hands keyboard focus to a row once the rows mount | Focus after Retry on a windowed list | CT | `corpus-workbench.spec.ts` / Labels: a tag pushes its editor, and Back restores the finder with its filter | Keep | Retry focus. E2E owns finder navigation. | - |
| `preview-result-lifetime` / schema preview retains settled expansion through rerenders and failures, then resets on successful replacement | Expansion lifetime across a held run, failure and replacement; media guards | CT | none | Keep | Held and failed runs. | - |
| `preview-result-lifetime` / the media route admits its native blob and refuses the same path on a foreign origin | Foreign-origin media refusal | CT | none | Keep | Browser policy. | - |
| `payload-owner` / assay expansion survives a same-run clone but not a different immutable run | Expansion keyed by run identity | CT | none | Keep | Component identity. | - |
| `payload-inherited-keys` / an omitted field named like an inherited object member renders as absent at every payload depth | Inherited-name rendering | CT | none | Keep | Component rendering. | - |
| `own-key-panels` / the dice ability check for an unset inherited-name attribute is disabled and asks for the score | Disabled menu item | CT | `rpg-lite-loop.spec.ts` (game loop and hand-plane writes) | Keep | Rendering of an inherited-name key. E2E owns the write path. | - |
| `own-key-panels` / a set inherited-name attribute offers its ability check with the profile's modifier | Enabled item with modifier | CT | same | Keep | Rendering. | - |
| `own-key-panels` / Status meters and the character takeover read an unset inherited-name key as unset, then its own values | Unset then set values | CT | same | Keep | Rendering. | - |
| `own-key-panels` / the Scene character card reads an unset inherited-name tracker as unset, then its own value | Unset then set value | CT | same | Keep | Rendering. | - |
| `scene-panel` / every Scene section is an h3 heading and none adds a region | Heading and landmark structure at phone width | CT | none | Keep | Accessibility. | - |
| `scene-panel` / a long goal name is clipped inside the panel instead of scrolling it sideways | Overflow | CT | none | Keep | Measurement. | - |
| `scene-cards` / archive cases (error and Retry focus, pending box, reserved box per chat, empty doorway, phone-width stamps) | Archive loading, error, empty and populated states, focus and reserved geometry | CT | none | Keep | Controlled states, focus and geometry. | - |

### Harness self-tests

| Case | Proves | Layer | E2E | Decision | Distinct failure | Old pattern |
| - | - | - | - | - | - | - |
| `route-trpc` / unlisted procedure, canonical wire, ended subscription, declared failures, declared hold | The `routeTrpc` helper contract | CT | none | Keep | Helper qualification. The file mounts no story. | - |
| `deterministic-helpers` / socket frames, contrast identities, closed pages, deferred attach, malformed observations, typed client batches | Browser support helpers | CT | none | Keep | Helper qualification. | - |
| `gallery` / ready and render-failure stories | Gallery startup and failure | CT | none | Keep | Harness. | - |

The remaining CTs under `tests/ui`, `tests/client/components`, `tests/support/browser` (contained-within, touch-floor) and `tests/tooling` have no `routeTrpc` stub beyond provider reads, no navigation and no router story. They own primitives, measurement and tooling geometry. They are Keep without a row.

## Reference flow cases

These are the reference flow CTs that have no maintained file: `client/routes/app-root.ct.tsx`, `client/routes/route-pending.ct.tsx`, `client/routes/router.ct.tsx`, `client/routes/stuck-splash.suite.ct.tsx` and `client/features/app-shell/surfaces/app-shell.ct.tsx` in the external reference source named in [Spine-Testing](../law/Spine-Testing.md#2-the-tree). Each file was read in full. Every test site has one row. A loop is one row.

Decisions:

- Keep: maintained coverage already exercises the behavior; the row cites it.
- Move: an uncovered journey goes to corpus e2e; the row names the target spec.
- Move to unit: the case tests a pure rule; the row names the unit test and the production function.
- Rebuild-in-CT: a component, measurement or controlled-state case. The row names the target CT. Rows tagged `G<n>` are cells of one table-driven case; see the collapse groups. Rows tagged `room` need a mounted chat room.
- Drop: duplicate, copy, instrument receipt, self-described fence with no defect, or a case that only proves its own fabricated data; the row gives the reason.

Reading notes that bound the decisions:

- The shell CT mounted every case through a story-injected section registry (`CtFakeSectionRegistry`) and about thirty fabricated ambient reads. It proves shell chrome (regions, panels, rail, modal host, mobile bar), not section behavior. A rebuilt case mounts the production shell through `CtClientProviders`, which builds the production authed composition (`tests/support/browser/ct-data-providers.tsx:30-84`). Where a story must inject a section body it uses `isolationRegistry` with a named isolation reason.
- The cascade cases (glass, contrast, grain, reading surface) mounted `ShellCascadeFixture`, a copy of the shell's classes and attributes. A rebuilt case mounts the production shell with the appearance setting under test and reads the same computed style or pixel.
- Controls that the reference file kept beside a defect case stay in the rebuilt table-driven case as assertion rows, so each keeps its positive control.
- A Move case drives the real stack. Network shaping with `page.route` (delay, throwing chunk) is allowed; a count or literal is derived from the corpus read, not typed. The substituted `authed-app` chunk in SS1 and SS2 replaces only the lazily imported module at the network layer. The router and its error boundary are production. No production-reachable render failure exists to drive instead, so the module substitution is the input.
- The `corpus-shell.spec.ts` target is a new file in the single-user corpus. It runs in the desktop and phone projects (`corpus-desktop-*`, `corpus-phone-*`); a row says when it is phone-only. `corpus-signed-out.local.spec.ts` runs in the local-mode corpus.

### `client/routes/app-root.ct.tsx`

| Id | Line | Case | Behavior and inputs | Decision | Maintained coverage or target |
| - | - | - | - | - | - |
| AR1 | 162 | fresh state lands on HOME | Born section is Home with door-assembled tiles; empty bank teaches first step; no list toggle, no composer | Keep | `smoke.spec.ts` / the home page renders the home surface; `corpus-home-launch.spec.ts` / a user who owns a persona never sees the first-run gate. Empty-bank teaching copy is copy over a fabricated empty backend: not ported. |
| AR2 | 193 | a cold load moves focus nowhere and the first Tab reaches the skip link | focusin trail empty after boot; first Tab lands on Skip to content | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts (new)` (desktop and phone projects): record focusin before load, wait for app-ready, press Tab |
| AR3 | 221 | on a phone, Home drops the section chips | At 360px the home.jump tile is absent; quick-picks present | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts (new)` (phone project; desktop project asserts the tile is present) |
| AR4 | 239 | the app is not ready until Home's first reads land | data-app-ready absent while chat.listChats is held, set after release | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts (new)` : delay `chat.listChats` with page.route on the real stack, assert no `data-app-ready`, release, assert set The client batches Home's first reads into one request (with `character.list`, `databank.list`, `persona.list`, `rosterPreset.count`, `rosterPreset.list` and `settings.getUserSettings`), and one HTTP response cannot answer part of a batch, so the hold delays the whole batch. The gate's rule is "no read in flight", which every read in it exercises the same way. The masthead's settled state (`aria-busy` count 0) is asserted after release. |
| AR5 | 266 | zero personas: first-run ask FORCED open | Gate has no close control, Escape keeps it, Create disabled until named | Rebuild-in-CT | story `FirstRunPersonaDialogStory` in `tests/client/features/persona/anchors/_first-run-persona-stories.tsx`, spec `tests/client/features/persona/anchors/first-run-persona-dialog.ct.tsx` (persona.list empty, seeds null). Gate opening and create are Keep: `corpus-joiner.local.spec.ts` / a joiner with no persona names one in the first-run ask. |
| AR6 | 329 | phone Characters at 320/390: topbar screen name carries the census | Topbar title reads `Characters · 12`; list band title hidden (one census per regime) | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts (new)` : phone project, count derived from the corpus read, not a literal The screen name is asserted visible with its exact census, and the band title hidden. |
| AR7 | 345 | the DESKTOP census is untouched (Characters) | Band title prints `Characters` and the count; narrow topbar title hidden | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts (new)` : desktop project, same spec |
| AR8 | 646 | phone screen names at 320/390 x8 sections (Chats, Corpus Explore, Insights, Tags, Presets, Databank, Plugin pages, Refinery) | Topbar name composes label plus census from each section's real list data; band title off screen | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts (new)` : phone project loops the rail and You sheet, counts derived from corpus reads. If a census format needs permutations, add a unit test of the title composer, not another browser case Each screen name is the exact text built from live reads. Stays CT: no exact `n of m` leaderboard census, because the committed corpus ranks fewer characters than one page holds, so Insights prints the bare count; a narrowed Characters search proves the `n of m` order instead. Dropped from e2e: the Plugin pages census, because no package door exports `EXTENSIONS_SECTION_LABEL` or the page join behind its count, a test-only export is banned, and copying the join would re-implement `usePluginPagesState`. Keep: the count rule is covered by `tests/client/features/plugin/hooks/extensions-list-header.ct.tsx`; the phone screen name composed from it is item 1313. No door exports the census formatters either, so the expected texts are built from the live numbers. |
| AR9 | 666 | the DESKTOP census is untouched, every LIST band | Each section's band prints title and count; topbar title hidden | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts (new)` : desktop project loop The band heading is asserted as its exact title and census text, including the narrowed Characters `n of m`. |
| AR10 | 697 | desktop: Corpus holds Explore, Insights and Labels in one workspace, no Analytics door | Rail has no Analytics; mode switch swaps finder, content and context tabs | Move (done 1d104bcf7a) | `tests/e2e/corpus-workbench.spec.ts` : desktop test for the mode switch. Insights drill and Labels are Keep: `corpus-workbench.spec.ts` / Back from an Insights drill; Labels: a tag pushes its editor |
| AR11 | 736 | desktop: a keyboard mode switch moves focus into the new mode's CONTENT | Enter on Insights radio focuses the overview surface | Move (done 1d104bcf7a) | `tests/e2e/corpus-workbench.spec.ts` (desktop) |
| AR12 | 750 | phone: Corpus enters through You; Explore and Labels land on finder, Insights on dashboard | Corpus absent from the bar; sheet entry; landing pane per mode; topbar `Insights · n of m` | Move (done 1d104bcf7a) | `tests/e2e/corpus-workbench.spec.ts` (phone project). Labels finder return is Keep: `corpus-workbench.spec.ts` / Labels: a tag pushes its editor, and Back restores the finder The phone screen name is asserted as the exact `Insights · <count>` text; the corpus cannot reach the `n of m` leaderboard arm, see AR8. |
| AR13 | 780 | phone: the empty Explore finder opens its understanding pass with focus in Content | Go to sorting collapses finder, focuses main, shows overview toggle | Rebuild-in-CT (G34) | `tests/client/features/discovery/components/corpus-explore-empty.ct.tsx` (one controlled-empty case, with AR14): production Corpus Explore (`packages/client/src/features/discovery/components/corpus-browse-view.tsx`) over `discovery.home`/`discovery.catalog` reads with zero digests. Those reads have no committed capture, see the leg C capture step |
| AR14 | 799 | phone: the empty Explore Context door reveals its overview and closes the sheet | Context door opens overlay, overview door collapses both panes and focuses main | Rebuild-in-CT (G34) | `tests/client/features/discovery/components/corpus-explore-empty.ct.tsx`, folded into the AR13 case: the Context overview door opens, then closes the sheet and focuses main |
| AR15 | 825 | phone Insights: list door opens leaderboard, a row drills, Back returns | Drill shows character surface, one Back, back to dashboard | Move (done 1d104bcf7a) | `tests/e2e/corpus-workbench.spec.ts` (phone project). The desktop drill is Keep: `corpus-workbench.spec.ts` / Back from an Insights drill keeps the leaderboard's search and sort; that test skips the phone |
| AR16 | 857 | phone: Insights with an empty leaderboard titles the screen `Insights` | Empty census prints the mode name only | Move to unit (blocked: no pure composer) | `tests/client/features/app-shell/components/section-topbar-title.dom.test.ts` (or a `.test.ts` beside the pure function that owns the rule): census title composer, zero-count branch prints the bare mode name. Locate the owner in leg C (`packages/client/src/features/app-shell/components/section-topbar-title.tsx` and each section's `useSelectionTitle`). The AR8 e2e uses non-zero corpus counts, so it cannot cover this branch |
| AR17 | 869 | phone: entering Corpus from You lands focus in the finder; CONTEXT sheet takes focus | Focus inside list panel, then inside context overlay | Move (done 1d104bcf7a) | `tests/e2e/corpus-workbench.spec.ts` (phone project) |
| AR18 | 885 | phone Labels: a prune lands focus on the finder, never <body> | Prune confirm returns focus to labels-finder | Move (done 1d104bcf7a) | `tests/e2e/corpus-workbench.spec.ts` (phone project; prune is a real mutation on a corpus clone) The case asserts the prune completes and focus stays inside the finder. Stays CT: the exact focus target (the finder root), owned by item 1311. |
| AR19 | 913 | open member's screen keeps the section label while her name is in flight | Held character.get shows `Characters`, not the census; then her name | Rebuild-in-CT | story `AppShellOnSectionStory` equivalent, spec `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx`: held `character.get` via `trpcHold` |
| AR20 | 937 | every registered roster and Corpus mode renders a structural band and search | Each roster has a title, one identity, and a required search or reasoned `planned` policy | Rebuild-in-CT | story `RosterCensusStory` over the production section registry, spec `tests/client/features/app-shell/surfaces/section-roster-census.ct.tsx` |
| AR21 | 964 | roster census rejects an omitted search and permits only a reasoned declaration | Mutates the DOM and re-runs its own helper | Drop | Proves the test's own helper against hand-mutated DOM; no production behavior. |
| AR22 | 983 | pending CONTENT arrival preserves the global palette's portal focus | Programmatic rail click while palette open keeps focus in the palette search | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-command.ct.tsx` : story with the production registry, palette open, dispatch a rail click |
| AR23 | 1002 | phone: keyboard selection from the real finder lands on the revealed content anchor | Enter on a library row focuses main/form anchor; Tab enters the form | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts (new)` (phone project, Characters editor on the corpus) |
| AR24 | 1039 | phone: warm rail return preserves editor node, dirty draft and scroll; new entity keeps cold focus | Activity retention across Home round-trip; held character.update | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts (new)` (phone project): type a draft, round-trip the rail, assert draft and scroll; open a second character, assert cold focus. Draft-through-Activity state survival has partial cover: `corpus-home-launch.spec.ts` / the temp tile starts its room ... unsent line survives a section round-trip The node-identity probe is dropped as implementation detail; the case asserts the draft, the scroll offset and the new member's cold focus. The autosave (`character.update`) is held across the round trip, so the draft is the retained node's, not a read-back. Stays CT: the Characters tab keeping focus after the warm return, rebuilt in leg C (shell CTs). |
| AR25 | 1110 | a slow Refinery list read keeps the shell mounted and only the list region waits | Held refinery.listSessions: rail stays, no router splash, list fills on release | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts (new)` : page.route delay on `refinery.listSessions`, desktop project |

### `client/routes/route-pending.ct.tsx`

| Id | Line | Case | Behavior and inputs | Decision | Maintained coverage or target |
| - | - | - | - | - | - |
| RP1 | 12 | renders a visible, accessibly-named loading mark | RoutePending is a status named Loading | Rebuild-in-CT | story `RoutePendingStory`, spec `tests/client/routes/route-pending.ct.tsx` (mount the production `RoutePending`) |
| RP2 | 19 | the splash that replaces the shell keeps the app's reduced-motion flag, and its shimmer stops | data-reduced-motion stays on html after shell unmount; glyph animation under 1ms | Rebuild-in-CT | `tests/client/routes/route-pending.ct.tsx`: story hands over from a shell root effect to `RoutePending` (production `useAppearanceRootEffects`) |
| RP3 | 38 | with reduced motion off the shell leaves no stale flag and the shimmer runs | Flag absent after handover; glyph animation over 100ms | Rebuild-in-CT | `tests/client/routes/route-pending.ct.tsx`, control arm of the case above |

### `client/routes/router.ct.tsx`

| Id | Line | Case | Behavior and inputs | Decision | Maintained coverage or target |
| - | - | - | - | - | - |
| RT1 | 40 | a slow auth read on a signed-out /join landing reaches the invite form, not the crash fallback | Slow /api/auth/me; invite sign-up form shows; token leaves URL without a history entry; two guard reads | Move (done 26aa76213c) | `tests/e2e/corpus-signed-out.local.spec.ts` : delay `/api/auth/me` by route, `page.goto('/?join=<token>')`, assert form, URL and `history.length`. Local-mode corpus, desktop project |
| RT2 | 66 | overlapping navigations during a slow guard settle on the latest login location | Two navigations during a slow guard end at /login?second=1, no crash | Move (done 26aa76213c) | `tests/e2e/corpus-signed-out.local.spec.ts` : second `page.goto` issued before the first settles. If a real double navigation cannot be driven from outside, record the gap and keep the case as an open observation, not a CT router story Driven from outside: Back, then Forward the moment Back lands, so two router navigations are in flight under the slow guard. Not an open gap. |
| RT3 | 85 | a signed-in handoff keeps the token once and replaces only its query fields | peek token, consume once, URL keeps unrelated query bytes and hash, stash cleared | Move (done 26aa76213c) | `tests/e2e/corpus-signed-out.local.spec.ts` : signed-in owner opens `/?join=...` with noisy query bytes The invite comes from another account's room, so the dialog reaches its ready state; the case asserts the `Join chat` button, which a handoff that took any `join` value but the first would not reach (planted and caught). |
| RT4 | 106 | leaving an OIDC pending join replaces only pendingJoin and keeps other query bytes and hash | Not now keeps other query bytes, hash and history length | Keep | `oidc-pending-join.oidc.spec.ts` / leaving an OIDC pending join retires its invite and preserves other query bytes, hash and history (same noisy URL bytes) |

### `client/routes/stuck-splash.suite.ct.tsx`

| Id | Line | Case | Behavior and inputs | Decision | Maintained coverage or target |
| - | - | - | - | - | - |
| SS1 | 8 | a failed authed-app chunk shows a retry, not the pending splash | Chunk that throws gives Retry; no Loading status; one chunk request; Retry reloads | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts (new)` : `page.route(/authed-app/)` fulfills a throwing module, assert Retry, no `status Loading`, one request, Retry triggers navigation On the production build a failed chunk takes one guarded reload (`vite:preloadError` in `main.tsx`) before Retry shows; the case waits for that second document before reading Retry, then asserts Retry's own third document requests the chunk again. |
| SS2 | 30 | a route render crash reports once and lands on the retry surface | Throwing AuthedApp: Retry shown; crash reporter called once with the message | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts (new)` : fulfill a module whose `AuthedApp` throws; count the crash-report tRPC request, expect one The bundler renames the chunk's exports, so the case reads them from the served chunk and binds each to a namespace whose `AuthedApp` throws. |
| SS3 | 46 | a shell region whose body suspends holds the suspension instead of replacing the shell | Suspending list body leaves outside shell content; no Loading status; list arrives on release | Drop | Fake `RegionSuspenseStory`. The production region boundary is observed by the Refinery slow-read move above (app-root line 1110). |

### `client/features/app-shell/surfaces/app-shell.ct.tsx`

| Id | Line | Case | Behavior and inputs | Decision | Maintained coverage or target |
| - | - | - | - | - | - |
| AS1 | 307 | toast overlay on a phone: a notice preserves content geometry and leaves the composer clear | Raising a notice leaves content box unchanged; toast does not overlap composer; viewport fixed | Rebuild-in-CT (G27, room) | `tests/client/features/app-shell/surfaces/app-shell-notices.ct.tsx` (phone 430x932 coarse) |
| AS2 | 316 | a notice preserves desktop content geometry | Same at 1280 | Rebuild-in-CT (G27) | `tests/client/features/app-shell/surfaces/app-shell-notices.ct.tsx` |
| AS3 | 324 | a burst stays inside the overlay's resolved height cap | Three notices; viewport height <= resolved max-height | Rebuild-in-CT (G27) | `tests/client/features/app-shell/surfaces/app-shell-notices.ct.tsx` |
| AS4 | 337 | the capped overlay takes the wheel between notices | Wheel over capped stack scrolls it, not the transcript | Rebuild-in-CT (G27) | `tests/client/features/app-shell/surfaces/app-shell-notices.ct.tsx` |
| AS5 | 358 | the empty toast overlay does not intercept page controls | No band, no toasts, viewport pointer-events none | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-notices.ct.tsx` |
| AS6 | 365 | a soft keyboard marks the root keyboard-up and clears it | visualViewport shrink sets html data-keyboard-up; restore clears | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-notices.ct.tsx` |
| AS7 | 391 | default renders the chats content pane inside the frame | Fake chats content visible; rail button present | Drop | Asserts a story-injected body; the home/boot render is Keep via `smoke.spec.ts` / the home page renders the home surface |
| AS8 | 398 | a rail click switches the section's CONTENT + LIST slots | Corpus content and list visible, chats content hidden | Keep | `corpus-home-launch.spec.ts` / the temp tile starts its room ... unsent line survives a section round-trip; `corpus-workbench.spec.ts` navigation; `smoke.spec.ts` / a section deep link boots the app |
| AS9 | 409 | <Activity> pane-keeping keeps the SAME CONTENT node | DOM probe attribute survives a section round-trip | Keep | User-visible outcome (state survives) is `corpus-home-launch.spec.ts` / the temp tile starts its room ... unsent line survives a section round-trip; the node-identity probe is implementation detail and is dropped |
| AS10 | 425 | the topbar toggle collapses the list panel to zero rendered width | mode collapsed, right edge <= rail, aria-hidden | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS11 | 461 | opening a collapsed panel does not mount its body in the click's own task (#895) | MutationObserver: mode flip and body mount in different tasks | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` (task-separation probe with its own positive controls) |
| AS12 | 517 | a collapsed CONTEXT body mounts only when opened, then follows the active section | Empty body collapsed; overlay at content floor on first click; section change swaps body | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS13 | 551 | the rail foot carries NO modal trigger; Settings routes as a SECTION | No Switch theme button; Settings click gives aria-current, no dialog | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx`: rail Settings click routes the section (aria-current, no dialog). Not Keep: `corpus-config-back-stack.spec.ts:30` and `tests/e2e/support/config-flow.ts:8` enter by `page.goto`, and neither clicks the rail. The Settings content itself stays Keep via `corpus-settings.spec.ts` |
| AS14 | 564 | closing a modal returns focus to the control that opened it | Escape closes New chat dialog; trigger refocused | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-modals.ct.tsx` |
| AS15 | 576 | positive control: desktop Jump click opens palette; Escape returns to trigger | Palette dialog open/close, focus returns | Rebuild-in-CT (G24) | `tests/client/features/app-shell/surfaces/app-shell-command.ct.tsx` |
| AS16 | 593 | Meta+K / Control+K open the palette and Escape returns to the Jump trigger | Chord opens palette, combobox focused; Escape refocuses trigger | Rebuild-in-CT (G24) | `tests/client/features/app-shell/surfaces/app-shell-command.ct.tsx` (both chords) |
| AS17 | 618 | palette returns focus to the durable trigger when nothing holds focus as the dialog mounts | Trigger steals back focus once; Escape still returns focus to it | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-command.ct.tsx` |
| AS18 | 675 | the command shortcut ignores text-entry targets without preventing default | input, textarea, select, contenteditable: defaultPrevented false, no dialog | Rebuild-in-CT (G24) | `tests/client/features/app-shell/surfaces/app-shell-command.ct.tsx` |
| AS19 | 691 | default is prevented only for an exact, non-repeating shortcut | Ignored combinations return false; Ctrl+K returns true and opens | Rebuild-in-CT (G24) | `tests/client/features/app-shell/surfaces/app-shell-command.ct.tsx` |
| AS20 | 710 | rapid command shortcuts own one pending frame and unmount cancels it | rAF probe: one pending, unmount cancels | Rebuild-in-CT (G25) | `tests/client/features/app-shell/surfaces/app-shell-command.ct.tsx` |
| AS21 | 747 | an open New-chat modal owns the overlay and the shortcut does nothing | Shortcut returns false; focus stays on Close | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-command.ct.tsx` |
| AS22 | 763 | the command keydown listener does not duplicate across rerenders and is removed on unmount | Listener probe: one active, removed on unmount | Rebuild-in-CT (G25) | `tests/client/features/app-shell/surfaces/app-shell-command.ct.tsx` |
| AS23 | 808 | MOBILE: You-sheet Jump handoff returns focus to the durable You tab | Sheet to palette to Escape; You tab focused | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx` |
| AS24 | 823 | MOBILE: an ordinary You-sheet close returns focus to its trigger | Escape closes sheet; You focused | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx` |
| AS25 | 835 | MOBILE: You-sheet Jump handoff keeps Search focused and accepts immediate typing | Combobox focused after drawer cleanup; typed `r` | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx` |
| AS26 | 856 | filtering the palette keeps the dialog and search geometry stable | Dialog and input y unchanged after fill | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-command.ct.tsx` |
| AS27 | 883 | the real palette keeps roving selection exposed from its focused combobox | aria-activedescendant matches selected option | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-command.ct.tsx` |
| AS28 | 902 | the palette reserves a compact, stable result viewport while filtering | List height <= 192 and equal across filters; empty state centered | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-command.ct.tsx` |
| AS29 | 947 | a modal opens with focus in its BODY, not on Close | Active element inside popup with tabIndex -1; Enter does not dismiss | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-modals.ct.tsx` |
| AS30 | 1018 | no-window-scroll per modal id (MODAL_SLOT_IDS loop) | Document cannot scroll; scroll region is a popup descendant; header stays pinned | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-modals.ct.tsx` : loop the production `MODAL_SLOT_IDS` |
| AS31 | 1055 | the drawer's sticky header resolves the raised stratum and paints above content | position sticky, z.raised token, elementFromPoint is header | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-modals.ct.tsx` |
| AS32 | 1087 | escape closes each modal (loop) | Escape dismisses every registered modal | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-modals.ct.tsx` |
| AS33 | 1104 | each modal inherits the active theme override (loop) | popup --color-background carries the themed value | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-modals.ct.tsx` |
| AS34 | 1129 | #960 custom-theme colorization reaches the real command/you portal without a remount | Border tokens equal across grid, portal, popup; toggle follows html attribute; nested ThemeScope isolated | Rebuild-in-CT (G26) | `tests/client/features/app-shell/surfaces/app-shell-modals.ct.tsx` (command and you) |
| AS35 | 1210 | #935 a requested custom-light theme proves rendered palette and polarity through the portal | Palette and color-scheme light on scope, portal, popup | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-modals.ct.tsx` |
| AS36 | 1253 | #960 seed theme keeps byte-identical border tokens across root, shell and portal | One value off; one value on | Rebuild-in-CT (G26) | `tests/client/features/app-shell/surfaces/app-shell-modals.ct.tsx` |
| AS37 | 1290 | #937 density: a portalled dialog inherits the shell's resolved density (x2) | Spacing intents equal in shell and popup; ThemeScope owns data-density | Rebuild-in-CT (G26) | `tests/client/features/app-shell/surfaces/app-shell-modals.ct.tsx` |
| AS38 | 1343 | #938 resolved density wins symmetrically in shell and portal (seed, custom) | Expected density from theme/appearance resolution | Rebuild-in-CT (G26) | `tests/client/features/app-shell/surfaces/app-shell-modals.ct.tsx` |
| AS39 | 1393 | landmark uniqueness: one main, distinct complementary labels, one nav | Landmark count and name uniqueness | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS40 | 1429 | #493 the LIST landmark is named by its own band and follows it | Aside name equals band title; swaps to `Chats · name` | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS41 | 1449 | #1349 fence: the LIST landmark's name keeps the census a separate word | `Chats 6` not `Chats6` | Drop | Self-labelled fence that passed before any fix; browser name computation, no product defect. |
| AS42 | 1468 | the skip link is the first tab stop and lands focus on the main scroll container | First tabbable; clipped at rest; reveals at >=24px; focuses main; next Tab reaches content | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` ; cold-load Tab is Move (app-root line 193) |
| AS43 | 1541 | a11y #283: keyboard rail navigation does not steal focus into <main> | Focus stays on rail button; list primary precedes main in tab order | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS44 | 1595 | a11y #283: swap with focus dropped to <body> restores to the main anchor | main focused on landing | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS45 | 1603 | mobile: the bottom bar is the curated four | Home, Chats, Characters, You; no Corpus/Refinery on bar; <= 4 buttons | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts (new)` (phone project, real registry) |
| AS46 | 1626 | mobile: a section with no LIST pane lands on CONTENT | list collapsed; content visible | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx`: the production Home section at phone width (Home declares no list: `packages/client/src/features/home/lib/home-section.tsx:22-36`), no `isolationRegistry` |
| AS47 | 1634 | mobile: a tab click switches the section | Characters content visible; chats hidden | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts (new)` (phone project) |
| AS48 | 1643 | mobile: You tab opens the sheet; an overflow section routes and closes it | Sheet shows Settings, who-head, account foot, Refinery; Presets row routes and closes | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts (new)` (phone project, local-mode `.local` variant for the account foot if needed) Routing to Presets and Settings stays here; Log out is reached from the account foot in `corpus-signed-out.local.spec.ts`, because single-user has no session to sign out of. Stays CT: the who-head persona name and the absent Switch theme row, rebuilt in leg C (shell CTs). |
| AS49 | 1707 | You sheet with the first-run plugin notice: rows below the fold reachable by touch scrolling | touchDrag moves the last row into view; last row click closes | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx` (touch drag helper `weave-drive`, held notice read) |
| AS50 | 1749 | mobile: Report a bug leaves the phone topbar for the You sheet | No topbar button; sheet disclosure shows the form inline | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx` |
| AS51 | 1767 | mobile: the You sheet's Settings row switches to the config SECTION and closes the sheet | Dialog gone; Settings content main; tab aria-current | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts (new)` (phone project). Settings section content is Keep: `corpus-settings.spec.ts` |
| AS52 | 1811 | the Refinery's phone door: row meets the coarse floor and navigates | Row height >= control-md token; click closes sheet and shows Refinery | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx`: only the coarse row-floor measurement (row height >= the control-md token). The navigation half is carried by AS48 |
| AS53 | 1926 | O-19: switching to Presets opens BOTH list and context docked | Both panes docked at 1280 | Rebuild-in-CT (G18) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` (production section `panelDefaults`) |
| AS54 | 2025 | #375 Reading derives the context crossover from resolved pane geometry | Width sweep 1278-1302 plus binary-searched crossover; icon-only chip; title fits | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` (appearance profile from `appearance-presets.json`) |
| AS55 | 2231 | 0851: 1280 both docked with a third-party launcher keeps the title bound | Title, chips, bell present; trail widgets; title group before members chip | Rebuild-in-CT (G21, room) | `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx` |
| AS56 | 2247 | 0851: both docked keeps participants title and both chips, chips shrink to glyphs | Title `Aria, Bolt, Cass`; subtitle floor; rename hit-test; input >= 96px | Rebuild-in-CT (G21, room) | `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx` |
| AS57 | 2316 | 0873: a long cast and a long room name each keep a floor and a half | title and subtitle widths >= 1.5 floor | Rebuild-in-CT (room) | `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx` |
| AS58 | 2347 | 0851: with the context pane COLLAPSED the topbar still names the participants | title/chips/bell visible | Rebuild-in-CT (G21, room) | `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx` |
| AS59 | 2398 | #896 open context pane yields the narrow title and keeps the wide one (430 / 1280) | Visible topbar titles count per identity | Rebuild-in-CT (room) | `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx` |
| AS60 | 2430 | the context pane's header row ends on the topbar's divider at 1280 and 1920 | Bottom edges within 1px; one tablist; same pixel surface as list band | Rebuild-in-CT (room) | `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx` |
| AS61 | 2478 | the phone chat topbar keeps the members and memory chips (320/390/430 coarse) | Chips inside viewport, glyph only, >=44px, title not under them | Rebuild-in-CT (room) | `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx` |
| AS62 | 2517 | #375 the context regime follows rendered geometry and releases its observer | ResizeObserver observe once and disconnect; font loadingdone re-read | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS63 | 2588 | #375 each appearance profile: both sides of the crossover preserve pane, keyboard and focus (x5) | Constrained: overlay and Escape; wide: docked, primacy holds | Rebuild-in-CT (G20) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx`: two representative profiles (`defaults` and `reading`), read as `Object.keys` of `tooling/src/floor/appearance/appearance-presets.json` `presets`, not a test-local array |
| AS64 | 2635 | #375 a context-default-COLLAPSED section meets the crossover with a different toggle result | Constrained: overlay; wide: persisted dock | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS65 | 2664 | resolvePanel: docked >64rem, collapsed 48-64rem, mobile regime | Mode per viewport; scrim hidden | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx`: one wiring case, viewport width to `data-panel-mode`. The regime matrix is unit, see AS70 (matrix done f872064e8c) |
| AS66 | 2713 | #383 an OPEN context sheet survives hiding and re-showing the LIST | overlay to docked to overlay across list toggles | Rebuild-in-CT (G16) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS67 | 2742 | #383 a CLOSED context sheet is not resurrected by a LIST toggle | stays collapsed | Rebuild-in-CT (G16) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS68 | 2766 | #383 UNCONSTRAINED, the same three clicks stay a plain wide dock | no scrim; both docked | Rebuild-in-CT (G16) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS69 | 2796 | #391 an out-of-shell list dock carries CONTEXT across the flip | dockListPanel keeps context on screen as overlay | Rebuild-in-CT (G16) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS70 | 2822 | resolvePanel: an explicit collapsed override passes through all regimes | collapsed at wide, narrow, wide | Move to unit (done f872064e8c) | `tests/client/state/panel-resolve.test.ts` over `resolvePanelMode` (`packages/client/src/state/panel-resolve.ts:73`, exported by `@orb/client/state`): explicit override across the three regimes and the docked-default matrix of AS65 |
| AS71 | 2840 | resolvePanel: auto-overlay never mutates persisted panelOverrides | orb:shell overrides equal across resize round trip | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS72 | 2864 | at 900px the recents finder is still reachable on Home | Resume hero visible; list panel collapsed | Drop | No e2e runs at 900px and smoke asserts no Resume hero. The width regime is the AS65 wiring case plus the AS70 unit matrix; Home recents render is covered by `smoke.spec.ts` / the home page renders the home surface |
| AS73 | 2888 | the topbar toggle OPENS a narrow auto-overlay, never writing panelOverrides | overlay plus scrim; toggle still clickable; ephemeral | Rebuild-in-CT (G32) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS74 | 2925 | the <=64rem detail toggle opens on the FIRST click | collapsed-default pane opens as overlay on first click | Rebuild-in-CT (G32) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS75 | 2944 | the scrim dismiss closes a narrow overlay like the toggle | collapsed; toggle focused | Rebuild-in-CT (G15) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS76 | 2959 | a scrim click that closes the detail sheet returns focus to its toggle | focus returns | Rebuild-in-CT (G15) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS77 | 2971 | the scrim is not a Tab stop while a sheet is up | 40 Tab presses never focus scrim | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS78 | 2988 | Escape closes a narrow-overlay list panel without writing panelOverrides | collapsed; overrides unchanged | Rebuild-in-CT (G15) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS79 | 3008 | Escape closes an open CONTEXT overlay | collapsed | Rebuild-in-CT (G15) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS80 | 3022 | Escape closes a CONTEXT overlay when focus is inside the sheet | collapsed | Rebuild-in-CT (G15) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS81 | 3038 | MOBILE: Escape closes the full-screen CONTEXT sheet | collapsed; content not inert | Rebuild-in-CT (G15) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS82 | 3064 | Escape closes an open modal without any panel-dismiss side effect | dialog closed; list not overlay | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-modals.ct.tsx` |
| AS83 | 3143 | co-motion parity: content FLIP and collapsed panel share one non-zero duration and easing | Computed animation/transition equal and non-zero; grid not transitioned | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS84 | 3190 | toggling the docked LIST panel is compositor-only: layout shift < 0.1 | PerformanceObserver layout-shift total | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS85 | 3266 | #151 reduced motion: no LIST-track FLIP is stamped; .shell-main stays in its corridor | No animationstart; per-rAF x samples within corridor on chats to home | Rebuild-in-CT (G14, room) | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS86 | 3346 | #151 the LIST-track FLIP IS still armed when motion is allowed | animationstart `shell-main-flip` | Rebuild-in-CT (G14, room) | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS87 | 3394 | #1316 the END-pinned topbar trail never leaves its corridor | trail x within +-2 during the FLIP | Rebuild-in-CT (room) | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS88 | 3476 | #1316 reduced-motion settle holds the trail at the exact inverse of main's held corner | translate offsets cancel | Rebuild-in-CT (room) | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS89 | 3525 | #1316 no END-pinned counter on a phone | animation-name none on main and trail | Rebuild-in-CT (G12, room) | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS90 | 3577 | #1646 the centred counter keyframe is half of main's, opposite sign | FLIP keyframes on both arms | Rebuild-in-CT (G13, room) | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS91 | 3651 | #1646 reduced-motion settle holds the centred carrier at half the inverse | row offset = -main/2 | Rebuild-in-CT (G13, room) | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS92 | 3835 | #2442 no chat-track carrier leaves its FLIP corridor; composer counts, both directions | first-frame hold and corridor for row and composer | Rebuild-in-CT (room) | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS93 | 3901 | #2442 at fontScale 1.25 the docking counter is the clamped delta | cap binds docked; corridor on dock | Rebuild-in-CT (room) | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS94 | 3978 | #2442 the phone's docking list sheet never enters from beyond its own width | animation none; x within -panel..0 | Rebuild-in-CT (G12, room) | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS95 | 4217 | #2456 the LIST door holds every box on the first painted frame, both directions | door census main/trail/list/row/composer | Rebuild-in-CT (G11, room) | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS96 | 4234 | #2456 the CONTEXT door holds every box on the first painted frame, both directions | door census incl. listAction | Rebuild-in-CT (G11, room) | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS97 | 4266 | #2456 both doors hold their boxes at rem 20 | fontScale 1.25 at 1680px | Rebuild-in-CT (room) | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS98 | 4308 | #2456 every door still holds its boxes with touch emulation on | coarse pointer fence | Drop | Self-described fence with no defect (reference `app-shell.ct.tsx:4302`); the touch arm adds nothing the AS95 case does not assert |
| AS99 | 4385 | #2474 a collapsing LIST pane keeps its squeezed width for the whole exit | list pane width corridor | Rebuild-in-CT (room) | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS100 | 4418 | #2474 the exit width holds at rem 20 | same at 1.25 scale | Rebuild-in-CT (room) | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS101 | 4457 | #2474 the collapsing pane holds its width with touch emulation | coarse fence | Drop | Self-described fence with no defect (reference `app-shell.ct.tsx:4452`); AS99 and AS100 carry the width hold |
| AS102 | 4483 | #2456 no flip attribute outlives its animation | data-list-flip and data-context-flip released | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS103 | 4519 | #2456 a second door opened mid-animation restarts the FLIP | one live animation, currentTime < 80 | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS104 | 4560 | #2456 with motion off the CONTEXT door settles in one frame and arms no animation | no animationstart; settle attr released | Rebuild-in-CT (room) | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS105 | 4595 | #2456 the phone arm cancels both tracks' FLIP rules, panels included | animation-name none on four boxes | Rebuild-in-CT (G12) | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS106 | 4631 | #262 reduced motion: the section swap records no meaningful layout shift | layout-shift total < 0.1 on chats to home | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS107 | 4704 | #176 full motion: the swap captures the CONTENT pane only | view-transition pseudo names exclude root | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS108 | 4771 | #170 a chat's carried background paints in chats and is gone in another section | theme-background-layer visible in room, absent elsewhere, back on return | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` (held `chat.getChat` with a background) |
| AS109 | 4818 | boot: the grid's FIRST committed template carries the resolved track widths | No 0px squeeze at first insertion | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` (init-script storage seed + MutationObserver) |
| AS110 | 4913 | #242 both docked at 1360: content reaches the reading floor, panes keep their floors | grid-template-columns tokens | Rebuild-in-CT (G17) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS111 | 4936 | #242 a viewport where the floor fits is byte-identical | plain clamps at 1600 | Rebuild-in-CT (G17) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS112 | 4953 | #242 the FLIP distance survives the squeeze | --list-track-docked stable across list toggle | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS113 | 4992 | #242 the squeeze is BOTH-DOCKED only | list track plain clamp, context 0 | Rebuild-in-CT (G17) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS114 | 5067 | cascade baseline: flat surfaces opaque, no backdrop-filter | alpha 1; filter none | Rebuild-in-CT (G1) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` (mount the production `AppShell` with appearance settings, not `ShellCascadeFixture`) |
| AS115 | 5077 | Surface glow has one valid painted carrier without turning Surface into a box | display contents, no border/bg/radius; carrier has filter | Rebuild-in-CT (G1) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS116 | 5087 | flat Surface carrier keeps no glow filter | filter none | Rebuild-in-CT (G1) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` (control of the glow case) |
| AS117 | 5092 | glass beats elevation: ramp + blur-panels leaves .shell-panel translucent | carrier alpha < 1, blur and saturate | Rebuild-in-CT (G1) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS118 | 5130 | #1120 a COLLAPSED pane carries no backdrop-filter | none on both panes | Rebuild-in-CT (G2) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS119 | 5136 | #1120 an OPEN pane still does | blur/saturate present | Rebuild-in-CT (G2) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` (control) |
| AS120 | 5156 | #1154 the pane carries none of Law 3's promotion shapes | no backdrop, 3D or will-change on pane; carrier blurs | Rebuild-in-CT (G3) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS121 | 5178 | #1120 panel tracks resolve to whole CSS pixels at every width | integer widths at 1280/1440/1920 with unrounded control | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS122 | 5221 | glass beats elevation on composer and both dialog popup slots | alpha < 1 | Rebuild-in-CT (G1, room) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` (real composer and dialogs via modal registry) |
| AS123 | 5234 | glass beats elevation on each message role bubble (loop MESSAGE_ROLES) | alpha < 1 and blur per role | Rebuild-in-CT (G1, room) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx`: bubbles inside the production shell, because the glass rule keys on root attributes the shell's appearance effects stamp. A bubble story outside the shell is not evidence |
| AS124 | 5243 | elevation alone leaves .shell-panel opaque | control | Rebuild-in-CT (G1) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` (control) |
| AS125 | 5258 | at a mobile viewport the glass is not emitted | none and alpha 1 | Rebuild-in-CT (G4) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS126 | 5274 | above the shell breakpoint the same fixture does get glass | control | Rebuild-in-CT (G4) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` (control) |
| AS127 | 5339 | reduced-transparency turns every glass surface SOLID | alpha 1; filter none on five surfaces | Rebuild-in-CT (G5, room) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS128 | 5353 | the same fixture under no-preference still gets glass | control | Rebuild-in-CT (G5) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` (control) |
| AS129 | 5362 | reduced-transparency leaves the phone's own fills standing | alpha 1 at 390 | Rebuild-in-CT (G5) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS130 | 5373 | reduced-transparency reaches the reading-surface backing | main carrier alpha 1 | Rebuild-in-CT (G5) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS131 | 5520 | #138 receipt: emulated high contrast reports `more` | matchMedia values | Drop | Instrument receipt on the browser, not product behavior. |
| AS132 | 5535 | contrast: more thickens only the side each surface authors | per-side border widths on four surfaces | Rebuild-in-CT (G6) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS133 | 5561 | contrast: more raises the glass fill to 92%, each surface keeping its own tint | alpha 0.92; dialog equals popover mix | Rebuild-in-CT (G6) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS134 | 5590 | contrast: more makes the list panel's seam visible >= 3:1 by framebuffer (dark, light) | edge ratio >= AA non-text | Rebuild-in-CT (G6) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` (pixel sampling via `pixel-contrast.ts`) |
| AS135 | 5599 | under no-preference that same seam is the hairline it always was (dark, light) | ratio below floor and above 1 | Rebuild-in-CT (G6) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` (control) |
| AS136 | 5615 | the contrast edge does not depend on the glass toggle | 2px edge with blur off | Rebuild-in-CT (G6) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS137 | 5630 | below the shell breakpoint the contrast edge is not emitted | not 2px at 390 | Rebuild-in-CT (G6) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS138 | 5641 | contrast: no-preference keeps the plain glass | 1px; alpha below 0.92 | Rebuild-in-CT (G6) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` (control) |
| AS139 | 5653 | BOTH preferences set: reduced-transparency wins the alpha; contrast border still applies | alpha 1, 2px edge | Rebuild-in-CT (G6) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS140 | 5688 | contrast: more drops the grain overlay | ::after display none | Rebuild-in-CT (G7) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS141 | 5694 | under no-preference the grain overlay still paints | control | Rebuild-in-CT (G7) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` (control) |
| AS142 | 5709 | grain: an in-shell card does not paint its own second layer | card ::after content none; grid paints | Rebuild-in-CT (G7) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` (real `Surface` card in the real shell, not `GrainDoublePaintFixture`) |
| AS143 | 5717 | grain: a card outside the shell grid keeps its own arm | portalled card ::after opacity 0.04 | Rebuild-in-CT (G7) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS144 | 5757 | grain: the in-shell card wears exactly one film by framebuffer | stddev ratio < 1.25 | Rebuild-in-CT (G7) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS145 | 5778 | grain: texture=none paints nothing | content none both | Rebuild-in-CT (G7) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS146 | 5785 | the contrast fill is per-surface in the LIGHT theme too | modal tracks popover mix over reading plate | Rebuild-in-CT (G6) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS147 | 5798 | background-image beats elevation: main transparent, topbar opaque | alpha 0 / 1 | Rebuild-in-CT (G8) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS148 | 5808 | elevation alone (bg-image off) leaves .shell-main opaque | control | Rebuild-in-CT (G8) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` (control) |
| AS149 | 5817 | bg-image + a non-Chats section: SOLID reading backing | alpha 1 on main | Rebuild-in-CT (G8) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS150 | 5825 | bg-image + non-Chats + blur-panels: reading backing upgrades to glass | carrier translucent with blur; main alpha 0 | Rebuild-in-CT (G8) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS151 | 5849 | #1173 the reading surface carries none of Law 3's promotion shapes | as #1154 for main | Rebuild-in-CT (G3) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS152 | 5871 | bg-image + the Chats section stays IMMERSIVE | main alpha 0 | Rebuild-in-CT (G8) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS153 | 5880 | bg-image + Chats: the landing hero gets a frosted scrim chip | alpha between 0 and 1, blur | Rebuild-in-CT (G8) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS154 | 5890 | bg-image + a non-Chats section: the hero is not scrim-chipped | alpha 0 | Rebuild-in-CT (G8) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` (control) |
| AS155 | 5897 | no bg-image + Chats: the landing hero is not scrim-chipped | alpha 0 | Rebuild-in-CT (G8) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` (control) |
| AS156 | 5902 | useAppearanceRootEffects lands --font-scale on <html> | computed --font-scale 1.25 | Drop | Duplicate of the fontScale root font-size case below, which asserts the rendered effect. |
| AS157 | 5918 | chatWidthPct stamps a real rendered max-width on --width-shell-content | max-width = pct of viewport | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS158 | 5974 | #1204 the chat-width dial's clamp: floor, crossover, above | three viewport regimes against the floor token | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS159 | 6013 | fontScale stamps a real rendered <html> font-size | 16 x 1.25 | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS160 | 6051 | #188 the app's reduced-motion pref floors an animation outside the shell grid | shimmer duration <= 1ms outside and inside | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS161 | 6101 | #188 a device that remembers reducedMotion=ON keeps the flag while getUserSettings is in flight | held settings read; html attr true from boot hint | Rebuild-in-CT (G9) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` (init-script hint, `trpcHold`) |
| AS162 | 6117 | #188 CONTROL: no hint is not stamped ON by the pending read | attr not true | Rebuild-in-CT (G9) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` (control) |
| AS163 | 6131 | #188 the cmd chip paints no text and its name carries Jump and the shortcut | textContent empty; icon only; description with platform shortcut from the production label function | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx` |
| AS164 | 6141 | the palette button names Ctrl+K off Apple platforms | accessible name/description with Ctrl+K | Move to unit (done f872064e8c) | `tests/client/features/app-shell/lib/command-shortcut-label.test.ts` over `commandShortcutLabel` (`packages/client/src/features/app-shell/lib/command-shortcut-label.ts`): UA string to label, platform cells. The function is not on a package door; its first consumer adds the export or lists the reach in `PACKAGE_TEST_REACHES` |
| AS165 | 6152 | on a Mac the palette button names the Command key | UA override | Move to unit (done f872064e8c) | `tests/client/features/app-shell/lib/command-shortcut-label.test.ts`: the Mac cell of AS164. AS163 alone proves the chip's name uses the label |
| AS166 | 6202 | a file dropped outside any dropzone is swallowed and says where files go | default prevented; hint shown; no import | Rebuild-in-CT (G27) | `tests/client/features/app-shell/surfaces/app-shell-notices.ct.tsx` (drop-guard cases live with the notices spec; no separate spec) |
| AS167 | 6211 | the guard stays out of a real dropzone's way | zone imports; no hint | Rebuild-in-CT (G27) | `tests/client/features/app-shell/surfaces/app-shell-notices.ct.tsx` (control) |
| AS168 | 6219 | a non-file drag is left entirely alone | default not prevented; no hint | Rebuild-in-CT (G27) | `tests/client/features/app-shell/surfaces/app-shell-notices.ct.tsx` (control) |
| AS169 | 6237 | a section with NO panes ships NO panel chrome | no toggles; context body empty; data-panel-available false | Rebuild-in-CT (G18) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` (production Home section) |
| AS170 | 6267 | a section with a LIST but NO context pane ships the list toggle only | list available true; context false | Rebuild-in-CT (G18) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` (production Extensions section) |
| AS171 | 6286 | a section WITH panes still ships both toggles | both available true | Rebuild-in-CT (G18) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` (control) |
| AS172 | 6297 | MOBILE: a collapsed drawer is the FULL viewport wide and off-screen | width = viewport; x-range outside | Rebuild-in-CT (G33) | `tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx` |
| AS173 | 6340 | the list/context pane floating at 48-64rem wears the house sheet elevation; docked does not | box-shadow not none floating, none docked | Rebuild-in-CT (G29) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` (both sides) |
| AS174 | 6399 | the ember content-context binding is a DOCKED cue | inset edges by geometry; separator survives | Rebuild-in-CT (G29) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS175 | 6421 | content behind an open sheet is INERT | inert on .shell-content; focus refused; lifted on close | Rebuild-in-CT (G29) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS176 | 6449 | MOBILE: the full-screen sheet gets the same elevation and inert content | box-shadow and inert | Rebuild-in-CT (G29) | `tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx` |
| AS177 | 6508 | MOBILE: the CONTEXT sheet rides the shell's own overlay rung; a portal float still covers it | isolation isolate; z.overlay token; ownerAtPoint sheet then portal | Rebuild-in-CT (G33) | `tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx` |
| AS178 | 6558 | MOBILE: an overlay panel's band carries a DISMISS | close button closes; inert lifted | Rebuild-in-CT (G33) | `tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx` |
| AS179 | 6606 | ONE-SHELL @320 per section (chats, characters, corpus, config, databank) | Roster is the screen; selection pushes content with Back row; back pops | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts` (phone project): roster is the screen, a real row pushes content with a Back row, Back pops, for Chats, Characters and Databank. Config and Corpus push and Back are Keep: `corpus-config-back-stack.spec.ts:18` and `corpus-workbench.spec.ts:55` Stays CT: the roster's full-viewport width from x = 0, the hidden scrim, and the absent list toggle while a member is pushed, rebuilt in leg C (shell CTs). |
| AS180 | 6650 | ONE-SHELL @320: an open chat room hides the tab bar and gives its row to the room | rail gone; data-room-screen; main reaches grid bottom; back restores | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts` (phone project): open a real room, tab bar hides and the room takes the row, Back restores it Stays CT: CONTENT reaching the grid's bottom edge and the 320 and 390 widths, rebuilt in leg C (shell CTs). |
| AS181 | 6674 | phone Back @320/390: an open details sheet closes first, then the room | two-step Back | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts` (phone project): details sheet closes first, then Back leaves the room |
| AS182 | 6697 | phone Back @390: a room opened from Home returns to Home | Back to Home; section home | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts (new)` (phone project): Resume from Home, Back to Home |
| AS183 | 6713 | phone Back @390: a room opened inside Chats after a Home resume returns to the Chats list | Back to Chats | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts (new)` (phone project) |
| AS184 | 6732 | 0866: a content swap crossfades without morphing the group or scaling the snapshots | no group morph pseudo; object-fit none; old does not reappear | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS185 | 6789 | 0866: a closing overlay sheet keeps its box below the topbar for the whole exit | per-frame top equals open top | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` |
| AS186 | 6833 | ONE-SHELL @320: another section's pushed detail keeps the tab bar | rail visible for characters | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts` (phone project): a pushed Characters detail keeps the tab bar |
| AS187 | 6844 | ONE-SHELL @320: the topbar toggle drops the roster screen to the section's no-selection CONTENT and restores it | Show Corpus overview/list | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts` (phone project): the topbar toggle drops the roster screen to the no-selection content and restores it, on Corpus |
| AS188 | 6865 | ONE-SHELL: at 1280 the config roster stays a docked pane beside CONTENT with no back row | applicability control | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts` (desktop project): control, the config roster stays a docked pane with no back row The list toggle is asserted visible after a selection. |
| AS189 | 6894 | #1349 @320: the roster screen is the ONE main landmark and the skip link lands on it | one main with data-panel-side list; skip focuses it; detail makes content main | Rebuild-in-CT (G31) | `tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx` |
| AS190 | 6923 | #1349 @1280: the content column keeps the ONE main landmark | control | Rebuild-in-CT (G31) | `tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx` (control) |
| AS191 | 6969 | mobile topbar @320: every hit sample on the back button lands the BACK BUTTON | elementFromPoint at 5 points | Rebuild-in-CT (G22) | `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx` |
| AS192 | 6988 | mobile topbar @320: the lead keeps a real box and the title never measures 0 | lead > 44px, title > 0, lead before trail | Rebuild-in-CT (G22) | `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx` |
| AS193 | 7014 | mobile topbar @320: every control's box sits inside the viewport | left >= 0, right <= 320 | Rebuild-in-CT (G22) | `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx` |
| AS194 | 7034 | mobile topbar @320: desktop-shaped trail affordances shed; the command modal keeps a home in the You sheet | no cmd chip; Jump row in sheet | Rebuild-in-CT (G22) | `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx` |
| AS195 | 7048 | mobile topbar @320: the roster IS the screen; the CONTENT frame behind it does not paint | display none, box 0; returns on selection | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx` |
| AS196 | 7075 | mobile topbar @320: the title outranks the chrome | room for name > widest control and > 30% of row | Rebuild-in-CT (G22) | `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx` |
| AS197 | 7097 | mobile topbar @320: the pushed frame's topbar names the MEMBER; the roster frame names the section | title `Settings` then member name | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx` |
| AS198 | 7107 | a11y: the bottom tab bar comes AFTER the topbar in DOM order on a phone | main index before rail index | Rebuild-in-CT (G30) | `tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx` |
| AS199 | 7140 | a11y: on the DESKTOP the rail still reads first | rail index before main | Rebuild-in-CT (G30) | `tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx` (control) |
| AS200 | 7203 | #231 a remembered fontScale and density survive the shell's first commit | boot hint kept while settings held | Rebuild-in-CT (G9) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS201 | 7217 | #231 a remembered theme survives too | data-theme light kept | Rebuild-in-CT (G9) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS202 | 7228 | #231 CONTROL: no hint is not scaled or themed by the pending read | scale 1; theme null | Rebuild-in-CT (G9) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` (control) |
| AS203 | 7278 | #237: over a wallpaper a LIGHT palette's panes take the derived plate floor; the DARK arm does not move | alpha >= plate; dark equals plain | Rebuild-in-CT (G10) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS204 | 7299 | #237: the LIGHT pane's secondary ink clears AA over worst-case art | landed-pixel contrast >= AA normal | Rebuild-in-CT (G10) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS205 | 7404 | #623: over worst-case art a LIGHT palette's DIALOG POPUP clears AA | landed contrast | Rebuild-in-CT (G10) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` (real dialog popup) |
| AS206 | 7420 | #623: the DARK arm's dialog popup does not move a pixel | byte-identical to no-wallpaper | Rebuild-in-CT (G10) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` (control) |
| AS207 | 7435 | #623: with NO wallpaper the LIGHT arm's popup takes the same plated fill | fill equal with and without art | Rebuild-in-CT (G10) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS208 | 7448 | with Dialogs glass on, a LIGHT dialog stays at least as opaque as the reading plate, a DARK one is glass | alpha comparisons | Rebuild-in-CT (G10) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS209 | 7492 | #623 census: EVERY glass surface over worst-case art clears AA on the LIGHT arm | six surfaces >= AA | Rebuild-in-CT (G10, room) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS210 | 7530 | the composer and the three bubbles do not move on the DARK arm | byte-identity against plain twin | Rebuild-in-CT (G10, room) | `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` |
| AS211 | 7618 | #1669 phone Characters chrome at 320/390: LIST band shed, chrome above first row <= 290px | band hidden; geometry budget | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx` (production Characters section with `routeTrpc` for `character.list`) |
| AS212 | 7633 | #1669 phone: the band's two doors are on the TOPBAR TRAIL only while the list is the screen (320/390) | New and Import in trail; New gone when a character is open | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx` |
| AS213 | 7664 | #1669 @desktop: the Characters LIST band keeps its own doors | band has New; trail has none | Rebuild-in-CT | `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx` (control) |
| AS214 | 7688 | #1789 the cmd chip is the topbar.trail MODAL entry's presentation | no entry means no chip | Rebuild-in-CT (G23) | `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx` with `isolationRegistry` for the chrome registry subset (isolation reason: the chrome projection is the subject and the widget with an earlier order is the case input); the production modal registry stays underneath |
| AS215 | 7698 | #1789 its POSITION is the registry's sort | widget order -20 precedes chip | Rebuild-in-CT (G23) | `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx`, same `isolationRegistry` subset as AS214 |
| AS216 | 7714 | #1789 @fence the production trail still LEADS with the cmd chip | first trail button is the chip | Drop | Self-described fence that passed before the fix (reference `app-shell.ct.tsx:7711`); AS214 and AS215 pin the registry projection |
| AS217 | 7729 | a floating CONTEXT pane floated from inside a popover leaves focus in the popover | overlay; reveal still focused | Rebuild-in-CT (G19) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS218 | 7740 | a keyboard-opened CONTEXT pane takes focus without a focus ring | pane focused, outline none | Rebuild-in-CT (G19, room) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS219 | 7753 | closing the CONTEXT sheet returns focus to its toggle | toggle focused | Rebuild-in-CT (G19, room) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS220 | 7766 | closing a DOCKED CONTEXT pane returns focus to its toggle, never <body> | toggle focused | Rebuild-in-CT (G19, room) | `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` |
| AS221 | 7781 | Home section inset in the real phone shell | shelf edges 0, overflows, content padding 0, Tab scrolls face into view | Move (done e4e66d4384) | `tests/e2e/corpus-shell.spec.ts (new)` (phone project, real Home with corpus characters; derive the face count from the read) Stays CT: the content region's zero inline padding and the coarse-pointer probe, rebuilt in leg C (shell CTs). |
| AS222 | 7832 | page identity outranks body without changing control geometry @320/360/430 | title uses display size, ellipsis, contained; controls >= 48px | Rebuild-in-CT (room) | `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx` |

### Collapse groups

Each group is one table-driven CT case set. The rows are cells of one matrix (surface, preference, viewport, door, direction) or a defect and its control. Keep every cell as an assertion row with its control. The target count is the number of CT cases written, not the number of rows. Groups G16 (with AS69) and G29 to G33 go beyond the review's list; the Review section says so.

Self-described fences with no defect are dropped, as AS41 was: AS98, AS101 and AS216.

| Group | Collapse | Rows | Target CT cases |
| - | - | - | - |
| G1 | Glass and elevation census | AS114, AS115, AS116, AS117, AS122, AS123, AS124 | 2 |
| G2 | Collapsed pane glass | AS118, AS119 | 1 |
| G3 | Promotion shapes on both carriers | AS120, AS151 | 1 |
| G4 | Glass viewport scope | AS125, AS126 | 1 |
| G5 | Reduced transparency | AS127, AS128, AS129, AS130 | 2 |
| G6 | Contrast | AS132, AS133, AS134, AS135, AS136, AS137, AS138, AS139, AS146 | 4 |
| G7 | Grain | AS140, AS141, AS142, AS143, AS144, AS145 | 3 |
| G8 | Background image and hero scrim | AS147, AS148, AS149, AS150, AS152, AS153, AS154, AS155 | 3 |
| G9 | Boot hint | AS161, AS162, AS200, AS201, AS202 | 2 |
| G10 | Wallpaper plate | AS203, AS204, AS205, AS206, AS207, AS208, AS209, AS210 | 3 |
| G11 | Motion doors | AS95, AS96 | 1 |
| G12 | Phone motion cancel | AS89, AS94, AS105 | 1 |
| G13 | Centred counter | AS90, AS91 | 1 |
| G14 | FLIP gating | AS85, AS86 | 1 |
| G15 | Overlay dismissal (scrim and Escape) | AS75, AS76, AS78, AS79, AS80, AS81 | 2 |
| G16 | Context carry across list toggles | AS66, AS67, AS68, AS69 | 2 |
| G29 | Sheet elevation and inertness | AS173, AS174, AS175, AS176 | 2 |
| G34 | Empty Explore handoff (one controlled-empty case) | AR13, AR14 | 1 |
| G30 | Phone and desktop DOM order | AS198, AS199 | 1 |
| G31 | Landmark pair | AS189, AS190 | 1 |
| G32 | Narrow overlay open paths | AS73, AS74 | 1 |
| G33 | Phone sheet geometry, rung and dismiss | AS172, AS177, AS178 | 2 |
| G17 | Both-docked squeeze | AS110, AS111, AS113 | 1 |
| G18 | Pane capability per section | AS53, AS169, AS170, AS171 | 1 |
| G19 | Context pane focus | AS217, AS218, AS219, AS220 | 2 |
| G20 | Appearance profiles | AS63 | 2 |
| G21 | Topbar at 1280 | AS55, AS56, AS58 | 1 |
| G22 | Phone topbar geometry | AS191, AS192, AS193, AS194, AS196 | 2 |
| G23 | Trail order | AS214, AS215 | 1 |
| G24 | Shortcut handling | AS15, AS16, AS18, AS19 | 2 |
| G25 | Shortcut lifetime | AS20, AS22 | 1 |
| G26 | Modal theme and density | AS34, AS36, AS37, AS38 | 2 |
| G27 | Notices and drop guard | AS1, AS2, AS3, AS4, AS166, AS167, AS168 | 3 |

## Plan

### Leg B: e2e additions

| Target spec | Mode and project | Reference rows |
| - | - | - |
| `tests/e2e/corpus-shell.spec.ts` | single-user corpus, desktop and phone projects (new file) | AR2, AR3, AR4, AR6, AR7, AR8, AR9, AR23, AR24, AR25, SS1, SS2, AS45, AS47, AS48, AS51, AS179, AS180, AS181, AS182, AS183, AS186, AS187, AS188, AS221 |
| `tests/e2e/corpus-signed-out.local.spec.ts` | local-mode corpus, desktop project | RT1, RT2, RT3 |
| `tests/e2e/corpus-workbench.spec.ts` | single-user corpus, desktop and phone projects | AR10, AR11, AR12, AR15, AR17, AR18 |

### Leg U: unit tests

Pure rules get a unit test; a CT keeps one wiring case where the DOM attribute matters.

| Target unit test | Reference rows |
| - | - |
| `tests/client/features/app-shell/components/section-topbar-title.dom.test.ts` | AR16 |
| `tests/client/features/app-shell/lib/command-shortcut-label.test.ts` | AS164, AS165 |
| `tests/client/state/panel-resolve.test.ts` | AS70 |

### Leg C: CT rebuilds

Total target: 135 CT cases from the rebuild rows, against 205 rows. The review estimated 120 to 135. The extra merges are listed under the collapse groups.

| Target CT | Reference rows | Target cases |
| - | - | - |
| `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` | AS108, AS114, AS115, AS116, AS117, AS118, AS119, AS120, AS121, AS122, AS123, AS124, AS125, AS126, AS127, AS128, AS129, AS130, AS132, AS133, AS134, AS135, AS136, AS137, AS138, AS139, AS140, AS141, AS142, AS143, AS144, AS145, AS146, AS147, AS148, AS149, AS150, AS151, AS152, AS153, AS154, AS155, AS157, AS158, AS159, AS160, AS161, AS162, AS200, AS201, AS202, AS203, AS204, AS205, AS206, AS207, AS208, AS209, AS210 | 28 |
| `tests/client/features/app-shell/surfaces/app-shell-command.ct.tsx` | AR22, AS15, AS16, AS17, AS18, AS19, AS20, AS21, AS22, AS26, AS27, AS28 | 9 |
| `tests/client/features/app-shell/surfaces/app-shell-modals.ct.tsx` | AS14, AS29, AS30, AS31, AS32, AS33, AS34, AS35, AS36, AS37, AS38, AS82 | 10 |
| `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` | AS83, AS84, AS85, AS86, AS87, AS88, AS89, AS90, AS91, AS92, AS93, AS94, AS95, AS96, AS97, AS99, AS100, AS102, AS103, AS104, AS105, AS106, AS107, AS112, AS184, AS185 | 21 |
| `tests/client/features/app-shell/surfaces/app-shell-notices.ct.tsx` | AS1, AS2, AS3, AS4, AS5, AS6, AS166, AS167, AS168 | 5 |
| `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` | AS10, AS11, AS12, AS13, AS39, AS40, AS42, AS43, AS44, AS53, AS54, AS62, AS63, AS64, AS65, AS66, AS67, AS68, AS69, AS71, AS73, AS74, AS75, AS76, AS77, AS78, AS79, AS80, AS81, AS109, AS110, AS111, AS113, AS169, AS170, AS171, AS173, AS174, AS175, AS217, AS218, AS219, AS220 | 29 |
| `tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx` | AS23, AS24, AS25, AS46, AS49, AS50, AS52, AS172, AS176, AS177, AS178, AS189, AS190, AS195, AS198, AS199 | 12 |
| `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx` | AR19, AS55, AS56, AS57, AS58, AS59, AS60, AS61, AS163, AS191, AS192, AS193, AS194, AS196, AS197, AS211, AS212, AS213, AS214, AS215, AS222 | 15 |
| `tests/client/features/app-shell/surfaces/section-roster-census.ct.tsx` | AR20 | 1 |
| `tests/client/features/discovery/components/corpus-explore-empty.ct.tsx` | AR13, AR14 | 1 |
| `tests/client/features/persona/anchors/first-run-persona-dialog.ct.tsx` | AR5 | 1 |
| `tests/client/routes/route-pending.ct.tsx` | RP1, RP2, RP3 | 3 |

Leg C steps, in order:

1. Done (17a2b33d62): add one shared ambient-read helper, `createShellAmbientReads(corpus)` in `tests/support/node/ct-shell-reads.ts`, published on the `@orb/testkit/ct` door. It returns a `routeTrpc` map built on `createCorpusReadResponder` over the `ct-corpus` fixture's `corpus`, the pattern `tests/client/features/config/surfaces/config-content-surface.ct.tsx` uses for `sessions.me`, `settings.getUserSettings` and `settings.listThemes`. No rebuilt spec types its own ambient backend. The map holds the reads the shell issues when it mounts on Home (`SHELL_AMBIENT_PATHS`), found by mounting it against the corpus server. It is a subset of the list in step 2: the other procedures belong to the sections the later specs open, and each spec adds the reads its own subject owns. `tests/support/browser/ct-shell-reads.ct.tsx` is the proof.
2. Done (17a2b33d62): extend the committed corpus captures for the ambient procedures that `corpus.reads` does not hold. `tests/support/node/corpus-data/corpus.json` captures `character.count`, `character.list`, `chat.countChats`, `chat.getChat`, `chat.listChats`, `databank.bankHealth`, `databank.list`, `notifications.list`, `persona.list`, `regex.countScripts`, `rosterPreset.count`, `sessions.me`, `settings.getUserSettings`, `settings.listThemes`, `stats.leaderboard`, `tag.listPendingSuggestions` and `worldInfo.countBooks`. Missing: `tag.listTagsWithUsage`, `regex.listScripts`, `worldInfo.listBooksWithUsage`, `rosterPreset.list`, `connection.listBindings`, `connection.list`, `refinery.listSessions`, `plugin.listCommands`, `automation.listRulePresets`, `chat.listMessages`, `discovery.catalog`, `discovery.home`, `preset.list`, `plugin.list`, `plugin.listSurfaces`. Some already exist in nested cohorts (`corpus.pluginLibrary`, `corpus.libraryRelations.reads.presetList`, as `native-guest-protocol.ct.tsx` and `list-lifetimes.ct.tsx` read them); reuse those before capturing again. Republish through `pnpm exec node scripts/corpus-fixture.ts publish`, per the testkit README. `chat.reapTemporaryChats` is a mutation: type its answer with `TrpcWireOutput<"chat.reapTemporaryChats">`. The shell sends page sizes the plain captures do not hold, and the responder matches the exact input. The `shellAmbient` cohort (`tests/support/iso/corpus-shell.ts`) captures those requests with the `HOME_*_LIMIT` contract constants the client imports, plus the reaper answer and the room roster of each recents row. The remaining procedures in the list above stay uncaptured until a spec mounts the section that reads them.
3. Rows tagged `room` need a real chat room: `chat.getChat`, `chat.listMessages`, messages per role and any room subscription, taken from the corpus room. Build the room fixture once in the helper.
4. Write the specs in this order: notices, modals, command, panels, responsive, topbar, motion, appearance, then the persona, discovery, roster and `route-pending` specs. Run each red first against a planted production defect named in its rows. Rows that assert an absence carry their positive control in the same case.

### Rule line for lanes touching the shell

The deleted line named two CT files that do not exist. Propose this replacement for `.claude/rules/browser-tests.md` under "Stories and seeds". The owner of that file applies it.

> A lane touching the app shell, the first-run persona gate or the home launcher runs `tests/e2e/smoke.spec.ts`, `tests/e2e/corpus-home-launch.spec.ts` and `tests/e2e/corpus-joiner.local.spec.ts` with `E2E_LIVE=0 E2E_ALLOW_DEV_TARGET=0 pnpm e2e <paths>`, plus `pnpm test:ct tests/client/features/auth/components/login-pending-join.ct.tsx tests/client/features/chat/anchors/join-invite-dialog.ct.tsx`.

When the rebuilds land, extend the line with `tests/e2e/corpus-shell.spec.ts`, `tests/client/features/persona/anchors/first-run-persona-dialog.ct.tsx` and the `app-shell-*.ct.tsx` specs that cover the changed region. The ambient reads the old line called a feed come from the leg C helper `createShellAmbientReads`.

### Rows handed over from 0977

- Character list-header title and create-door widths at the docked 307 and 272 px widths: target `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx`, both panes docked at 1280. The widths come from the `.shell-panel` grid and the `@container` query on it, so only the real shell reproduces them.
- The databank Add dialog's mode strip and footer geometry, teaching-sentence size and Cancel in every arm: target `app-shell-modals.ct.tsx`. Only the shell's `ModalHost` renders the `addDocument` slot.
- AR16 needs a pure `censusTitle(label, census)` that the section title hooks share (the empty-census rule repeats inline across those hooks); its unit test lands with that extraction.

## Review

An independent review compared the first reference case map with the reference files, the cited maintained specs, and `tests/support`. Verdict: refuted. The map was close, but one Keep cited evidence that does not exist, a phone navigation family sat in CT while its siblings moved to e2e, two Drops misread the Drop rule, two pure functions had browser cases, and leg C named no source for the shell's ambient reads. The map and the register rows were revised to match.

Changed:

- AS13 was Keep. `corpus-config-back-stack.spec.ts:30` uses `page.goto("/config")` and `tests/e2e/support/config-flow.ts:8` uses `page.goto(formatConfigLink(group))`; neither clicks the rail or asserts that no dialog opens. It is now a CT row.
- AS179, AS180, AS181, AS186, AS187 and AS188 are phone push and Back walks over real list rows. They moved to `corpus-shell.spec.ts` beside AS182 and AS183. AS189 and AS190 (landmarks) stay in CT.
- AS70, AS164, AS165 and AR16 are pure rules and moved to unit tests. AS65 keeps one wiring CT case. `resolvePanelMode` has no maintained test (`rg resolvePanelMode tests` finds none).
- AR13 and AR14 were Drops. They are one controlled-empty CT case over the production Corpus Explore section.
- AS72 was Keep with a weak citation. It is a Drop with a covering reason. AS98, AS101 and AS216 are Drops (self-described fences).
- The rebuild rows collapse into table-driven cases, listed under the collapse groups.
- AS46 no longer uses `isolationRegistry`. AS52, RT3 and AS166 have one home each. AS63 reads its profile list from `appearance-presets.json`. AS123 mounts bubbles inside the production shell.
- Leg C now names the shared ambient-read helper, the missing captures and the rows that need a room.
- The register has the app-root row corrected, and Unreviewed rows for the sibling reference files that overlap these cases.

Where this revision differs from the review:

- The review says to use captured `discovery.*` reads with zero digests for AR13 and AR14. `tests/support/node/corpus-data/corpus.json` has no `discovery.*` capture at all, so leg C step 2 adds one. The first map's claim that the committed corpus is distilled had no evidence and is withdrawn.
- The review says 15 of the 30 ambient reads lack captures. A count of `corpus.reads` agrees, but some of the missing procedures exist in nested cohorts (`native-guest-protocol.ct.tsx:285-305`, `list-lifetimes.ct.tsx:14-17`). Leg C step 2 reuses them first.
- The review counts about 40 rows that need a room. The tagged set is 33 rows (AS1, AS55 to AS61, AS85 to AS97, AS99 to AS100, AS104, AS122, AS123, AS127, AS209, AS210, AS218 to AS220, AS222). A row outside the list that proves to need a room joins it at write time.
- The review's estimate is 120 to 135 cases. This revision reaches 135 by adding the merges G16 (AS69), G29 to G33, which the review did not list. A merge that hides a distinct failure should be split again.
