---
kind: plan
status: active
updated: 2026-10-27
---

# Cross-surface visual consistency

## Goal

Make related Orbweaver surfaces read and behave as one product across desktop, phone portrait and landscape, and applicable side-panel states.

## Shape

Compare related production surfaces at matching appearance settings and effective content widths. Fix shared composition owners and inconsistent adoption in bounded batches. Main drives the application; implementation lanes prepare production-mounted regressions; independent review judges the comparisons and repaired states.

### Order

Judge a surface only after every planned change to it has landed. Steps 2 to 6 run beside each other where their files do not overlap; a step that changes a surface another step is still building waits for it. Acceptance starts only when steps 1 to 6 have landed.

| Step | Work | Items |
| - | - | - |
| 1 | Use-specific extraction and the tone-ink floors | [1421](../../work/1421-build-the-tone-role-tier-and-one-variant.md) step 4, [1470](../../work/1470-floor-the-remaining-page-family-inks-on-tone.md), then a rendered review of step 4 on the owner-data clone |
| 3 | Enlarged text | [1438](../../work/1438-repair-the-shell-composer-and-dialog-layouts-at.md); with the push barrier it closes [1299](../../work/1299-build-the-css-system-ramps-conditions-locked-tsx.md) |
| 4 | Chat styles match the Moonlit reference | [0913](../../work/0913-chat-art-polish-broken-image-chip-flash-initial.md) |
| 5 | Page templates | [1489](../../work/1489-build-the-page-template-tier-and-move-features.md) |
| 6 | Visible labels and accessible names | [1403](../../work/1403-reconcile-visible-control-labels-with-accessible-names.md), [1426](../../work/1426-import-ct-and-e2e-accessible-name-labels-from.md) |
| Beside 2 to 6 | The automated walkthrough | [1401](../../work/1401-build-and-qualify-the-native-automated-surface-walkthrough.md) phase B |
| 7 | Comparative acceptance | [1392](../../work/1392-complete-cross-surface-composition-acceptance.md), then [1397](../../work/1397-complete-characters-and-chat-comparative-acceptance.md); the persona and plugin reviews [0908](../../work/0908-side-eye-the-persona-switcher-room-block-and.md) and [0909](../../work/0909-side-eye-the-plugin-column-overlay-and-phone.md) run inside them |
| 7a | Open findings and small builds in a family land, or close with the capture that shows them gone, before acceptance scores that family | [0550](../../work/0550-rule-editor-polish-from-the-automation-lane-review.md), [0839](../../work/0839-phone-pass-p3-bundle.md), [0910](../../work/0910-persona-model-follow-ups-from-the-885-lane.md), [0911](../../work/0911-plugin-column-follow-ups-escape-reach-undo-focus.md), [0621](../../work/0621-corpus-readiness-rows-say-why-a-pass-did.md), [0679](../../work/0679-attribute-tiles-are-number-inputs-with-a-range.md), [0725](../../work/0725-pocket-arcade-fits-its-flank-and-its-grant.md), [0927](../../work/0927-third-party-topbar-extensions-render-their-own-button.md), [0341](../../work/0341-resolve-rpg-rest-position-and-target-audit-findings.md) |
| 8 | Integrated verification | [1396](../../work/1396-complete-integrated-consistency-verification.md) |

## Page templates

Step 5 gives each recurring page shape one composite in `packages/client/src/components/`. A template declares its tier, composes `@orb/ui` layout primitives and the step-4 named components, and overrides no primitive skin. Features pass content into its slots. [Item 1489](../../work/1489-build-the-page-template-tier-and-move-features.md) tracks the work.

### Survey

The survey ran `ast-grep` in both the `ts` and `tsx` languages over `packages/client/src` (815 `ts` files, 838 `tsx` files scanned), plus a literal `rg` for class tokens. Each shape's signature is the structure the template will own.

