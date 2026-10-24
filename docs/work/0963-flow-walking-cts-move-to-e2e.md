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

## Plan

### Leg B: e2e additions

No journey is uncovered. Leg B adds no spec.

### Leg C: CT deletions

No Reuse or Drop row exists. Leg C deletes no CT.

### Follow-ups outside the CT population

- [ ] Repoint `.claude/rules/browser-tests.md`: it tells a lane touching the app shell to run `app-root.ct.tsx` and `route-pending.ct.tsx`, and neither file exists in the tree. Name the e2e specs that cover the shell instead.
- [ ] Add [restoration register](../plans/restoration-register/design.md) rows for the reference flow CTs `client/routes/app-root.ct.tsx`, `client/routes/route-pending.ct.tsx`, `client/routes/router.ct.tsx`, `client/routes/stuck-splash.suite.ct.tsx` and `client/features/app-shell/surfaces/app-shell.ct.tsx`. They have no row. Decide each as Move to corpus e2e or Drop, against `smoke.spec.ts` and `corpus-home-launch.spec.ts`. That decision needs a read of the reference files and is not part of this classification.