| Shape | Signature | Existing composite | Feature sites that rebuild it |
| - | - | - | - |
| List page | a focus-target `Stack` root with a `ListSearch` search row and a scroll body, in the instrument tier | `LibraryListFrame`, `LibraryListLayout`, `LibraryListRows`, `LibrarySurfaceShell` in `packages/client/src/components/library-surface.tsx` | `packages/client/src/features/tag/surfaces/labels-list-surface.tsx`, `packages/client/src/features/stats/surfaces/analytics-list-surface.tsx`, `packages/client/src/features/chat/surfaces/chat-list-surface.tsx`, `packages/client/src/features/character/surfaces/character-library-surface.tsx` with `character-library-toolbar.tsx`, `packages/client/src/features/discovery/surfaces/corpus-list-surface.tsx`, `packages/client/src/features/config/surfaces/config-list-surface.tsx` with `config-search-input.tsx`; the frame consumers `refinery-list-surface.tsx`, `databank-library-surface.tsx`, `preset-library-surface.tsx`, `extensions-switcher-surface.tsx` each still hand-build the focus root |
| Detail header | a content-pane name marked `data-shell-identity="defer"`, its state marks and its own verbs | `MemberDrillHeader` in `packages/client/src/components/member-drill-header.tsx`, for drilled collection members | `packages/client/src/features/databank/surfaces/databank-detail-surface.tsx`, `packages/client/src/features/stats/surfaces/analytics-character-surface.tsx`, `packages/client/src/features/refinery/components/session-masthead.tsx`, `packages/client/src/features/preset/components/preset-editor-header.tsx` |
| Settings pane | the config CONTENT arm that stacks a group's sections under its pane title | `SettingRowGroup`, `SettingRow`, `SettingSwitchRow`, `SettingTrackRow` own the rows inside a section | `packages/client/src/features/config/surfaces/config-content-surface.tsx` `GroupBody` |
| Editor | the centered content column `mx-auto inline-full max-inline-(--width-content-col) @cq-64:max-inline-(--width-content-col-wide)` | none | `packages/client/src/components/tag-editor-body.tsx`, `regex-member-surface.tsx`, `roster-member-surface.tsx`, `databank-detail-surface.tsx`, `packages/client/src/features/world-info/components/entry-editor.tsx`, `preset-editor-surface.tsx`, `preset-editor-header.tsx`; the fixed instrument cap in `params-deck.tsx`; the start-aligned caps in `labels-library-surface.tsx` and `packages/client/src/features/automation/components/rule-editor.tsx` |
| Collection grid | a `Grid` with `role="list"` whose cells are `listitem`s | none | `packages/client/src/features/character/components/character-shelf.tsx`, `packages/client/src/features/discovery/components/corpus-gem-tiles.tsx`, `packages/client/src/features/discovery/components/corpus-family-map.tsx`, `packages/client/src/features/roster-preset/components/home-rosters-tile-body.tsx` |

Out of the survey: CONTEXT panel bodies, the chat room, the home and corpus dashboards and dialogs. Their shapes are not one of the five, and the item names no template for them.

### Template API

| Template | Tier | Slots and props | Replaces |
| - | - | - | - |
| `ListPage` | instrument | `ref` (the focus target), `label` (names the root as a region), `skipTo` (the skip link's label), `lead` (above the search row), `search` (the search control), `searchAside` (controls on the search row), `filters` (below the search row), `body` (`scroll`: the body scrolls; `bounded`: the body is a bounded column whose content scrolls itself; `pane`: the whole pane scrolls), children | `LibraryListFrame` and `LibraryListLayout`; `LibraryListRows` keeps the rows and their radiogroup contract, `LibrarySurfaceShell` keeps the boundary |
| `DetailHeader` | inherits its host's tier | `title`, `step` (`title` for a member or document name, `masthead` for a workbench's one opening statement), `kicker`, `meta` (state marks beside the name), `actions` (the subject's own verbs), `deferToShell` (the narrow topbar carries the visible name; the heading stays in the outline), children (lines under the name) | the hand-built identity rows |
| `SettingsPane` | form | `title` (the pane's heading node), children (the sections) | the sections arm of `GroupBody` |
| `EditorPage` | `form` or `instrument`, from `kind` | `kind` (`form`: the column breathes past `@cq-64`; `instrument`: a control-track instrument holds the narrow cap), `inset` (`none`, `block`, `section`), and the `Stack` props except `className` | the hand-spelled centered column |
| `CollectionGrid` | inherits its host's tier | `label` (the list's name), `cols` (`auto`, `cellShelf`, `pairWide`), `gap` (`tight`, `row`), `items`, `itemKey`, `renderItem`; each cell is a `listitem` wrapper | the hand-built list grids |

`DetailHeader` and `CollectionGrid` render no `Surface`: they sit inside a page that already declares a tier, and a same-tier nested `Surface` is refused by the surface census. Every LIST pane takes the one pane gap, `row`.

### Lint

`orb/page-template-shapes` refuses, in `packages/client/src/features/**`, a `ListSearch` element, the `data-shell-identity` attribute, a class string or template quasi with `mx-auto` beside `max-inline-(--width-content-col)`, and a `Grid` with `role="list"`. Each signature is owned by exactly one template. A start-aligned cap without `mx-auto` is a measure, not the editor column, and passes. A column split across template quasis escapes the rule. The settings pane has no precise signature: its sections are legitimate feature code and its host exists once, so that shape has no rule.

### Judgment sites

| Site | Choice |
| - | - |
| `databank-library-surface.tsx` | The search moved above the boundary with its state, so it shows while the read is in flight, as on Presets. The re-extract banner and the phase chip ride `lead` in their old order. |
| `labels-list-surface.tsx`, `character-library-toolbar.tsx` | The search row keeps the search at `--width-field-floor` and wraps its aside, the Characters rule. Labels let the search shrink before. |
| `character-library-toolbar.tsx` | The toolbar split into `CharacterSortSelect` on the search row and `CharacterViewGroup` in `filters`. |
| `chat-list-surface.tsx` | The clear glyph moved inside the search slot, so `ListSearch` now also marks it. |
| `config-list-surface.tsx`, `config-search-input.tsx` | The cmdk search and its in-place results are one control, so the whole command is the `search` slot. The shelves keep their section gap inside the body. |
| `corpus-list-surface.tsx` | The target select is `lead`. The pane root is now a programmatic focus target; arrival focus still lands on the omnibox. |
| `session-masthead.tsx` | The workbench masthead keeps the display step through `step="masthead"`. The state chips and the credit ride `meta`; the two doors are `actions`. |
| `preset-editor-header.tsx` | Every header verb is `actions`. A detail header truncates its name on one line, the Presets band budget; the Databank and Insights names, which wrapped, now truncate. |
| `analytics-character-surface.tsx` | The pane gains its `h2`; the painted name was a bare `Text`. |
| `params-deck.tsx` | The ratified instrument cap is `EditorPage kind="instrument"`, which now owns the deck's instrument `Surface`. |
| `labels-library-surface.tsx`, `packages/client/src/features/automation/components/rule-editor.tsx` | A start-aligned cap, not the editor column; unchanged. |
| `corpus-family-map.tsx`, `character-shelf-face.tsx` | The `listitem` role moved from the plate and the face to the grid's wrapper. |
| `home-rosters-tile-body.tsx` | The list gained the name `Saved rosters`; it had none. |

## Rejected

Do not substitute board closure, isolated screenshot scores, overflow-only checks, or unexplained screenshot baselines for comparative acceptance. Do not introduce page-specific appearance knobs or a second design system.

## Coupled sites

Existing UI and client laws, semantic ramps, plugin attribution and authoring contracts, testkit layering, and remaining action-group qualification.

## Test plan

Use meaningful old-source failures for changed geometry or behavior, production-mounted Chromium and WebKit checks, applicable existing integration and E2E coverage, and independently scored same-profile rendered comparisons.

The coverage sections below own accepted comparisons and explicit limits. The task index is generated from linked work items.

## Acceptance

Compare related production surfaces at matching appearance settings and effective content widths. Legal tokens and isolated containment checks do not establish visual consistency.

Use production defaults as the reference configuration, not as an approved screenshot baseline. Record appearance, pointer, viewport, panel state and data state.

An accepted family needs coherent hierarchy, proportions, alignment, action placement and reading flow. Preserve task-specific differences with an explicit reason.

Keep stress configurations separate. Check affected layouts with enlarged text, coarse portrait, short landscape and applicable panel combinations.

Main drives the private owner-data clone. Keep private content and images outside source control.

## Coverage families

| Family | Required application coverage | Current disposition |
| - | - | - |
| Settings forms | Appearance, chat behavior, Connections, Jobs, Personas, install settings, Admin, Automation and Backup | Repaired scalar, choice and explicit-submit targets accepted; broader family comparison remains open |
| Collection authoring | Characters, World Info, Regex, Rosters, Presets and Databank | Populated collection landings, Persona feedback and Preset header accepted; remaining editor comparisons stay open |
| Library and navigation | Home and each rail collection; empty, populated, selected and filtered states | Home desktop and portrait composition accepted; carousel endpoint proven by DOM scrolling, not touch transport |
| Corpus | Explore, Insights and Tags, including relevant detail panels | Insights pane-local accounting presentation accepted; remaining family coverage stays open |
| Plugin UI | Installed management, actual guest settings, plugin pages and chat contributions with enabled plugins | Pictured management, Research Familiar, Atlas, Album and Deck states accepted; other guest flows remain separate |
| Dialogs | Explicit-submit forms, prompts, pickers and autosaving editors | Shared explicit-submit footer targets accepted; other dialog types remain in scope |
| Chat | Composer and menus, group controls, message modes, actions, avatars and plugin/context integration | Desktop, portrait and landscape tails compared; starts, user boundaries and remaining menu reach remain open |

## Qualified repairs

- Shared inline choices and scalar settings use existing semantic tracks. Native Chromium/WebKit cases and independent target comparisons pass.
- Schedule create/edit footer and Backup download actions remain visible and reachable in their qualified states.
- Collection headings, filters, member identity and open creation actions pass their bounded native and rendered checks.
- Persona uses local save feedback. Its macro counter follows the textarea footprint; desktop and portrait after-review accepts both fixes.
- Plugin action leaves retain intrinsic sizing without changing guest contracts. Deck and Research Familiar comparisons preserve authored order and attribution.
- Insights retains every accounting caveat in each independently scrolling pane's existing disclosure.
- Document retains its identity-free manuscript and quiet actions at rest. Its full-width pinned band closes partial-line masking in portrait and landscape.
- Preset uses a naturally wrapping header above its existing tab strip. Native action/error cases and independent desktop, portrait and landscape comparisons pass.
- Connections preserves its semantic heading, distinguishes missing credentials from keyless providers, and reflows narrow model identities. Independent portrait comparison accepts these repairs.
- Echo and Whisper expose one image action per message. Actual decorative-art activation and canonical focus return pass independent portrait review.
- Shared Tabs reveals the focused terminal cell and its complete focus ring without moving the editor vertically. Independent Preset comparison accepts the repair.
- Tide retains its paragraph train and resting identity pill. Its pinned backing covers the reading strip; independent short-landscape comparison accepts the repair.
- Refinery retains distinct named-session identity, routes Context to the existing Score control, and displays the pinned original with paragraph-local reading measures.
- Databank preserves accessible identity, readable maintenance controls and literal source prose. Production-mounted checks and independent populated fixture comparisons pass.
- Illustrated chat interiors preserve distinct art placement and pinned reading flow in portrait and short landscape. The captures establish positioned states, not continuous gesture behavior.
- Atlas reports handled search failures without pristine-state instructions. Independent owner-clone desktop and portrait after-review accepts the guidance repair.
- Shared configuration libraries and Refinery expose direct filter recovery. Actual Regex and populated-fixture Refinery comparisons accept the recovery controls.
- The action-group qualification record at `reports/surface-consistency-private/governed-doc-recovery/originals/docs/reviews/action-group-qualification.md` records completed candidate dispositions, native proof and explicit exclusions.

## Additional accepted repairs

| Owner | Accepted repair | Scope |
| - | - | - |
| Refinery conflict review | Guidance and long status chips wrap without squeezing explicit decisions | Native Chromium/WebKit checks and populated fixture comparison |
| Insights identity | Narrow presentation defers redundant name paint | Owner-clone portrait comparison; desktop identity and accounting scope retained |
| Plugin image presentation | Shared image leaf honors declared aspect ratios | Native loaded/missing/broken cases and populated Album portrait/desktop comparison; natural ratio remains unchanged |

Refinery identity, original-viewer opening, Score navigation and viewer readability pass independent actual after-review. Singular greeting copy is source-qualified.

Connections source review accepts the integrated implementation and matching Chromium/WebKit cases. The phone application capture preserves readable model identities and accurate credential guidance.

Databank's old-source cases reproduce identity, maintenance and source-reading defects. The integrated repair passes compiler, Chromium, WebKit and independent source review. Populated desktop and portrait after-review accepts the repairs.

Tags uses shared autosave feedback and inline merge confirmation. Native checks, source review and actual portrait confirmation review pass. Cancel preserves the editor and returns focus.

Roster preserves explicit submission. Successful saves acknowledge the returned row without discarding newer edits; external-conflict cases remain protected.

## Active-state evidence limits

Atlas search reaches handled upstream failure on desktop and portrait. Repaired guidance passes independent review. Successful remote details use supplementary production-mounted guest evidence, not owner-data success.

Supplementary corpus captures provide populated Databank, dossier and settled Refinery comparisons. They use the production application with fixture data, not the owner's population.

Deck's local draw and reveal pass independent desktop and portrait comparison on the private clone. No retirement or external model action is included.

Narrow plugin Context, the sidecar menu and sheet, and the saved-roster picker pass their pictured comparisons. Closed sidecar presentation is intentional, not missing plugin content.

Insights character and cost readouts preserve explicit accounting scope. Redundant narrow identity is corrected; accounting calculations are outside visual acceptance.

Album population uses the real guest, storage and image pipeline with a local scripted provider. The low-resolution fixture image does not establish generation quality. Gallery, detail image-ratio handling, actions and return controls are accepted in their pictured states.

## Verification discipline

- Run full application and tooling tests, Chromium component tests, supported WebKit cases, E2E, TypeScript, Biome, ESLint and Stylelint on frozen integrated source.
- Record each completed command and its execution population. `pnpm test` excludes tooling; include `pnpm test:tools` separately.
- Freeze checkout writes before native runners.
- Distinguish fixture failures, instrument refusals and demonstrated product failures.
- Reuse passing evidence while source, fixture and execution scope remain unchanged.
- Complete independent source and rendered review for repaired families.
- Keep the broader goal open until every required family and state has an explicit disposition.

Full Stylelint and dependency-cruiser pass their integrated populations. Full-suite acceptance remains open; the private verification record distinguishes failures, scoped repairs and pending commands.

Autosaving editors use Close, Done or Back. Cancel abandons unsubmitted input; it does not promise rollback of saved work.

## Primary-surface deep pass

After integrated verification, review Characters and Chat as complete primary workflows. Inspect List, Content and Context, every tab and nested item.

Compare desktop with applicable side panels, coarse portrait and short landscape with enabled plugins. Judge hierarchy, density, action placement, discoverability and reading comfort, not containment alone.

Reuse accepted evidence only for matching states. Record the complete navigation inventory, review dispositions and remaining gaps. Repair shared owners and inconsistent adoption together.

## Evidence homes

The independent comparison index is `reports/side-eye/2026-10-26-cross-surface-consistency-comparison.md`.

Native evidence and retained application captures are under `reports/surface-consistency-private/`. Its visual index identifies immutable run directories.

The previous repair report at `reports/surface-consistency-private/governed-doc-recovery/originals/docs/reviews/surface-consistency-repair.md` covers its bounded contracts, not acceptance of this comparative goal.

## Test-proof boundaries

Require the following boundaries before broad census results establish acceptance. Witnessed censuses, admitted capture playback, native import boundaries and targeted filesystem-mock and portable-shell restrictions are integrated.

- Require concrete rendered subject witnesses before collecting surface findings. Empty, loading and error scenarios need explicit state expectations.
- Keep raw detectors behind their owned testkit boundary. Product censuses use the witnessed operation, not a no-op readiness callback.
- Execute filtered and paged requests through the production caller. Do not relabel captured outputs for requests that never executed.
- Separate serializable capture data from admitted playback. Bind admitted path, viewer, input presence and output through immutable private identity.
- Reject copied or restamped playback records at runtime. Keep legitimate raw-wire and malformed-response controls separate.
- Derive Node-helper import checks from native compiler populations. Keep server preparation separate from browser DOM drivers.

Use held-read, absent-subject, planted-field, filtered-result and limited-result controls. Verify legitimate empty states and valid captures remain usable.

Semantic witness choice still requires source review. Type safety alone cannot establish that the intended surface was inspected.

Capture and declaration owners use shared leaves without circular imports or duplicated schemas. Native compiler, dependency, custody, publication, rendered-consumer and app-entry checks qualify this boundary. Broader application and visual acceptance remain separate.

## Host portability

Audit shared application, tooling and test helpers for accidental operating-system dependencies. Prefer Node filesystem, path, temporary-directory and process APIs.

Keep necessary platform differences in the existing host adapters. Preserve the self-hosting contract in [D252](../../adr/0252-cross-platform-pnpm-dev.md).

Distinguish portable commands from intentional CI, container and deployment boundaries. Do not use a Linux-only shell operation where a portable Node operation supplies the behavior.

Verify retained enforcement before relying on source comments that name it. Repair confirmed bypasses with existing native checks and discriminating platform cases.

Include filesystem fault controls, path conversion, executable launching and shutdown semantics. Linux execution and injected platform cases do not establish native Windows or macOS execution.

## Composed test selection

Use the primary-surface review to select missing adoption cases without duplicating existing business tests.

| Risk | Required distinction | Existing owner to reuse |
| - | - | - |
| Constrained primary panels | Loaded Characters and Chat subitems remain usable with applicable panel combinations | Production shell and feature CT composition |
| Document reading strip | User prose receives opaque backing as reliably as assistant prose | Dedicated Document pinned-strip suite |
| Late media | Reserved frame and real-room reading position survive delayed image delivery | Shared image renderer and production room |
| Extended composer menu | Last contributed action remains reachable and returns focus in a short host | Real room, installed guest and existing menu controls |
| Initial read arrival | Resolving the first message read preserves an already-typed draft, caret and composer node | Production room lifecycle |
| Narrow editor recovery | Actual conflict and failure controls remain readable and actionable | Existing roster and character editor adoption suites |

Retain existing autosave race, plugin invocation, Tabs focus and scripted-chat persistence coverage. Add only the distinct adoption or lifecycle behavior.

The complete source audit and read inventory remain in `reports/stickler/week-ct-law-and-gaps/`. Source coverage does not establish native execution or physical iOS behavior.

## Preserved product decisions and open comparisons

Keep menu-first attributed plugin commands and the writing and generation rows. Preserve native generation actions and group-chat controls.

Keep Context plugin panels independently collapsible. Sidecar placement remains an explicit choice per panel, with focus transferred when placement changes.

Preserve opaque pinned reading backgrounds and mode-specific identity policies, including Document's identity-free presentation.

Use Flat and small rounded avatars as the reference defaults. Preserve other users' valid saved overrides; prototype dimensions are not tokens.

Qualify automatic active-tab reveal in Presets separately from keyboard focus visibility.

Keep the Insights presentation choice explicit and retain accounting caveats inside each independently scrolling cost pane.

Include the image dialog's lower form in the primary mobile walkthrough. Cold startup, failed aggregate runs and unavailable evidence remain unqualified.

The automated walkthrough plan supplies repeatable collection; independent comparative acceptance remains required here.
