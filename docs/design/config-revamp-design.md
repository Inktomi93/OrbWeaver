---
kind: design
status: active
updated: 2026-09-05
---

# Config revamp — ONE configuration surface, search-first, with the context pane as the teacher (#866)

**Owner ruling (2026-08-30, #866, verbatim):** *"build the new config section with extensibility and forward-thinking in mind along with search options, and then think about using the context panel to intelligently and properly load up and show teaching and definitions so we can move some of the bulk from content into context and make this a proper modern config panel."* Plus the four program clauses: Settings retires into Config · the persona surface moves in · the rail's persona slot becomes switcher · account · log out · the list gets Settings' scroll-spy ("ghost scroll" = scroll-spy, owner clarification on #866). Persona is OWNER-SACRED: the surface relocates and gets the teaching treatment; its editing model does not change here.

**Premise repair, accepted by the orchestrator 2026-08-30:** Settings is NOT a rail section. `packages/client/src/state/section-ids.ts` `SECTION_IDS` is ten members with no `settings`; Settings is the `settings` `ModalDefinition` (`features/settings/lib/settings-modal.tsx`, trigger `rail.end`, the gear beside Theme and the persona widget). So `SECTION_IDS` stays at TEN and what retires is the modal, its gear, its `ModalSlotId` member and the `settingsCategory`/`openSettingsTo` shell state. The "10 → 9" in #866's body and on the canvas counted the rail FOOT glyph, not a section; §5 lists the coupled sites against the tree as it is.

This is a design (`kind: design`, draft). No code, no tuple edit, no gate. It states what the build is held to; the D-ledger wins on any conflict.

## 1. What the field does now (research, receipted)

Method: SearXNG discovery → `trafilatura` reads → the saved text. Every row cites its URL; a row marked THIN was not readable through the fetch path and carries only what the discovery result itself stated.

| Product | Search | Navigation / scroll-spy | Progressive disclosure | Where help lives | Extensibility (plugins) | Modified · reset · default | Keyboard / a11y · mobile | Verdict for us |
| - | - | - | - | - | - | - | - | - |
| **VS Code Settings editor** — <https://code.visualstudio.com/docs/configure/settings> | Search-first; filters typed as `@` tokens: `@modified`, `@ext:<id>`, `@feature:`, `@id:`, `@lang:`, `@tag:accessibility` / `@tag:advanced` (advanced hidden unless asked); a funnel button inserts them; search history + undo | A "table of contents" tree beside the list (added 1.25 — <https://code.visualstudio.com/updates/v1_25> "a table of contents (TOC) that organizes settings"; `settingsSearchTocBehavior` show/hide/filter while searching); a Commonly Used group leads; extensions appear under an Extensions section | `@tag:advanced` hides specialised settings by default; `Experimental`/`Preview` labels | Inline `description`/`markdownDescription` under each row; enum descriptions under dropdowns; `#other.setting#` renders as an in-place link to another setting (<https://code.visualstudio.com/api/references/contribution-points>, `contributes.configuration`) | The `contributes.configuration` contribution point: a JSON-Schema superset per setting (type/default/scope/order/tags/deprecationMessage/ignoreSync); categories with `order`; titles derived from the setting id | A coloured bar on the left of a modified row; gear menu per row: Reset, Copy setting ID, Copy as JSON, Copy settings URL (`vscode://settings/<id>`) | Keyboard-complete; a per-setting URL is the deep link | **The extensibility model to copy** (declare data, host renders; ids are the deep-link and search key) and the `@` token grammar |
| **JetBrains Settings** — <https://plugins.jetbrains.com/docs/intellij/settings-guide.html> | Search over the tree (the `SearchableConfigurable` family); matches light the tree | A fixed parent tree: `appearance` · `build` · `editor` · `language` · `tools`; plugins declare `parentId` + `groupWeight` | Hierarchy by declaration | Per-page Swing forms; no house teaching layer | Extension points `applicationConfigurable`/`projectConfigurable`; `ConfigurableProvider.canCreateConfigurable()` hides a page by runtime condition | Per-page Apply/Reset (dialog semantics) | Dialog; desktop only | The `when`-style runtime gate and the declared parent + weight (we have both: `when` and `order`) |
| **Obsidian plugin settings (1.13 declarative API)** — <https://raw.githubusercontent.com/obsidianmd/obsidian-developer-docs/main/en/Plugins/User%20interface/Settings.md> | A GLOBAL settings search that indexes every plugin's declarative definitions; `visible:false` rows drop out of search; `searchable:false` per list item | Groups (`type:'group'`, heading), lists (add/delete/reorder), sub-pages (`type:'page'`, "use sparingly") | `visible` / `disabled` predicates: hide when irrelevant, disable-but-show when locked | `name` + `desc` per row; a name/desc-only row is a static informational row | Every community plugin registers ONE settings tab through `addSettingTab`; definitions are data (`control.type` ∈ toggle/text/textarea/number/slider/dropdown/file/folder/color) with `defaultValue` + `validate` | `defaultValue` per control; commit on blur/Enter; inline validation error | Mobile: the add affordance becomes a tappable row below the list | **The closest analogue to our contribution registries**: definitions-as-data indexed for search at registration, visibility-gated rows excluded from search — exactly D120's "`when` gates nav, search and render together" |
| **Raycast extension preferences** — <https://developers.raycast.com/information/manifest> · <https://developers.raycast.com/api-reference/preferences> | Preferences are reachable from the root search by extension/command | One Preferences › Extensions tree, per extension, per command (commands inherit and can override) | `required` preferences block the command until set | `description` shown as a TOOLTIP on hover (a weak home — see NN/g below) | Manifest-declared, typed (`textfield`/`password`/`checkbox`/`dropdown`/`appPicker`/`file`/`directory`), a global typed `Preferences` namespace keeps code and manifest in sync | `default` per preference | Desktop only | Typed preferences per contribution; tooltip-only help is the anti-pattern |
| **Linear Preferences** — <https://linear.app/docs/account-preferences> | No settings search; ⌘K is the app's command menu (<https://medium.com/linear-app/invisible-details-2ca718b41a44> records the contextual-menu + shortcut-teaching posture) | Flat pages: General · Interface and theme · Desktop application · Automations | Minimal | One line of prose under a heading per option; the docs page mirrors the UI's own copy | None (not a platform) | — | Keyboard-first app | A dense, terse row voice; nothing to copy structurally |
| **Arc** — THIN | — | — | — | — | — | — | — | Discovery result only: a community thread titled "Arc's settings page is still just... Chrome?" (<https://www.reddit.com/r/ArcBrowser/comments/1lec78q/>) — the settings surface is the inherited Chromium page. No further receipt; excluded from the verdicts |
| **macOS System Settings (13+)** — the NEGATIVE CONTROL: <https://mjtsai.com/blog/2022/06/08/system-settings/> · <https://www.macworld.com/article/836295/macos-ventura-system-settings-preferences-problems.html> · <https://www.macstories.net/stories/macos-ventura-the-macstories-review/8/> · <https://eclecticlight.co/2024/10/13/last-week-on-my-mac-lost-for-words-in-system-settings/> | The one part every critic praises: "but for excellent built-in search, too hard to use" (MacStories); deep matches surface (Tsai) | A sidebar that never shows every item; a one-column stack that hides hierarchy ("If you find an item by search, the left-hand sidebar won't tell you which section you're in" — Macworld) | The opposite failure: flat scrolling lists ("too many settings in one flat list. Section headers aren't enough" — Tsai; Sequoia's Desktop & Dock "a farrago … so deep it even has to be scrolled on a Studio Display" — Eclectic Light) | Help "at the very bottom of the scroll" (Tsai); help pages "paraphrasing the text labels already shown" (Eclectic Light) | n/a | No favourites ("you can't … mark them as favorites" — Macworld) | Lists not keyboard-navigable in early builds; fixed width; switches for checkboxes (Tsai) | **Every failure we must not ship:** a list that lies about where you are, hierarchy hidden behind a back button, help that restates the label, flat unstructured scroll. Its one win — search that surfaces deep matches — is our baseline, not our ceiling |
| **Chromium `chrome://settings`** — <https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/resources/settings/README.md> | The search box asks EVERY plugin `searchContents()`; each plugin highlights its own hits in place and returns whether it has any; a query can show one card of a page ("searching for 'memory saver' … only shows 1 out of the many cards"); URL-addressable (`chrome://settings/?search=…`) | A sidenav entry ↔ one plugin (`<settings-*-index>`); outer switch (which plugin) + inner switch (which view) by route; views are FLAT siblings even when hierarchical to the user | Lazy-rendered plugins/views | Learn-more links; no side panel | The 2025 "plugin architecture": one interface per sidenav entry, the core knows nothing of a plugin's internals | Per-row defaults; reset-all page | Route per view; a11y through standard controls | **Match-highlighting IN PLACE and per-owner search** ("each plugin is responsible for handling the query … and highlighting"): the host asks, the contribution answers. Firefox `about:preferences` was not readable through the fetch path (THIN); it is the same family (highlight-in-place) and is not separately receipted |
| **Figma** — <https://help.figma.com/hc/en-us/articles/5601429983767-Guide-to-the-Figma-desktop-app> · <https://help.figma.com/hc/en-us/sections/4403936365591-Manage-your-account-settings> | No settings search; ⌘K actions menu | Preferences is a MENU (desktop app: Figma › Preferences), account settings a web page | — | Help center articles, link-out | — | — | — | Nothing structural to copy; confirms that "preferences as a menu" only works below \~20 knobs |
| **1Password 8** — THIN (<https://support.1password.com/explore/get-started/> read; the settings page itself was not fetchable) | — | — | — | — | — | — | — | Excluded from the verdicts |
| **Home Assistant** — <https://www.home-assistant.io/docs/tools/quick-bar/> · <https://github.com/home-assistant/frontend/discussions/11511> · <https://www.home-assistant.io/docs/glossary/> | One Quick search (⌘K) over entities · devices · pages · commands ("Navigate: All entries in the sidebar and settings"); fuzzy "bits and pieces" matching; a proposal merged two palettes into one because "having two quick bars isn't necessary" | Settings is a sidebar tree; search is the cross-cut | — | A GLOSSARY page every term links to ("Whenever you see a term you do not recognize in the documentation or in the user interface, you can come back here"); docs inline-expand terms | Integrations register their own options flows | — | Hotkeys can be disabled per user (a11y-motivated) | **One search over everything, and a glossary the UI can point at** — the teaching corpus is a first-class artefact, not per-row prose |
| **Stripe Dashboard** — <https://docs.stripe.com/dashboard/basics> | Global search; `?` for shortcuts | Settings split into Personal · Account · Product; a Shortcuts section of pinned + recently visited pages | Product settings per product | Learn-more links per section | — | — | Keyboard shortcuts documented | The Personal/Account/Product split is our You/App/Collections/Extensions in another domain; pinned recents is a cheap later win |
| **NN/g** — progressive disclosure <https://www.nngroup.com/articles/progressive-disclosure/> · tooltips <https://www.nngroup.com/articles/tooltip-guidelines/> · help <https://www.nngroup.com/articles/help-and-documentation/> | — | — | "Show only a few of the most important options … disclose secondary features only if a user asks"; no more than two levels; the way to progress must be obvious with strong information scent | "Don't use tooltips for information that is vital to task completion"; "Favor pull over push revelations" (help that appears in the user's own context, not on launch); help must be searchable, task-focused, concrete | — | — | Tooltips need keyboard hover AND are unavailable on touch — hence popup tips there | The teacher must be a PULL revelation triggered by the user's own focus, keyboard-reachable, and never the only home of task-vital facts (the one-line inline gloss stays) |

What the good ones agree on, and what we take: (1) the settings surface is SEARCH-FIRST with typed filter tokens and per-setting ids that double as deep links (VS Code, Chromium, HA); (2) contributions are DATA a blind host renders and indexes at registration (VS Code, Obsidian, Raycast) — exactly our registry doctrine; (3) matches highlight IN PLACE, in the list and in the content (Chromium, macOS's one good part); (4) modified/default/reset are per-row affordances, not a page-level Apply (VS Code); (5) help is contextual and PULLED, never tooltip-only (NN/g, HA's glossary); (6) the negative control is a list that hides where you are and a flat scroll with no map (macOS).

## 2. The house as it stands (read, receipted)

Everything below was read in full on the tree at `9707b9672` unless a line range is given.

- **Config today** (`config-rail-spec.md`, R1+R2 BUILT): `features/config` is a THIN HOST over a `config-collections` `ContributorRegistry<CollectionContribution>` (`lib/collection-contracts.ts`): the LIST is the roster of owner-rendered groups (`components/collection-group.tsx` — band = disclosure · icon · kicker · count · bulk · import · create `+`; collapsed by default per C-12; a count-driven filter past `COLLECTION_LARGE_GROUP=30`); CONTENT is the selected member's mounted editor or the welcome (`surfaces/config-content-surface.tsx`, `components/config-welcome.tsx`); CONTEXT is the collection's own arm routed by kind (`components/config-context-body.tsx`, `ContextDefinition kind:"single"`); selection is kinded (`state/config-selection-store.ts`, `goToCollection(kind)` is the cross-section deep link). Three members: tags · regex scripts · world info. `mobile:"sheet"`, `panelDefaults {list:"docked", context:"collapsed"}`, glyph `Package`.
- **Settings today**: a MODAL (`settings-modal.tsx`, `size:"xl"`, trigger `rail.end` "Settings"). The shell (`surfaces/settings-shell-surface.tsx`) = cmdk search over a flattened index (`lib/settings-search.ts` — categories · subcategories · setting leaves, `when`-filtered) + a nav column (`components/settings-nav-column.tsx`: two named groups User/App, `ListRow` category rows with `expanded`, indented subcategory rows with `selected`) + a pane column that mounts ONE category. Active-tracking is SELECTION × SCROLL-SPY: `lib/settings-scroll-spy.ts` (`computeActiveSub` — the section crossing the 30% spy line; the not-scrolled ⇒ first section rule (#549); `flashAnchor`; `afterPaint`), a passive rAF-throttled scroll listener, suppression during programmatic jumps, deep links `openSettingsTo(category, subId)` landing through the same jump path. Narrow arm = push-detail. The aggregate save footer (`settings-save-footer.tsx`) locates failures by section (D120 §3).
- **The two settings registries** (`state/settings-pane-registry.ts`): `SettingsPaneDefinition` (TOTAL over `SETTINGS_CATEGORY_IDS` — nine today: personas · appearance · workloads · backup · chat-behavior · connections · automation · plugins · admin; `group` user/app; `body` = `{kind:"sections"}` skimmer | `{kind:"surface", render}` | `{placeholder:true}`; `subcategories` = nav + search index; `when(viewer)`) and `SettingsSectionContribution` (OPEN; `anchor: SettingsCategoryId`, `nav: SettingsSubcategory`, `owns: SettingsKeyClaim` — the D120 key partition asserted at the door, `body`). Census on this tree: 9 pane defs (`ast-grep 'export const $N: SettingsPaneDefinition = $$$' -l tsx`) and 34 section contributions (`ast-grep 'export const $N: SettingsSectionContribution = $$$' -l tsx`) anchored at appearance (8) · admin (16) · chat-behavior (6) · workloads (3) · plugins (1). `settingsAnchorId(category, sub)` is the ONE anchor-id derivation both the surfaces and the spy use.
- **Shell state**: `shell-store.ts:74-78` `settingsCategory` / `settingsSubcategory`, `:241 openSettingsTo(category, subId?)` (also opens the modal), `:335 closeModal` clears them, `:407-413` `useSettingsTarget`/`useSettingsSubTarget`. `contextTab` is an OPAQUE string by design (lockdown §5 rule 5). `openSettingsTo` has 12 live call sites (`ast-grep -l ts` + `-l tsx`, scanned 557 + 625 files): `agent-nav/index.ts:340`, `databank-context-body.tsx:146`, `corpus-run-job-empty-state.tsx:48`, `plugin-dialog-body.tsx:48`, `corpus-readiness-rail.tsx:177`, `extensions-switcher-surface.tsx:34`, `corpus-understanding-invitation.tsx:98,134`, `extensions-page-surface.tsx:68,110`, `memory-settings-section.tsx:93`, `chat-content.tsx:43`. `goToCollection` has 5 (`character-facet-inspector.tsx`, `character-regex-scripts-field.tsx`, `regex-tab.tsx`, `config-welcome.tsx`, `prompt-assembly/section-body.tsx`). No home tile doors into Settings (`grep openSettingsTo|settings features/home` = 0 hits; the two ast-grep sweeps list none under `features/home`).
- **Persona today** (owner-sacred): `lib/persona-chrome.tsx` = ONE `rail.end` widget with two lenses over `surfaces/persona-panel-surface.tsx` — `AccountStrip` (opens the `account` modal) · `PersonaHeader` (Your personas · Import · New) · `PersonaPanelRow` list (row-body sets Current; inline avatar/name; chevron discloses `PersonaEditor` — title · description · starred · injection placement · lore book (`PersonaLoreBookField`) · duplicate/export) · `PersonaThisChatSection` (Playing as · Anchor (host re-pin) · Reattribute). `lib/personas-pane.tsx` registers the `personas` settings pane whose surface (`persona-settings-surface.tsx`) is the notify switch ABOVE the same `PersonaPanelSurface presentation="sheet"` — one component, three mounts (rail popover · You sheet · settings pane). `features/auth/lib/account-modal.tsx` + `surfaces/account-surface.tsx`: handle · role badge · mode badge · mode-aware Sign out (D74: You ⊃ Identity ⊃ Account).
- **The rail foot**: `rail.tsx:161` renders `rail.end` entries = Theme modal (`theme-modal.tsx`, "Switch theme") · Settings modal · `personaChrome` (order 50). `you-sheet.tsx` projects the same `rail.end` list (modal rows + the widget's sheet lens) plus `mobile:"sheet"` sections under "More" and the ⌘K modal row. `chrome-registry.ts` / `assemble-chrome.ts` derive it all from the section + modal + widget registries (`chrome-registry-completeness`).
- **The context pane after #860** (`docs/design/mocks/context-bracket/DESIGN.md`, owner-ruled): every section's context pane is ONE column — head band (the artifact) · optional top rail (lenses) · viewport · ground · a pinned FOOT rail of meta tabs with icon + caption, `aria-current` + arrows, the kicker on top of its rail. `contextTab` stays the one selection seam. Config's context today is `kind:"single"` with `ConfigContextHeader` naming what the pane answers (side-eye 2026-08-03 P3). `Context-Panel-Program.md` §4.1: the takeover is APPLICABILITY, context-follows-content; `registry-contracts.ts`: `ContextTabDef<S>` (id · label · icon · when · body · strip · crown · badge · disabledReason · defaultTab), `defineContextTabs<S>` is the ONE mint, `S` must be a type PUBLISHED in that file (G3 strict arm).
- **The registry law** (`client-architecture-lockdown.md` §5–§8, §12, §16 — D70): one `createRegistry` (closed, tsc-total) / `createContributorRegistry` (open) mechanism; a Def homes in `state/` and declares projections instead of importing `#data` (rule 6); the vocabulary test (rule 5): an id union is shell vocabulary iff it keys a door-assembled TOTAL registry spanning features or appears in `ShellState`/a shell action — settings categories hit both; assembly only at the door (G8); every family has a `*-completeness` gate (G1/G4/G13, `collection-registry-completeness`, `chrome-registry-completeness`); the `SECTION_IDS` playbook (§6a) is the shape of any tuple edit; channel matrix row 4: the contributor registry is THE graft channel; a plugin's surfaces land through EXISTING first-party families, never per-plugin door rows (`plugin-ui-plane.md` §4.5: `PLUGIN_SURFACE_ANCHORS = ["settings","chat-flank","chat-settings-section","tool-card","page"]`; the `settings` anchor rides the Plugins pane per-plugin detail; `page` rides the Extensions section). Plugins are USER-scoped (D147) and the Plugins pane is UNGATED.
- **Primitives on the tree** (`packages/ui/src/primitives/`): `command` (cmdk), `highlighted-text` (`[start,end)` ranges → `<mark>`), `hint-trigger` (the ONE info-icon tooltip atom `<Field hint>` and `<Section hint>` share — MUST be a sibling of the label), `list-row`, `collapsible`, `tabs`, `scroll-area`, `badge`, `status-chip`, `kbd`, `markdown` (two trust policies), `fuzzy-search` (minisearch hook, lazy index, boost, prefix+fuzzy). Client tier 2: `components/setting-switch-row.tsx` (`SettingSwitchRow`/`SettingCheckboxRow` over `<Field orientation="horizontal">` — identity inherited from Field context; `disabledReason` rides the description slot, the D126 rider's always-visible-copy rule). There is NO `setting-row` primitive on the tree (the `ui-package-design.md` §2 listing names one; `ls packages/ui/src/primitives` has none — a doc/tree drift to truth-repair in the build). §13.7–§13.9 + `ui-package-design.md` §13 bind any new primitive: the trio, `{camelName}Variants`, Base UI native-part-first, R1–R9, the CT contract, the inclusion litmus (domain-agnostic AND a committed consumer).
- **Rulings the design must not re-decide**: D62 (modals are for interrupts and pickers only; section content never lives in a modal — physics rule 5; the placement ruling "settings is a full-bleed overlay" is the one this program retires), D66 A1/A2 (band = shared `.shell-panel-header`; ONE primary New), D74 (You ⊃ Identity ⊃ Account), D107 (a declared knob is wired or cited-dormant), D114 (a section is owned by the feature that READS its knobs; settings keeps only the shell + theme), D120 (settings shell is a pure skimmer; the key partition; `when` gates nav+search+render together; the two hand-maintained mirrors), D121(C) (the rail ceiling is a rule about KIND; `SECTION_IDS` is the truth), D121(D) (band = Import · kebab = Export), D122 (persona resolution; personas owner-sacred), D126 rider (a symptom-driven knob owes always-visible copy; a `hint` is hover-only chrome), D132 (templates home on presets — Config never grows a templates surface), D147 (plugins user-scoped, no gate on the Plugins pane), C-2/C-4/C-6/C-12 (create at the group header; owner-rendered rows in a host frame; host-controls vocabulary; collapsed by default), `config-ia-the-junk-drawer-problem.md` (the thing-vs-facet test; §6.1 "Config vs Settings is a naming collision" — CLOSED by this program the other way: one surface, one name; §3's tags-as-facet stays an open fork, §5.4 below).

## 3. The design

### 3.1 One contribution model — the config GROUP registry

The unified Config is ONE closed registry of **config groups** plus the two open contributor families that already exist. A settings category, a collection, the persona surface, the Plugins install screen and any future domain all register the SAME shape; a plugin never registers a group — it registers surfaces through `host.ui` and they land as DATA rows inside the first-party Extensions group.

```ts
// state/config-group-ids.ts — the ONE vocabulary home (renames settings-categories.ts; §5 rule 5)
export const CONFIG_GROUP_IDS = [
  "personas", "appearance", "chat-behavior", "backup",        // shelf "you"
  "connections", "automation", "workloads", "admin",           // shelf "app"
  "tags", "regex", "world-info",                               // shelf "collections"
  "plugins",                                                   // shelf "extensions"
] as const; // ILLUSTRATIVE — the tuple is the truth, not this list
export const CONFIG_SHELVES = ["you", "app", "collections", "extensions"] as const;

// state/config-group-registry.ts — renames settings-pane-registry.ts; the Def stays state-homed
interface ConfigGroupBase {
  readonly id: ConfigGroupId;
  readonly shelf: ConfigShelf;            // the LIST's four named groups (the SETTINGS_GROUPS successor)
  readonly label: string; readonly icon: LucideIcon;
  readonly description: string;           // the welcome blurb + the group's own teacher head (distinct per group, gate-checked)
  readonly order?: number;                // canonical (order, id) within a shelf
  readonly when?: (viewer: ConfigViewerView) => boolean;   // the D120 projection, unchanged
  readonly subcategories?: readonly ConfigSubcategory[];   // nav rows + search index + scroll-spy anchors (the SettingsSubcategory shape, now carrying `teach`)
}
type ConfigGroupBody =
  | { readonly kind: "sections" }                         // pure skimmer: sections come from the section registry at this anchor (D120)
  | { readonly kind: "surface"; readonly render: () => ReactNode }   // feature-owned pane; still HOSTS anchored sections at the position it owns
  | { readonly kind: "collection"; readonly collection: CollectionContribution }   // the library arm — rows · member editor · context arm · create/import/bulk, verbatim
  | { readonly placeholder: true };
export type ConfigGroupDefinition = ConfigGroupBase & { readonly body: ConfigGroupBody };
```

- **Closed, tsc-total, gate-complete.** `createRegistry("config-groups", CONFIG_GROUP_IDS, {...})` at the door: a missing group is a compile error; `config-group-completeness` (the re-keyed `settings-pane-completeness` + the `collection-registry-completeness` arms folded in: co-location `features/<owner>/lib/<id>-group.tsx`, duplicate id, placeholder honesty, host-imports-no-body, skimmer purity, create-is-data, orphan-def) carries what tsc cannot. `no-parallel-section-map` gains the `ConfigGroupId` arm and drops the `SettingsCategoryId` one. This is the ONE deliberate departure from `config-rail-spec.md` C-5's "one array line": a collection becomes a tuple member + a def + a door row — the `SECTION_IDS` shape, which is what "tsc-total" means here. The door array survives as the assembly `Record`; ORDER moves to `(shelf, order, id)`. Owner fork F-1 (§5.4).
- **The section seam is untouched.** `SettingsSectionContribution` becomes `ConfigSectionContribution` (`anchor: ConfigGroupId`, `nav`, `owns`, `body`) — a mechanical retype the compiler carries across all 34; `assertSettingsKeyPartition` and `UNCLAIMED_SETTINGS_KEYS` stay word-for-word (the partition is about WRITES, which this program does not touch). A `sections` group is the skimmer D120 mandates; a `surface` group renders its own sections at the position it owns.
- **The collection arm is `CollectionContribution` verbatim** (`id` becomes the group id; `label`/`icon`/`blurb`/`order` lift to the base — `blurb` IS `description`). Rows, `detail`, `context`, `create`, `importFile`, `bulkSelect`, `preview`, `useCount`, `useMemberTitle`, `useVisible` keep their contracts; the host code in `collection-group.tsx` becomes the collection arm of `ConfigListGroup` (§3.2).
- **Persona registers as a `surface` group** (superseded by §6.8 — as built it is a `sections` skimmer) on the `user` shelf: `personasGroup` (`features/persona/lib/personas-group.tsx`) whose render is today's `PersonaSettingsSurface` (notify switch + `PersonaPanelSurface presentation="sheet"`) with `subcategories` naming its FIVE parts as anchors — `notifications` · `your-personas` · `editor` (the expanded row) · `pinned` ("Pinned as {{user}}", the anchor row) · `this-chat` — so the spy and search reach them. The persona editing model is byte-identical (owner-sacred); only the frame and the teaching move.
- **Plugins register as ONE `surface` group** on the `extensions` shelf — today's Plugins pane (install · grant · lifecycle · the D147 Distribute section by `when`). A plugin's `settings` surfaces render inside its own row/detail exactly as `plugin-ui-plane.md` §4.5 already rules; its `page` surfaces stay on the Extensions rail SECTION. The Extensions group's search rows fan per plugin through the existing `CommandPaletteSource`-style `useSearchRows` hook (§3.3) so a plugin's settings are findable without a per-plugin registry member — the G8 one-assembly law holds.
- **A future domain** (a new knob namespace, a new library) is: one tuple member · one co-located `*-group.tsx` · one door row · its sections/rows. Nothing else grows.

Where the four named registries end up: `config-groups` (closed, the shell's) · `config-sections` (open, D120's) · `chat-context` / `regions` (unchanged) · `config-collections` DISSOLVES into the groups registry (its arms live on the `collection` body).

### 3.2 The LIST — the map, with scroll-spy

The LIST is the one place the macOS negative control is refuted: it ALWAYS shows where you are.

- **Four named shelves** (You · App · Collections · Extensions — `role="group"` + `aria-labelledby` the kicker, the `settings-nav-column.tsx` wiring), each a stack of GROUP frames in `(order, id)` order. A shelf with zero visible groups renders nothing.
- **A group frame = band + disclosure body.** The band is `collection-group.tsx`'s band generalised: chevron · icon · `interactiveKicker` label · `datum` count (a collection's member count; a settings group's `@modified` count when > 0 — the VS Code "Modified" signal at the map level, derived §3.3) · trailing verbs (a collection's bulk · import · create `+`; a surface/sections group has none — C-2 stands). Groups start COLLAPSED and the expanded set is remembered per device (C-12), with one amendment: **the ACTIVE group is always expanded** (selection and disclosure are one act — `config-selection-store.ts`'s rule, now for every kind).
- **Children rows, by kind:** `sections`/`surface` → one `ListRow` per subcategory (`navLabel ?? label`, `fullTitle`, the errored-save marker in `meta`), `selected` = the spy's active sub; `collection` → the owner's own rows (C-4) under the host's count-driven filter. A settings group therefore reads like today's nav column; a collection reads like today's roster; both live in one column.
- **Scroll-spy, one home.** `settings-scroll-spy.ts` moves verbatim to `features/config/lib/config-scroll-spy.ts` (`computeActiveSub` · `flashAnchor` · `afterPaint` — the 30% line, the not-scrolled ⇒ first rule, the reduced-motion arm). `settingsAnchorId` becomes `configAnchorId(groupId, subId)` in state. The CONTENT pane's scroller is the spy's container; the active sub lights the LIST row and, on a section click / deep link / search hit, the jump suppresses the spy and `flashAnchor`s the target (the shipped mechanism, unchanged). A collection's member editor does not spy (a member is one thing) — its rows use selection.
- **Match highlighting in the list** (§3.3): while a query is live the LIST filters to matching rows (VS Code's TOC `filter` behaviour, the Chromium "one card of the page" behaviour) and `HighlightedText` marks the hit inside each row label; the shelf kickers stay so the reader keeps the map.
- **The band is the D66 A1 band; the create affordance stays a per-group `+`** (C-2 — the config-rail-spec's closed F-8): the LIST band carries the title "Configuration" and the SEARCH box; nothing else. The welcome (§3.4) keeps the launcher cards; the phone keeps `ConfigMobileTeaching`.

### 3.3 SEARCH — one index, two hosts, typed tokens, hits in place

- **One index, derived from the registries at the door** (the `buildSettingsSearchEntries` derivation generalised — G2: never a parallel map): for every visible group → the group row (label · description); for every subcategory → its row (label · navLabel · keywords · the group label); for every `settings` leaf → its row (label · keywords · sub · group); plus DYNAMIC rows from a contribution's `useSearchRows` hook — a collection's members (tag names, script names, book titles — the same cache-first `useQuery` its roster already loaded, the `preview.useEntries` discipline) and the personas group's persona names. `when`-hidden groups contribute nothing (D120: search sees exactly what the nav shows). The static half is data; the dynamic half is a hook the host renders in its own fiber per source, the `CommandPaletteSource.useRows` posture (`contribution-contracts.ts:423`).
- **The engine is the sealed `@orb/ui/fuzzy-search` hook** (minisearch: prefix + fuzzy, `boost {label: 4}`), not cmdk's scorer — cmdk can only score MOUNTED items and the index is \~300 static rows plus a 400-tag library, so the LIST renders only the hits. The search box is `Command`/`CommandInput` for its keyboard grammar and `role=combobox` handling (`settings-shell-surface.tsx`'s `expanded` rule stands).
- **Filter tokens, VS Code's grammar, typed `@`:** `@modified` · `@shelf:user|app|collections|extensions` · `@in:<groupId>` · `@ext:<plugin-slug>` (scopes to one plugin's settings rows) · `@advanced` (rows a contribution tags `advanced`, hidden by default like VS Code's `@tag:advanced` — the progressive-disclosure axis the D107 admin knobs want). A funnel button beside the input inserts a token; typing `@` opens the token list. The parser is a pure function in `client/src/lib/config-search-tokens.ts` (tier 4; it graduates to `@orb/kit` only when a second consumer appears — §13.9's homing rule).
- **`@modified` is DERIVED, never declared.** A user-tier section's `owns` claim already names its keys; the cached `UserSettings` vs `DEFAULT_USER_SETTINGS` at those keys says whether any differs. An app-tier section's claim paths resolve the same way against the effective-config floor (an override present = modified — the D120 S4 "floor is unknowable once overridden" rule, unchanged). Device-tier rows (panel modes, theme choice — the persisted shell prefs) are few and declare `useModified` explicitly. So `@modified` costs a contribution nothing and can never lie about a key it does not own. Owner fork F-7 fixes the semantic (differs-from-default vs explicitly-set).
- **Hits render IN PLACE, twice:** the LIST filters + marks (§3.2); on selecting a hit the CONTENT jumps to the anchor (`flashAnchor`) and the matched row's label carries the same `HighlightedText` ranges for the life of the query (the Chromium "plugin highlights its own hits" posture, done by the host through one `configSearchMatch` seam the row frame reads — §3.4). Clearing the query clears every mark.
- **⌘K integration:** the SAME index is a `CommandPaletteSource` ("Settings", `Sliders` glyph) registered at the door, its rows' `run` = `openConfigTo(group, sub, setting)`; the palette dismisses and Config lands with the hit flashed. One index, two hosts; nothing hardcoded (the `plugin-command-palette-source.ts` precedent).
- **Deep links** — `openConfigTo(groupId, subId?, settingId?)` replaces both `openSettingsTo` and `goToCollection` (it expands the group, sets the section, and for a collection kind clears the member selection exactly as `goToCollection` does today). `__orb.nav.openConfig` replaces `openSettings`; `agent-nav` validates against `CONFIG_GROUP_IDS`. A `settingId` target focuses the row (§3.5) so a link can name a single knob — VS Code's `vscode://settings/<id>`. URL segments stay `/config` (a group deep link is shell state, not a route — the `resolveSectionPath` contract is untouched).

### 3.4 The CONTENT pane — dense rows, honest per-row state

> **Deferral rider (2026-08-30, cb-config-s3s4, orchestrator-approved fork 4; owner re-ruling same day):**
> the row chrome below is DEFERRED past S3 as its own tracked leg, and the owner SHRANK it: (1) the SCOPE
> CHIP IS CUT — every config row writes per-user through `updateUserSettingsSection`, so the chip could
> never vary; scope/override questions live ONLY in the teacher's Applies tab; (2) per-row Reset is a
> CAPABILITY, never resting chrome — a reveal-on-hover/focus row-actions menu (#443 grammar) carrying
> Reset · Copy id · Copy link on fine pointers, invisible at rest; touch reaches Reset through the About
> tab's door; (3) the 2px modified stripe survives as designed, with the `useConfigLeaf` defaults
> plumbing that also feeds About's default-vs-current. So the leg = stripe + revealed menu + defaults
> plumbing, nothing else. Until it lands, S3 ships rows as label + control + `i`, and About teaches
> summary/affects/related without the default-vs-current + Reset block. The S2 `@modified` search axis is
> unaffected (it derives from `owns` claims via `use-modified-sections.ts`, not from this row chrome).

- **Field · control · ≤1 line of gloss.** Every knob row rides ONE composite, `SettingRowFrame` (§4), around the section's existing control: leading MODIFIED rail (the VS Code left bar — present only when the derived modified flag is true) · label + the one-line `description` (the `Field` description slot, so it is also `aria-describedby`; the D126 rider's always-visible copy lives here, never in a tooltip) · the control · a trailing `⋯` menu (Reset to default · Copy setting id · Copy link) · a SCOPE chip (`user` / `app` / `device`, a `Badge` — derived from the owning section's `owns.tier`, never declared per row). The gloss is the ONLY teaching inline; everything longer moves to the context pane (§3.5). Sections keep their `<Section heading id={configAnchorId(...)}>` anatomy; nothing about a section's fields, order or wording changes in this program.
- **Reset is the section's write, framed by the host.** The frame gets `onReset` from the section (the section owns its mutation seam and its patch shape — D120 S1 key-minimal writes; an app-tier row resets by clearing the override, the S4 pattern); the frame owns the chrome and the confirmation-free semantics (a reset is one undoable write, not a destructive act). Default and current values are read by the frame through one `#data` hook (`useConfigLeaf(section, key)` → `{current, default}`), the same read `@modified` uses.
- **Collections are unchanged:** a member's editor mounts in CONTENT (C-7), the welcome with launcher cards renders with nothing selected; the hero's preview wall stays.
- **The persona surface renders here as-is** with its five parts anchored.
- **Save status:** the aggregate footer (`settings-save-footer.tsx`) survives as the CONTENT pane's foot (D120 §3 — it locates, never retries); the errored section's LIST row keeps the marker.
- **Focus and arrival:** the CONTENT surface owns arrival focus only when a target exists (`useFocusOnMount(ref, target !== null)` — `config-content-surface.tsx`'s decision rule); a group click lands at the group's first section with the spy suppressed (#549's rule).

### 3.5 The CONTEXT pane — the teacher

The context pane becomes the place the bulk goes. It rides the #860 bracket like every other section; Config's `ContextDefinition` changes from `kind:"single"` to `kind:"tabs"` minted over a published projection.

- **The "focused setting" seam.** `state/config-focus-store.ts` (a G27 mint beside the selection store): `configFocus: { groupId, subId, settingId } | null` plus `configSearchMatch`. Writers: the `SettingRowFrame` on FOCUS-WITHIN and on CLICK of its label; on fine pointers also on HOVER after a delay (a pull revelation the reader asked for by looking — NN/g; never hover-only, never on coarse pointers); a subcategory heading on focus; a collection member on selection (its own context arm, as today). Readers: the context definition's `useContextState`. It is NOT vocabulary (an open id one host interprets — lockdown §5 rule 5's `contextTab` test) and it is not persisted.
- **The projection**, published in `lib/registry-contracts.ts` (G3 strict arm): `ConfigContextState = { focus: ConfigFocus | null; selection: CollectionSelection | null; teach: ResolvedTeach | null }` where `ResolvedTeach` is the host's resolution of the focused row's `teach` data against the registries.
- **Teaching is contribution DATA, rendered by the host.** `ConfigSubcategory.settings[]` leaves (the search leaves that already exist) gain `teach?: SettingTeach`:

```ts
interface SettingTeach {
  readonly summary: string;                       // the definition — one paragraph, plain language
  readonly affects: readonly string[];            // what changes when this moves ("every new chat's first turn", "the admin rail only")
  readonly overriddenBy?: readonly { readonly label: string; readonly open: () => void }[];   // where a narrower scope wins (a room's Overrides tab, a preset knob, a character's card) — each a door, never prose
  readonly related?: readonly ConfigSettingRef[]; // other knobs that interact (VS Code's `#other.setting#`) — rendered as links that focus + scroll
  readonly more?: () => ReactNode;                // "learn more", IN-APP: trusted Markdown / a diagram / a live example; never a link-out
}
```

A subcategory carries the same shape (`SettingTeach` on `ConfigSubcategory`) for the section-level lesson, and a group's `description` is its own head. A collection member's teaching is the collection's existing `context` arm (Where it's attached) — unchanged. Persona's five parts get `teach` copy (the relocation's "teaching treatment"); persona VERBS do not change.

- **The pane, on the bracket:** HEAD band = the focused setting's label + its scope chip + a Modified chip when modified (the artifact identity — DESIGN.md's slot table); no top rail (no lenses); VIEWPORT = the active foot tab; FOOT rail tabs (icon + caption, one tab stop, arrows): **About** (summary · affects · default vs current, with a Reset door · related links) · **Applies** (`overriddenBy` doors; for a collection member this IS its existing context arm, so the Applies tab is that arm renamed) · **Learn** (`more`, present only when the contribution supplies one — APPLICABILITY, not hiding). `defaultTab` = About. With NOTHING focused the viewport teaches the SECTION THE READER IS IN — the scroll-spy's current row and its own `teach`, falling back to the GROUP's `description` where a section declares none — and, with no group active, the section's own no-selection copy (`CONFIG_CONTEXT_EMPTY`) — never a blank pane. **AMENDED 2026-09-02 (#1101), superseding this bullet's original "its `description` + its subcategories as doors":** the subcategories-as-doors arm published the LIST's own nine rows a second time inside the context pane (`design-audit --panels both-docked` filed 8 × `duplicate-action-door`), and `UI-Architecture-and-Layout.md` §4.2 — the shell law, which outranks this program doc — says CONTEXT is *"closable; never navigation"*. The map is the LIST's job; the pane teaches. A `related` ref is consequently a knob ref only (`setting` is required — tsc is the wall).
- **Focus-follows-content over `contextTab`.** The foot tab selection is the shared `contextTab` seam (ids `config.about` / `config.applies` / `config.learn`, namespaced like `rpg.*`); focusing a different row swaps the head + body and KEEPS the tab (a reader on Applies stays on Applies as they move down a section — the CP-4 §4.1 continuity rule). A collection selection re-resolves the tabs (Applies is now the arm); the `contextTab` fallback picks the first visible tab as it always has.
- **Collapsed or absent context:** the row keeps its one-line gloss and a trailing `i` glyph (the `HintTrigger` atom, sibling of the label) whose activation, on desktop with the pane collapsed, opens the pane as a slide-over on this row (`openOverlayPanel("context")` — the M10 overlay regime; the pane is never forced open by focus alone, D62's "closable, never navigation"); on a phone it opens the same teacher as a bottom sheet (the config-rail mobile mock's "context folds into CONTENT" arm). The `i` is the pull-revelation door NN/g's tooltip guideline requires on touch; its tooltip on fine pointers is the first sentence of `summary`.
- **What stays inline no matter what:** the label, the one-line gloss, the control, the modified rail, reset, and any `disabledReason` — task-vital facts never live only in the teacher (NN/g guideline 1).

### 3.6 The rail's persona slot, the You sheet, and mobile

- **Rail foot after the program:** Theme (owner fork F-2) · the persona slot. `personaChrome`'s BAR lens becomes the SWITCHER POPOVER: head strip = signed-in identity (handle · role · mode badges — today's `AccountSurface` facts) · body = the persona rows as a radio list (current marked, row-body sets Current, avatar + name only — no inline editor, no chevron) · foot = **Manage personas** (`openConfigTo("personas")`) · **Log out** (the mode-aware sign-out, verbatim from `account-surface.tsx` incl. the single-user / forward-header copy). New/Import/editor/lore book/this-chat leave the popover for the Config group. D74 survives with a changed input: You ⊃ Identity stands; ACCOUNT stops being a leaf modal and becomes Identity's head strip + foot (owner fork F-3 on whether the `account` modal retires).
- **The You sheet (phone):** the widget's SHEET lens shrinks to the same three things — identity strip · switch persona (the radio rows) · Manage personas → Config · Log out — under "Account and settings"; the ⌘K row and the "More" section rows are untouched; the Settings modal row disappears with the modal. `config` stays `mobile:"sheet"` (C-10/F-13 — a bar re-curation is ruled separately).
- **Single-pane flow on a phone:** LIST (the four shelves, `ConfigMobileTeaching` on top) → tap a group → the group's content pushes over the list with the back row naming the group (the ONE-SHELL rule; a `sections` group's push target is its first section) → a subcategory row scrolls within the pushed pane; a collection member pushes its editor as today; the teacher is the bottom sheet. The spy still runs inside the pushed pane so a Back returns the list with the right row lit.

## 4. Primitives and composites owed

Composed from existing primitives wherever one fits; a NEW `@orb/ui` primitive needs a receipt that none fits (§13.9 litmus). Result: ZERO new `@orb/ui` primitives; four client composites; one doc/tree truth-repair.

| Owed | Tier / home | Why nothing existing fits (receipt) | Anatomy | A11y model | CT owed |
| - | - | - | - | - | - |
| `SettingRowFrame` | client tier 2, components/setting-row-frame.tsx (owed — not yet on the tree) | `SettingSwitchRow` is control-specific and knows no modified/reset/scope; `<Field>` is the identity/description layer, not the settings chrome; needs `#state` (`configFocus`) + `#data` (`useConfigLeaf`) so it is NOT `@orb/ui` (§13.9 homing rule). Truth-repair: `ui-package-design.md` §2 lists a `setting-row` primitive that does not exist on the tree — delete the listing | `Row`: modified rail (2px, `bg-primary`, `aria-hidden`; the modified fact is ALSO in the row's `aria-describedby` as text) · `<Field orientation="horizontal" label description>` wrapping the control · trailing `Badge` scope chip · `RowActionsMenu` (Reset · Copy id · Copy link) · the `HintTrigger` `i` (sibling of the label) | The control keeps its Field-minted label association; the chip and modified text join `aria-describedby`; the menu is the `#443` row-action grammar (`Actions for <label>`); focus-within publishes `configFocus` (no focus theft, no live region); hover publish is fine-pointer + delayed | `tests/client/components/setting-row-frame.ct.tsx`: modified rail on/off by derived flag (planted default vs changed), reset calls the section's `onReset` once, scope chip text, `configFocus` written on focus and on label click and NOT on coarse-pointer hover, `HighlightedText` ranges render `<mark>` when `configSearchMatch` names this row, the narrowest production mount (the pushed phone pane) |
| `ConfigListGroup` | client `features/config/components/config-list-group.tsx` (generalises `collection-group.tsx`) | `collection-group.tsx` is collection-only; `settings-nav-column.tsx` is category-only; one frame must render both kinds under one band grammar | Band (`Button` disclosure with `aria-controls` · icon · `interactiveKicker` · `datum` count · trailing verbs by kind) · body (`ListRow` subcategory rows with `selected` = spy, or the owner's rows under the host filter) | The band's accessible name = label + count (the WCAG 2.5.3 whitespace rule from `collection-group.tsx`); `aria-expanded`; rows `aria-current="true"` for the spy'd row (the settings nav's token, ruled distinct from the rail's `page`); shelves are named groups | `config-list-group.ct.tsx`: both kinds render under one band; the active group cannot collapse; the spy'd row lights on a synthetic scroll of the content container (the settings-shell CT's mechanism); the 271px both-panes-open floor pins no clipped band |
| `ConfigSearchInput` | client `features/config/components/config-search-input.tsx` | `CommandInput` has no token chips; `Combobox` chips are for VALUES not query grammar; the funnel + `@` token list is config-specific | `Command` + `CommandInput` (`expanded` tracks the list) · a funnel `Button` opening a `Menu` of tokens · the query rendered with `Kbd`-styled token spans · `CommandEmpty` with the honest "No settings match" | The input is the combobox; tokens are plain text in the value (a screen reader hears what is typed); the funnel menu is a labelled menu | `config-search-input.ct.tsx`: `@` opens the token list; a token narrows the index (planted rows); `@modified` shows only rows whose derived flag is true (planted default + changed); clearing restores every row; `aria-expanded` follows the list |
| `ConfigTeacher` (context body) | client `features/config/components/config-teacher.tsx` + `lib/config-context.ts` (the `defineContextTabs<ConfigContextState>` mint) | Nothing renders a `SettingTeach`; the bracket's head/foot are the shell's (`ContextRegionHost` after #860), so this is only the three tab bodies + the head content | About: `Section kicker` blocks (Definition · Affects · Default vs current with a Reset door · Related as `ListRow` links) · Applies: door rows · Learn: `@orb/ui/markdown` with `trust="trusted"` or the contribution's node | The head band names the setting (`Heading` level 2 in the pane); Related rows are buttons that focus + scroll (`flashAnchor`); tab roster obeys the #860 rail contract (icon + caption, one tab stop) | `config-context.ct.tsx`: nothing focused ⇒ group lesson, no group ⇒ `CONFIG_CONTEXT_EMPTY`; focusing a planted row swaps head + body and keeps the tab; a collection selection turns Applies into the collection's arm (the `none` arm renders that collection's copy); Learn is absent when `more` is absent |
| `config-scroll-spy.ts` (re-home) | client `features/config/lib/` | Not new — `settings-scroll-spy.ts` moved verbatim; ONE home | — | — | The existing spy CT arms move with it (`settings-shell-surface.ct.tsx` → `config-content-surface.ct.tsx`) |
| `config-search-tokens.ts` | client `lib/` (tier 4) | A pure parser with one consumer today (two with ⌘K, both in `features/config`) — `@orb/kit` only when a consumer outside the client appears (§13.9) | `parseConfigQuery(text) → { terms, tokens }` | — | `tests/client/lib/config-search-tokens.test.ts` — the grammar table + malformed tokens |

Deliberately NOT minted: a `NavTree` primitive (the shelf/group/row anatomy is `Stack` + `Button` + `ListRow`, proven by the two surfaces being unified); a `Chip` input for tokens (`Combobox.Chips` exists for object values; a query is text); a `ScopeChip` (a `Badge` variant); a "settings JSON" editor (D120's partition makes a whole-blob editor a lost-update machine — VS Code's JSON arm is the wrong lesson for a per-key-merged store).

## 5. Rulings, coupled sites, sequence, forks

### 5.1 Rulings that survive with a changed input (record with the build)

- **D62 physics rule 5** ("Modals are for interrupts and pickers only … section content NEVER lives in a modal") — survives and is finally satisfied: the settings modal was the standing exception; the §placement line "settings is a full-bleed overlay" DIES.
- **D114** ("a SECTION is owned by the feature that READS its knobs; settings keeps only the shell + theme") — survives; the SHELL is now `features/config`'s host, `features/settings` keeps theme (`theme-modal`, `theme-picker-surface`, `theme-editor`) plus the `appearance` and `chat-behavior` group defs it owns today.
- **D120** (pure skimmer; the key partition; `when` gates nav+search+render together; the two hand-maintained mirrors) — survives verbatim with `SettingsCategoryId → ConfigGroupId`; the partition test and the CT data-provider mirror gain nothing but the rename.
- **D74** (You ⊃ Identity ⊃ Account) — survives as You ⊃ Identity; Account becomes Identity's head + foot (fork F-3 on the modal).
- **D121(C)** — untouched: ten sections, the ceiling is a rule about KIND. Only the FOOT changes.
- **`config-rail-spec.md`** C-2 · C-4 · C-6 · C-7 · C-8 · C-12 survive verbatim; C-5 ("placement is the door array") survives as "placement is the `(shelf, order)` on the def; membership is the tuple" (fork F-1); §4's "settings search keeps a stub row per retired category" is SUPERSEDED — there is one search and nothing retires from it.
- **`config-ia-the-junk-drawer-problem.md`** §6.1 (naming collision) CLOSES — one surface; §1's diagnosis dissolves because Config now owns a concept ("everything you configure"); §3 (tags as a facet) stays OPEN (fork F-4).
- **Context-Panel-Program §4.1** (context-follows-content, APPLICABILITY) and #860's bracket — Config joins them; `contextTab` stays the one selection seam; the focused-setting seam is a second, non-vocabulary store beside it.

D-rows to mint (unnumbered here on purpose — the ledger mints): **R-A** the unified Config surface and the closed config-group registry (three arms; plugins ride the Extensions group's data rows; the Settings modal retired); **R-B** the teacher (teaching is contribution data rendered by the host; focus-follows-content over `contextTab` + the focused-setting seam; inline ≤ one line; learn-more never leaves the app; `@modified` derived from `owns`); **R-C** the rail persona slot (switcher · identity · log out; D74 amended); **R-D** the D62 placement-ruling amendment (the settings overlay is dead; settings search is Config's).

### 5.2 Coupled sites (against this tree — each was read or swept)

| Site | Edit |
| - | - |
| `state/section-ids.ts` | NONE — ten members, no tuple edit; the #866 "10 → 9" premise is dead (§0) |
| `state/settings-categories.ts` → `config-group-ids.ts` · `settings-pane-registry{,-context,-provider}.ts{,x}` → `config-group-registry*` · `settings-section-registry-context.ts` (anchor type) | the vocabulary + Def rename; the body union gains the `collection` arm; `SETTINGS_GROUPS` → `CONFIG_SHELVES` |
| `lib/collection-contracts.ts` | the arm's contract; `id`/`label`/`icon`/`blurb`/`order` lift to the base |
| `state/shell-store.ts:74-78,105-111,181-187,241-243,335,407-413` | `settingsCategory`/`settingsSubcategory` → `configTarget {group, sub, setting}`; `openSettingsTo` → `openConfigTo` (sets `activeSection:"config"`, no modal); `closeModal` stops clearing it |
| `state/config-selection-store.ts` `goToCollection` (5 call sites) · `state/config-group-open-store.ts` | fold into `openConfigTo`; the open-set store serves every kind |
| `state/modal-slot-ids.ts` (`settings` member) · `features/settings/lib/settings-modal.tsx` · `modal-registry-completeness` fixtures | retire the modal; `tests/client/state/assemble-chrome.test.ts:48-51` uses `"settings"` as a FIXTURE id — retarget the fixture, the arm survives |
| The 12 `openSettingsTo` call sites (§2) + `agent-nav/index.ts:340` + `tests/client/agent-nav/index.test.ts:137-145` | mechanical, tsc-enumerated; `__orb.nav.openSettings` → `openConfig` |
| 9 `*-pane.tsx` defs (§2 list) → `*-group.tsx`; 34 `SettingsSectionContribution` anchors | rename + retype; `feature-owns-definition` `DEFINITION_RE` swaps `pane` for `group` in the SAME commit |
| `features/settings/{surfaces/settings-shell-surface,components/settings-nav-column,components/settings-pane-placeholder,components/settings-save-footer,lib/settings-search,lib/settings-scroll-spy,lib/settings-nav-model}` | dissolve into `features/config` (host) — `features/settings` keeps theme + its two group defs |
| `features/config/{lib/config-section,surfaces/*,components/*}` | the host grows the shelves, the search, the teacher, the tabs context; `panelDefaults` stays `{list:"docked", context:"collapsed"}` (fork F-6 on the context default) |
| `features/persona/lib/personas-pane.tsx` → `personas-group.tsx` · `persona-chrome.tsx` (bar lens = switcher popover; sheet lens shrinks) · `persona-panel-surface.tsx` (the popover composition) · `features/auth/lib/account-modal.tsx` + `surfaces/account-surface.tsx` (F-3) | the relocation; persona VERBS untouched |
| `features/app-shell/components/you-sheet.tsx` · `rail.tsx` | derive-only — VERIFY, never hand-edit (playbook step 8) |
| Gates: `settings-pane-completeness` → `config-group-completeness` (+ the collection arms; `collection-registry-completeness` retires into it) · `no-parallel-section-map` (ConfigGroupId arm) · `settings-section-anchored` · `context-definition-shape` (Config's `defineContextTabs<ConfigContextState>` needs the projection published in `registry-contracts.ts`) · `Core-Enforcement-Active-Gates.md` rows · `tests/tooling/**` conformance fixtures | rename/re-key in one commit; each ratifying gate owes its two receipts |
| `lib/registry-contracts.ts` | publish `ConfigContextState` + `ConfigFocus` |
| `state/config-focus-store.ts` (new G27 mint) | the focused-setting seam |
| `compose/authed-app.tsx` | `createRegistry("config-groups", …)`; the `config-collections` assembly dies; the ⌘K `CommandPaletteSource` row |
| CTs (the settings-era paths this row first named moved with the config rename — 2026-09-06 truth-repair): `tests/client/features/config/surfaces/config-content-surface.ct.tsx` + `config-list-surface.ct.tsx` + `tests/client/features/config/_ct-stories.tsx` · `tests/client/state/config-section-registry-context.ct.tsx` · `tests/support/ct/ct-data-providers.tsx` (the door mirror) · `tests/client/state/config-section-registry.test.ts` (partition mirror) · `tests/client/features/app-shell/components/rail.ct.tsx:21` (the "Settings" pin) · `you-sheet.ct.tsx` · `tests/client/features/persona/**` (3 CTs + stories) · `tests/client/state/config-selection-store.ct.tsx` · `tests/e2e/live-settings-render-truth.spec.ts` | move/retarget; new CTs per §4; the test-baseline manifest regenerates in the lane |
| Docs: `UI-Architecture-and-Layout.md` §4.1 (the foot line "Theme · Settings · persona Identity") + §4.2 rows (settings overlay · identity widget · the Configuration grid row) · `client-architecture-lockdown.md` §5 rule 5 · §6d modal list · §8 (the settings host) · §16 G2/G4 · `config-rail-spec.md` (C-5 amendment, §4 superseded) · `config-ia-the-junk-drawer-problem.md` §6.1 · `ui-package-design.md` §2 (`setting-row` listing) · `plugin-ui-plane.md` §4.5 (`settings` anchor rides the Extensions GROUP) · side-eye §14 (rail FOOT count) · the catalog receipts | truth-repair in the landing commits |
| Home tiles | NONE door into Settings (receipt §2) |

### 5.3 Sequence

- **S1 — the registry + the surface (after #860 or before it; it does not touch the context pane):** vocabulary + `ConfigGroupDefinition` union · the 9 groups + 3 collections + persona group on one registry · `ConfigListGroup` shelves with the spy · the CONTENT host renders sections/surfaces/members · `openConfigTo` + the 17 call sites · the modal retires · gates re-keyed · CTs moved. ONE train; no half-state (the old registry beside the new is the rot the doctrine bans).
- **S2 — search (independent of #860):** the index + tokens + `HighlightedText` in place + the ⌘K source + `@modified` derivation.
- **S3 — the teacher (needs #860's bracket on main):** `config-focus-store` · `ConfigContextState` · `defineContextTabs` for Config · `SettingRowFrame` (modified/reset/scope) · `SettingTeach` on the leaves, authored per section by its OWNER (the D114 owner writes the lesson) — this is the bulk-moving step and the one that lands copy.
- **S4 — the rail slot + You sheet:** the switcher popover · Manage personas · Log out · the account modal fork · the phone sheet.
- **S5 — docs + the four D-rows + receipts.**

S1 and S2 can be dispatched now; S3 waits for #860's `ContextRegionHost` column; S4 waits for S1 (the door it points at must exist).

### 5.4 Open forks for the owner (each with a recommendation and its cost)

- **F-1 · Collections in the closed tuple.** (a) closed `CONFIG_GROUP_IDS` incl. tags/regex/world-info (tsc-total, one completeness gate, deep links typed) vs (b) collections stay an open sub-registry (the R1 "one array line"). ▸ **(a)** — the owner asked for tsc-total and gate-enforced completeness; the cost is one tuple line per new library, the `SECTION_IDS` shape the house already runs.
- **F-2 · The Theme rail.end trigger.** (a) keep "Switch theme" as the rail-foot quick picker (the theme EDITOR stays in Appearance) vs (b) fold it into the Appearance group and shrink the foot to the persona slot alone. ▸ **(a)** — a palette switch is a picker (D62 rule 5), and the foot then reads Theme · You, which is honest.
- **F-3 · The `account` modal.** (a) retire it — its three facts + sign-out become the switcher popover's head and foot (one concept named "account", D74's own rule) vs (b) keep it as the leaf behind the identity strip. ▸ **(a)**; cost: `account-modal.tsx` + its `ModalSlotId` member + the modal-completeness fixtures.
- **F-4 · Tags as a facet** (`config-ia-the-junk-drawer-problem.md` §3: leave the rail, in-place popover editor, bird's-eye in Corpus). ▸ **Defer** — keep tags a collection in this program (the junk-drawer diagnosis is dissolved by Config owning a concept); re-open the facet model as its own program with the Corpus overview it needs.
- **F-5 · Shelf assignment of Workloads and Backup.** Today `user`; ▸ keep them on **You** (your jobs, your backups) — App stays connections · automation · admin; zero cost either way.
- **F-6 · Config's context default.** Today `collapsed`. With the pane now the teacher, (a) keep collapsed (D62: every section defaults collapsed; the `i` glyph is the door) vs (b) `docked` for Config only. ▸ **(a)** — never force a pane; measure whether readers open it, then re-rule.
- **F-7 · `@modified` semantic.** (a) differs-from-default (derivable for every tier from `owns`) vs (b) explicitly-set-by-the-user (needs a per-key provenance the user tier does not store). ▸ **(a)**; VS Code shows either, we can only prove one.
- **F-8 · Teacher activation.** (a) focus + click, plus delayed hover on fine pointers vs (b) focus + click only. ▸ **(a)**; the hover arm is a pull revelation and costs nothing on touch, where it does not exist.
- **F-9 · The surface's NAME.** The section id stays `config`; the rail label is today "Configuration". (a) keep "Configuration" vs (b) rename the label "Settings" now that it IS the settings. ▸ **(b)** — the owner's own words for the program are "config panel"/"settings"; the id never moves, only the label and glyph copy (`Package` stays — C-9's gear ban is moot once the gear is gone; owner may re-pick).

## 6. S1 + S2 as built — the lane design (cb-config-s1s2, 2026-08-30)

Written BEFORE the build, against the tree at `2845a94b2`. Where §3/§5 above and this section disagree, this section carries the receipt and §3/§5 carry the intent; the D-ledger wins over both. Memory lessons used: `settings-section-three-coupled-sites`, `surface-pane-hosts-own-sections`, `surface-flip-retires-the-ct-premise`, `ratifying-gate-owes-two-receipts`, `gate-authoring-hub`, `recreating-a-deleted-test-path-is-a-coupled-site`, `first-tripping-bucket-hides-the-later-key`, `feature-root-slot-lands-with-occupant`, `two-axes-same-members-need-two-tuples`, `check-docs-explicit-args-cover-docs-design`, `presence-ratchet-waiver-vs-real-ct`, `test-presence-mirror-not-suite`.

### 6.1 Premises re-derived (three died)

- **FOUR collections, not three.** `compose/authed-app.tsx:250-256` registers `tagCollection · regexCollection · worldInfoCollection · castCollection` (`features/roster-preset/lib/cast-collection.tsx`, `id: "cast"`, order 40, landed with #26/B10). §2/§3.1 counted three. The tuple carries four collection members.
- **A PRIOR owner ruling places the surface at the RAIL FOOT** (#297, 2026-08-24: "move Config to Settings' rail position"), which §3.6 did not see. The `config` section stays a `SECTION_IDS` member (untouched); its rail affordance renders in the foot where the gear sat. §6.3 names the mechanism.
- **The `--goto settings:<category>` grammar is a live instrument surface** the coupled-site table (§5.2) missed: `tooling/src/_shared/argv.ts:163-179` (`parseGotoTarget` → `openSettings`), `tooling/src/_shared/nav.ts:34-53`, `tooling/src/snap/ops/scenarios/orb-app.json:14-23` (nine `settings:*` scenarios + `modal:settings`), `tests/tooling/_shared/{argv,nav}.test.ts`, and `tests/e2e/live-settings-render-truth.spec.ts:87-91,169-172` (drives the rail "Settings" button into the modal dialog). All are coupled sites of S1.

### 6.2 The chosen shape (and what was rejected)

**Vocabulary + registry (state).** `state/config-group-ids.ts` (git-mv of `settings-categories.ts`): `CONFIG_GROUP_IDS` = `personas · appearance · chat-behavior · workloads · backup` (User — owner correction 2026-08-30: the desktop shelf is NOT named "You"; that word is the phone's tab-bar sheet, a different surface) · `connections · automation · admin` (App) · `tags · regex · worldInfo · cast` (Collections) · `plugins` (Extensions), plus `isConfigGroupId` and `CONFIG_SHELVES`. The collection ids keep their EXISTING spellings (`worldInfo`, `cast`) rather than the illustrative kebab in §3.1: each id is the ONE home `WORLD_INFO_COLLECTION_ID`/`CAST_COLLECTION_ID` already exports, it rides `data-collection` attributes in the config and world-info CTs, and it is the persisted key of the per-device disclosure store — a respelling would churn every one of those for no product difference (`modal-slot-ids.ts` already carries camelCase members, so the vocabulary has precedent). **SUPERSEDED for `cast` (owner, #901 Fork 2, 2026-08-30) — the ruling survives, its INPUT changed.** The reasoning above still holds for `worldInfo` and for any id whose only argument is spelling churn; it does NOT hold for `cast`, because the owner ruled the saved seats+knobs+rules template is a **Roster** and that "the two deviant registry ids conform" — `CAST_COLLECTION_ID = "cast"` and the `"savedCasts"` modal id are exactly those two. So the churn is no longer "for no product difference": the word itself is the product decision. #902 (vocab C1) owns the change and has NOT landed — as of this line the tree still exports `CAST_COLLECTION_ID = "cast"`, the shelf label is still `Casts`, and the modal is still `savedCasts`. (The `"cast"` persisted-key hazard this paragraph implies was separately REFUTED by the #901 report: the disclosure store self-sanitizes.) `state/config-group-registry.ts` (git-mv of `settings-pane-registry.ts`, split for the 450-line cap): `ConfigGroupDefinition = ConfigGroupBase & { body: ConfigGroupBody }` with the four body arms of §3.1, `ConfigSubcategory`, `configAnchorId(group, sub)` = `config-anchor-<group>-<sub>`, and `ConfigGroupRegistry`. `state/config-section-registry.ts` carries `ConfigSectionContribution` (`anchor: ConfigGroupId`), `resolveConfigSections`, `configSectionNavs`, and `SettingsKeyClaim`; `state/config-section-partition.ts` carries `assertSettingsKeyPartition` + `UNCLAIMED_SETTINGS_KEYS` VERBATIM (the partition is about settings-blob WRITES and keeps its settings name). `SettingsViewerView` + `useSettingsViewerView` keep their names too — the projection is about who may SEE settings, and renaming a `#data` hook for a word buys nothing.

**The collection arm.** `CollectionContribution` (tier 4, `lib/collection-contracts.ts`) DROPS `id · label · icon · order · blurb` — they lift onto the group base (`blurb` IS `description`) so a collection's identity has one home. Everything behavioural (`emptyText · useVisible · useCount · preview · useMemberTitle · list · create · importFile · bulkSelect · detail · context`) stays byte-identical, and each feature keeps its `lib/*-collection.tsx` body beside a NEW `lib/*-group.tsx` def that wraps it (`body: { kind: "collection", collection: tagCollection }`). REJECTED: folding the contribution into the group file — the four collection bodies are the largest defs on the tree and their rows/detail/context CTs import them by that name.

**The registry delivery.** `createRegistry("config-groups", CONFIG_GROUP_IDS, {…})` at the door, handed to `makeConfigSection(groups)` by FACTORY (the `makeHomeSection(homeTiles)` / `makeConfigSection(configCollections)` precedent). The `settings-pane-registry-context/-provider` pair is DELETED, not renamed: the host is the only reader, the ⌘K source closes over the same registry at the door, and `agent-nav` validates against the tuple — a Provider would be a second delivery path for one consumer. The section-contribution registry KEEPS its context pair (renamed `config-section-registry-*`): 34 owner surfaces read it from inside their own trees.

**Navigation state.** `state/config-nav-store.ts` (a `createGatedStore` mint named `config-nav`, NOT a `*-selection-store` — the kinded member selection stays in `config-selection-store.ts` via its factory): `{ activeGroup, activeSub, target }`. `openConfigTo(group, sub?, setting?)` = clear the member selection · set `activeGroup`/`activeSub` · open the group's disclosure · write a nonce'd `target` · `setActiveSection("config")`. `selectConfigGroup(group, firstSub)` / `selectConfigSub(group, sub)` are the LIST clicks (same writes, no section switch); `setActiveConfigSub` is the spy's write. The EFFECTIVE active group is ONE derivation, `useActiveConfigGroup()` = the selected member's kind ⊕ `activeGroup` — so a collection member's group is active by construction and `selectCollectionMember` needs no second write (and no store cycle). REJECTED: `configTarget` on `shell-store.ts` (§5.2) — the store sits 36 lines under its 450 cap, the settings shell's `active`/`activeSub` never lived there either, and a section's navigation state homes in its own store (the drill-store precedent). The shell store LOSES `settingsCategory`/`settingsSubcategory`/`openSettingsTo`/`useSettingsTarget`/`useSettingsSubTarget`; `closeModal` stops clearing them.

**The section seam.** `makeConfigSection(groups)` composes the `SectionSelection` the shell reads: `hasSelection` = a member is open OR the effective active group is a non-collection group (so on a phone tapping Appearance pushes CONTENT; tapping a collection band only discloses it, as today); `clear` pops the member first, then the group. Mobile therefore rides the shell's one-shell rule and the settings shell's private push-detail arm DIES with it.

**The host.** `features/config/surfaces/config-list-surface.tsx` (the roster, generalised): the search block (S2) → four named shelves — User · App · Collections · Extensions (`role="group"` + `aria-labelledby` the kicker) → `ConfigListGroup` per visible group in `(order, id)`. `components/config-list-group.tsx` dispatches on `body.kind` (a BUILD fact fixed at the door) to `CollectionListGroup` (today's `collection-group.tsx`, verbatim under the group's lifted identity) or `SectionsListGroup` (band = disclosure · icon · label; body = one `ListRow` per subcategory, `selected` = the spy's sub). The active group is always expanded and its band cannot collapse it. `surfaces/config-content-surface.tsx` renders, in priority: the open member's editor · the active group's body (placeholder | surface | the sections skimmer through `useConfigSections`) with the aggregate save footer below the scroller · the welcome. The spy (`lib/config-scroll-spy.ts`, verbatim) runs over the CONTENT scroller keyed on the active group; the jump helpers move to `lib/config-jump.ts`; the deep-link effect keys on `target.nonce` (a category-only target lands on the FIRST sub with the spy suppressed — #549's rule). `features/settings` keeps `theme-modal`, `theme-picker-surface`, `theme-editor` and its two group defs; the shell, nav column, placeholder, footer, search, spy and nav-model dissolve into `features/config`.

**The rail foot (§6.3)** and **the search (§6.4)** below.

### 6.3 The rail-foot mechanism (#297 → S1)

`RAIL_ZONES` (`state/section-registry.ts:33`) gains `"rail.end"`, and `CHROME_ZONES` (`state/chrome-registry.ts:20`) becomes `[...RAIL_ZONES, "topbar.trail"]` — the zone vocabulary stays ONE home and no member is spelled twice. The config definition declares `rail: { label: "Settings", icon: Settings, group: "authoring", mobile: "sheet", zone: "rail.end" }`. Nothing else is hand-placed: `assembleChrome`'s `sectionEntry` already honours `def.rail.zone` (`assemble-chrome.ts:171`), `rail.tsx`'s `endEntries` renders a `section` behaviour with active state and `aria-current="page"` (`rail.tsx:69-72,227-238`), and the foot order falls out of `(order, id)`: theme (modal index 0) · Settings (tuple index 4) · persona (50) — the gear's old slot. Two derivation consumers need a section arm they never had, because no section ever sat in `rail.end`: `mobileBarCuration` (`chrome-registry.ts:110`) admits a `rail.end` section as bar-eligible (the phone bar's `.shell-rail-actions` is `display: contents`, `shell.css:1006-1010`, so it has a cell), or standing in Settings on a phone would resurrect the #484 lie; and `you-sheet.tsx`'s `SheetChromeEntry` gains the `section` arm (a routing row under "Account and settings", shown only while its effective curation is `sheet`). Both are projection edits in derive-only files — announced to the orchestrator before landing (§L hazard line). REJECTED: rendering the tuple's last member after the spacer by position — a hand map keyed on tuple order is exactly the parallel map G2 kills.

### 6.4 S2 — the search, as built

`lib/config-search-tokens.ts` (tier 4, pure): `parseConfigQuery(text)` → `{ terms, modified, advanced, shelf?, in?, ext?, unknown[] }` over VS Code's `@` grammar. `features/config/lib/config-search.ts`: `buildConfigSearchEntries(groups, visibleIds, subcategoriesFor)` (the `buildSettingsSearchEntries` derivation generalised — group rows · sub rows · setting leaves, each carrying `shelf`/`groupId`/`subId`/`settingId`) plus DYNAMIC rows from a group's `useSearchRows` hook (a new optional field on `ConfigGroupBase`; a collection group maps its members over the same cache-first list query, personas maps persona names), rendered per source in its own fiber. The engine is `@orb/ui/fuzzy-search` over the static rows (`boost { label: 4 }`); `Command`/`CommandInput` keep the keyboard grammar and the `expanded` rule. `@modified` is DERIVED: a user-tier `owns` claim vs `DEFAULT_USER_SETTINGS` through the cached `getUserSettings`; an app-tier claim vs `getAppSettingsWithOverrides.overrides`. `state/config-search-store.ts` holds the live query + the selected match (`configSearchMatch`); the LIST filters to matching rows and marks hits with `HighlightedText` in each row label; selecting a hit calls `openConfigTo`/`selectCollectionMember` and flashes the anchor. `features/config/lib/config-palette-source.ts` is the ⌘K `CommandPaletteSource` ("Settings") over the same index, registered at the door. DEFERRED to S3 with its receipt: the CONTENT-row mark rides `SettingRowFrame` (§4), which is the S3 composite — nothing in S2 renders a knob row.

### 6.5 Coupled-site inventory (walked, not remembered)

state: `config-group-ids.ts` · `config-group-registry.ts` · `config-section-registry.ts` · `config-section-partition.ts` · `config-section-registry-{context,provider}` · `config-nav-store.ts` (new) · `config-search-store.ts` (new, S2) · `config-group-open-store.ts` (keys typed) · `config-selection-store.ts` (`goToCollection` dies) · `shell-store.ts` · `modal-slot-ids.ts` · `section-registry.ts` (`RAIL_ZONES`) · `chrome-registry.ts` · `index.ts`. lib: `collection-contracts.ts` · `agent-bridge.ts` · `config-search-tokens.ts` (new) · `index.ts`. compose: `authed-app.tsx` · `settings-sections.ts` → `config-sections.ts`. agent-nav: `index.ts` (`openConfig`). features: config (host, 9 files) · settings (7 dissolve, 2 rename) · persona (`personas-group.tsx`, `personas-nav.ts`, `persona-settings-surface.tsx`, `persona-panel-surface.tsx` + `persona-this-chat-section.tsx` + `persona-panel-row.tsx` gain OPTIONAL anchor-id props so only the Config mount stamps ids — three mounts of one component would otherwise duplicate DOM ids) · workloads (2 defs) · credentials · automation · plugin · user-admin · tag · regex · world-info · roster-preset (4 new `*-group.tsx`; 4 collection bodies lose the lifted fields) · 34 section files (`ConfigSectionContribution` + `configAnchorId`) · the 12 `openSettingsTo` + 5 `goToCollection` sites · app-shell `you-sheet.tsx`. tooling: `_shared/argv.ts` · `_shared/nav.ts` · `snap/ops/scenarios/orb-app.json` · gates `config-group-completeness` (re-keyed `settings-pane-completeness` + the collection arms; `collection-registry-completeness` deleted) · `no-parallel-section-map` · `settings-section-anchored` · `feature-owns-definition` (`DEFINITION_RE` pane→group; `collection` retired — a collection registers through its group). tests: `check-gates.int` fixtures (3) · `gate-conformance` · `Core-Enforcement-Active-Gates.md` rows + the count (233 → 232) · `ct-data-providers.tsx` · state `_ct-stories` probes · `assemble-chrome.test.ts` fixture id · `agent-nav/index.test.ts` · `modal-registry-provider.ct.tsx` · `shell-store.ct.tsx` · `chrome-registry.test.ts` · `rail.ct.tsx:21` · `app-shell.ct.tsx` (8 modal drives → the Theme modal / the section) · `settings-shell-surface.ct.tsx` + stories → `config-content-surface.ct.tsx` / `config-list-surface.ct.tsx` · the four pane CTs → `*-group.ct.tsx` · `settings-pane-registry.test.ts` → the partition mirror · `settings-search.test.ts` → `config-search.test.ts` · `tests/tooling/_shared/{argv,nav}.test.ts` · `tests/e2e/live-settings-render-truth.spec.ts` (retargeted; owes `typecheck:tests-dom`, not run in-lane) · `docs/test-baseline/manifest.json` (moved specs + `deletions` rows). docs: this file · `UI-Architecture-and-Layout.md` §4.1/§4.2 · `client-architecture-lockdown.md` §5 rule 5, §6a twin line, §6d, §8, §9, §16 G2/G4 · `config-rail-spec.md` C-5 + §4 · `ui-package-design.md` §2 · `plugin-ui-plane.md` §4.5 · `Core-Enforcement-Active-Gates.md`.

### 6.6 Test plan

Red-first (each run against the pre-fix source first): the modal is gone (`rail.ct.tsx` — "Settings" is a section button carrying `aria-current="page"` when active; `assemble-chrome.test.ts` — a `rail.end` SECTION derives a `rail.end` entry); `openConfigTo("appearance","motion")` lands with the group expanded, the sub current, the spy suppressed then re-armed (`config-content-surface.ct.tsx`); the spy lights the LIST row on a synthetic scroll of the CONTENT scroller; a collection group renders its roster + create `+` unchanged and the persona group renders today's surface with five anchors (`config-list-surface.ct.tsx`); `mobileBarCuration` lends a slot to a `rail.end` section (`chrome-registry.test.ts`); the You sheet routes on the Settings row (`app-shell.ct.tsx`). Planted controls: the completeness gate's conformance rows (a `ConfigGroupDefinition` off a `*-group` file; a `collection` body whose `create` is a node; a `sections` skimmer with own subs) plus a REAL planted `features/__probe/lib/x-group.tsx` under `pnpm check:structure`; the tuple's totality is a planted tsc error (a missing door row). S2: `config-search-tokens.test.ts` (grammar table + malformed tokens); `config-search.test.ts` (the index derivation, `when`-hidden groups contribute nothing, `@modified` over a planted changed key); `config-search-input.ct.tsx` (`@` opens the token list, `@shelf:user` narrows, a collection member name is found, clearing restores, `aria-expanded` follows the list); the ⌘K source opens Config to the hit (`config-palette-source.ct.tsx`).

### 6.7 Forks stated to the orchestrator (defaults taken, work continued)

- **F-10 · rail-foot projection edits in derive-only files** (`chrome-registry.ts` `mobileBarCuration`, `you-sheet.tsx` `SheetChromeEntry`) — default: land them as the section arm the derivation lacked (§6.3), hunks declared.
- **F-11 · the LIST band's search.** §3.2 puts the search box in the LIST BAND; the band is the 48px `.shell-panel-header` chrome row and `ListPaneHeader` carries title · count · ONE primary. Default: the search rides the LIST BODY's top (the corpus omnibox precedent) under `role="search"`; the band stays the title.
- **F-12 · persona anchors with conditional presence** — SUPERSEDED by §6.8 (owner note 2, 2026-08-30): the five parts are three registered sections + two search LEAVES, and the this-chat section renders an honest idle line instead of unmounting.
- **F-13 · the `SettingsViewerView`/partition names** stay (§6.2) — a naming deviation from §3.1's illustrative snippet, not a mechanism change.

### 6.8 Every group is a skimmer (owner notes 1 + 2, 2026-08-30 — folded into S1)

**The ruling.** "Anything else moving to the new Settings, or already there, adapts to the REGISTRY pattern and SKIMMER setup." Read as D120 conformance for EVERY group, not the nine settings categories: the parts of persona, plugins, connections, automation and backup register as `ConfigSectionContribution`s at their group's anchor; the host derives nav · search · spy · teach from the registry; a body that escapes the registry is the half-migration the doctrine bans.

**The shape chosen — the `surface` body arm is RETIRED, and `ConfigGroupBase.subcategories` with it.** `ConfigGroupBody = { kind: "sections" } | { kind: "collection", collection } | { placeholder: true }`. A non-collection group is a skimmer by TYPE: it has no way to render anything but what the section registry hands the host, and no way to paint a LIST row nothing renders. That is the maximal, most-provable arm — the wall the owner asked the gate to cover ("a group that paints a section outside the registry") is a `tsc` fact at the group level (a `body: { kind: "surface" }` or a `subcategories:` key on a group literal is an excess-property error — the planted receipt is in the report), and the gate covers the one hole `tsc` cannot see: a component file stamping `configAnchorId(...)` that no contribution renders (§6.8.3).

*Rejected — keep `surface` and add a gate arm.* A `surface` render is an opaque function; a gate can only pattern-match what it mounts, and every surface group on the tree today (five of nine non-collection groups) hand-stamped its anchors from a private `subcategories` map — exactly the old map beside the new that SET-SEAMS stage 6 REDs for skimmers. A wall the type system can build is not a wall a gate should approximate. *Rejected — convert only persona + plugins (the two the note names).* The note's first sentence is universal ("anything … already there"); connections/backup/automation are `surface` groups with own maps, the same defect class; leaving three of five unconverted is a half-migration by count.

**6.8.1 Per-group conversion (the parts → contributions map).**

| Group | Was | Now (contributions at the anchor, door order) | Claims / gating |
| - | - | - | - |
| `personas` | `surface` + 5 `subcategories` (PANEL\_ANCHORS hand-stamped) | `personaNotificationsSection` (`notifications`) · `personaRosterSection` (`your-personas`) · `personaThisChatSection` (`this-chat`) | notifications `owns: user/persona/showNotifications` (the namespace's only key — the partition stays clean); roster + this-chat claim nothing (verbs, the "CRUD surface like personas" exemption the partition header names) |
| `plugins` | `surface` + 2 own subs, hosting `pluginDistributeSection` itself | `pluginsInstalledSection` · `pluginsInstallSection` · `pluginDistributeSection` (unchanged, `when: isAdmin`) | none |
| `connections` | `surface` + 3 own subs | `connectionsRolesSection` (`model-roles`) · `connectionsHostClaudeSection` (`host-claude`, **`when: viewer.isOwner`** — `SettingsViewerView` grows `isOwner`, derived in the ONE `#data` home; the old surface rendered `null` for non-owners under a LIST row that scrolled to nothing) · `connectionsKeysSection` (`saved-keys`) | roles `owns: user/routing/roleDefaults` (the namespace's only key) |
| `automation` | `surface` + 2 own subs (anchored bare `Stack`s) | `automationLibraryRulesSection` (`rules`) · `automationBudgetSection` (`budget`) — each an anchored, heading-bearing `<Section divider>` with its own `QueryBoundary` (the sibling-section posture; the `Separator` the surface drew between two heading-less stacks is retired with the surface) | none |
| `backup` | `surface` + 2 own subs | `backupExportSection` (`export`) · `backupImportSection` (`import`) | none (raw `/api` verbs) |
| `appearance` · `chat-behavior` · `workloads` · `admin` | `sections` skimmers | unchanged | unchanged |
| `tags` · `regex` · `worldInfo` · `cast` | `collection` | unchanged — a collection's member DETAIL is the owner's editor (C-7); no collection carries settings-like sections OUTSIDE member detail today (walked: `tag-collection.tsx` · `regex-collection.tsx` · `world-info-collection.tsx` · `cast-collection.tsx` declare rows · detail · context · create/import only — the world-info scan knobs are already `worldInfoSettingsSection` at `chat-behavior`) | n/a |

**6.8.2 Persona — the FRAME conforms, the editing model does not move (fork F-14).** Owner note 1's "five parts as contributions" meets two parts that structurally cannot register as sections: the EDITOR is the row's own inline expansion (`persona-panel-row.tsx` mounts it inside the expanded row — a standalone editor section would change where a persona is edited, which is owner-sacred), and PINNED is one row inside the this-chat `<Section>` (`persona-this-chat-section.tsx` renders it under "Playing as"; lifting it into its own heading-bearing section changes the panel's anatomy in all three mounts). Default taken: both are search LEAVES (`ConfigSubcategory.settings`, the registry's existing leaf mechanism — a hit lands on the owning section's anchor): `editor` under `your-personas`, `pinned` under `this-chat`. Three sections + two leaves = five reachable parts, zero invented sections, zero anchors stamped by hand. The `PersonaPanelSurface` `anchors` prop, `PersonaPanelRow.editorAnchorId` and `PersonaThisChatSection.pinnedAnchorId` retire. The this-chat section gains an `idle` render (the config mount passes "Open a chat to choose who you play as there.") so its LIST row never scrolls to nothing; the rail popover and the You sheet pass none and keep unmounting it, byte-identical.

**6.8.3 The gate — `config-group-completeness` after the ruling.** Arms that `tsc` now owns are DELETED, not left as quiet-zero passes (owner note 1: "a gate that used to bite and now passes vacuously is the failure"): the placeholder-honesty arm (no `surface` render exists to hide a placeholder in) and the skimmer-subcategories arm (`subcategories` is not a property of the type). Kept: co-location (`*-group` / `*-collection`), duplicate id, host-imports-no-body (re-keyed: the config CONTENT host importing from `#features/*` or escaping `features/config/` by relative path), and the folded-in collection arms (create/import-is-data, orphan body). ADDED — the **anchor-outside-registry** arm: a `packages/client/src/**` file outside `state/` and `features/config/` that CALLS `configAnchorId(` must either declare a `ConfigSectionContribution` or declare a component some contribution's `body` renders by JSX tag; otherwise it is a section painted outside the registry (planted RED: a `components/rogue-section.tsx` stamping an anchor with no contribution). `settings-section-anchored` drops its `*-settings-surface.tsx` path arm (the four such files are deleted by this stage — a path arm over an empty set is the vacuous pass the note forbids) and keeps the content-keyed fragment arm, which now covers every anchored section on the tree.

**6.8.4 Coupled sites added by §6.8** (over §6.5): `data/use-settings-viewer-view.ts` (+`isOwner`) and every `SettingsViewerView` literal in tests; the five feature front doors; `compose/config-sections.ts` (+12 rows); the four `_ct-stories.tsx` that mounted a surface (automation · credentials · plugin · workloads) → mount the contributions through a `CtConfigGroupBody` helper that resolves them exactly as the host does; `owner-rules-surface.ct.tsx` → `owner-automation-sections.ct.tsx`; `tests/client/features/{plugin,credentials,workloads}/surfaces/*-settings-surface.ct.tsx` re-pointed at the section stories; `lib/test-ids.ts` `backupSection` (unused by any test — retired with its only stamp).

---

## 7. S3 + S4 as designed — the lane design (cb-config-s3s4, 2026-08-30)

Written BEFORE the build, against the tree at `6c3076ab6` (S1+S2 merged at `6923f33cb`). Where §3/§5 and
this section disagree, this section carries the receipt; the D-ledger wins over both. The canvas
(`mocks/config-revamp/DESIGN.md` + the four boards) is the owner-approved spec of record; where it
abbreviates, its own contract paragraphs and the verified action inventory decide. Memory lessons used:
`theme-pipeline-d71`, `persona-is-owner-sacred` (2026-08-30 corrected scope), `accent-is-inherited-not-derived`,
`surface-flip-retires-the-ct-premise`, `settings-section-three-coupled-sites`, `empty-states-are-load-bearing`,
`orb-ui-icons-seal`, `recreating-a-deleted-test-path-is-a-coupled-site`, `ratifying-gate-owes-two-receipts`.

### 7.0 Owner riders (2026-08-30, mid-lane — binding, recorded here as the ruling home)

- **R-TEACH — teach is LOCKED to its leaf.** `ConfigSettingLeaf.teach` is **REQUIRED**, typed
  `SettingTeach | { none: string }` — an explicit opt-out WITH a stated reason, never `teach?:`. tsc forces
  every NEW leaf to declare its teaching at birth. Honesty arms (each with a planted-RED receipt): empty
  `summary` or empty `affects` on a non-none teach is RED; `{none: ""}` is RED; a `related` ref that does
  not resolve against the registries is RED. Enforcer: `assertTeachHonesty(configSections, groups)` at the
  compose door (the `assertSettingsKeyPartition` posture — a throw, not a gate approximation) + its mirror
  unit test with planted fixtures + a derived-population test that iterates the REAL registry's leaves
  (never a hand list) and asserts every leaf resolves a teach or is a declared none.
- **R-BG — the background picker rebuilds on the Looks grammar** (owner: the Select-of-image-names picker
  is "clunky as fuck and gross"; the BG-D library is invisible). Three tiers: PICK = ONE thumbnail grid
  (None tile · the seeded plates as real thumbnails · every `backgroundLibrary` entry as a tile; selected
  wears the ring; `backgroundImageKind` DIES as a user-facing control — it derives from the tapped tile);
  MANAGE = library tiles carry ⋯ → Remove from library; ADD = upload + paste-URL as one "Add background"
  door at the grid's end, both funnelling into the existing append+select path (the BG-D one-atomic-patch
  invariant preserved verbatim). Fit/Scrim/Blur stay as rows below the grid. House media-grid cell family,
  never a bespoke grid. Plus a report-only sweep of the "outcome is SEEN but the control is text" class
  (§7.6) — recommendations only, no further rebuilds without an ack.

### 7.1 Premises re-derived

- **The canvas foot cells are scaffold, not contract.** `Main.dc.html:159` / `Personas.dc.html:156` draw
  the bracket's foot cells as `About · Preview · Activity` while stacking About/Applies/Learn blocks in one
  viewport. No Preview or Activity machinery exists for config anywhere on the tree; the boards' own head
  gloss ("the focused setting · About · Applies · Learn"), §3.5 and the dispatch all name the tab roster
  **About · Applies · Learn**. Built as three foot tabs, `defaultTab` About, Learn by APPLICABILITY.
- **The `workloads`/`backup` labels are already "Jobs" / "Backup & Restore"** (`workloads-group.tsx:27`,
  `backup-group.tsx:12`) — the Phone board's "labels updated" rows are BUILT; no edit.
- **The persona editor's character-connection section has no persona-side READ.** The verbs are
  `connectToCharacter` / `disconnectFromCharacter` / `listConnectedToCharacter(characterId)` — the
  character-side read only (`domain/persona/verbs/connection/list-connected.ts`). The editor needs
  "characters connected to THIS persona"; per-candidate fan-out is banned by taste. Built: ONE small read
  verb `persona.listConnectedCharacters({personaId})` in the persona domain (the junction is
  persona-produced), owner-scoped, mirroring `listConnectedToCharacter`. Fork stated with this default;
  a read verb changes no resolution mechanics.
- **The switcher's "your N messages" count has no read.** `ChatDetail` carries no viewer-authored-row
  count and `reattributePersona {kind:"mine"}` needs none. The popover row renders without the count
  ("Re-attribute your messages here → <persona>"); deviation noted, not worth a wire field.
- **Theme rows carry no import provenance.** `Theme` = id/name/override/css/isSeed/timestamps — the
  board's "imported · May 12" meta can only honestly render the AGE. Export/Import are built client-side
  over the row's own bytes (`{name, override, css}` JSON download; import parses → `createTheme`) — no
  new verbs; the provenance WORD is dropped (deviation noted; a schema field for one label is not minted here).

### 7.2 S3 — the teacher, as designed

**The focused-setting seam.** `state/config-focus-store.ts` (transient gated store, the
`config-search-store` posture): `ConfigFocus = { group: ConfigGroupId; sub: string; setting: string | null }`,
writers `setConfigFocus` / `__resetConfigFocus`, reader `useConfigFocus`. KEEP-LAST semantics: blur never
clears (the reader who looked away keeps their lesson); a new focus replaces; leaving the group clears via
the nav store's existing clear. NOT vocabulary (an open shape one host interprets — the `contextTab` test).

**Teach as contribution data.** In `state/config-group-registry.ts`:
`ConfigSettingRef = { group: ConfigGroupId; sub: string; setting?: string }`;
`SettingTeach = { summary: string; affects: readonly string[]; overriddenBy?: readonly {label; open(): void}[]; related?: readonly ConfigSettingRef[]; more?: () => ReactNode }`;
`SettingTeachDecl = SettingTeach | { none: string }`; `ConfigSettingLeaf.teach: SettingTeachDecl` (REQUIRED —
R-TEACH); `ConfigSubcategory.teach?: SettingTeach` (the section-level lesson, optional — the rider binds
leaves). Resolution ladder at the host: focused leaf's teach → (a `none` leaf or no focus) its section's
teach → the group's `description`. *Rejected:* teach on the section BODY (a render prop) — teaching is data
the host indexes and the honesty assert must see it without mounting anything.

**The projection** (published in `lib/registry-contracts.ts` — the `context-definition-shape` G3 anchor;
state-free by the `client-lib-floor` rule, so ids are resolved to DISPLAY data before crossing):
`ConfigTeachDoor = { label; open(): void }`;
`ConfigTeachView = { title; trail; summary; affects; applies: ConfigTeachDoor[]; related: ConfigTeachDoor[]; learn: (() => ReactNode) | null }`;
`ConfigContextState = { teach: ConfigTeachView; member: { title: string; body: () => ReactNode } | null }`.
`useConfigContextState` (in `features/config/lib/config-context.tsx`) resolves focus × selection × the two
registries: member open ⇒ `member` = the collection's context arm (or its `none` copy as an EmptyState) and
`teach` = the group lesson; focus ⇒ the leaf ladder; group active, nothing focused ⇒ the READING lesson (the
spy's current section's own `teach`, else the group's — neither carries doors, #1101); nothing ⇒ `null`
(the mint's `empty` arm = `CONFIG_CONTEXT_EMPTY`).
`related` refs resolve through the registries into `openConfigTo(group, sub, setting)` doors, and every ref
names a `setting` — a section-only ref would render a LIST row's name as a door (#1101).

**The tabs.** `context: defineContextTabs<ConfigContextState>` replaces the `kind:"single"` arm in
`makeConfigSection`: tabs `config.about` (About — summary · Affects · Related doors) · `config.applies`
(Applies — `overriddenBy` doors; for an open member THIS tab renders the collection's arm — "Where it's
attached" renamed) · `config.learn` (Learn — `more`, `when` only when supplied). `defaultTab` About;
`railLabel` "Settings"; `header` = the focused subject's title + trail (the band names what the pane
answers — the `ConfigContextHeader` lesson carried forward). `ConfigContextBody`/`ConfigContextHeader` and
their CT retire (the bracket owns band + body now); the tab bodies live in
`features/config/components/config-teacher.tsx`. Focus-follows-content over `contextTab`: swapping focus
swaps head + body and KEEPS the tab (CP-4 §4.1) — free, because the tab selection is the shared seam.

**The row seam.** `#components/setting-teach-row.tsx` (tier-2, the `SettingSwitchRow`/`character-picker`
precedent — components may read #state): `ConfigTeachScope` (a React context of `{group, sub:
ConfigSubcategory}` each knob section provides once from its nav const) + `SettingRow` (`settingId` prop;
wraps the existing Field row): stamps `data-setting`, publishes `configFocus` on focus-within capture and
on click, and on fine pointers on HOVER after a delay (F-8 — never on coarse); renders the trailing `i`
(`HintTrigger`, sibling of the Field — tooltip = the teach summary's first sentence) whose ACTIVATION
opens the teacher when the pane is closed (`setOpenOverlayPanel("context")` /
`openContextOverlay` — F-6: the pane is never forced open by focus alone). `HintTrigger` gains an optional
`onClick` (a two-line sealed-primitive widening; its CT arm asserts activation still shows the tooltip and
fires the click). While `configSearchMatch` names the row it wears `data-search-match` + the flash ring —
the in-LABEL `<mark>` of §3.4 is NOT built (the label renders inside the sealed form-field anatomy; the
S2 results list already marks text) — deviation recorded.
*Rejected:* per-row DOM listeners on the CONTENT surface mapping `event.target → [data-setting]` (no home
for the `i`, and hover semantics would live in the host instead of the row).

**The sweep (the bulk move).** Every knob-bearing `sections` group: each Field row's `description` prose
RE-HOMES into its leaf's `teach.summary`/`affects` (copy preserved, not deleted); the row keeps label +
control (+ `disabledReason`/warnings — task-vital facts stay inline, D126 rider) and gains its
`SettingRow` wrapper + a leaf if it lacked one. List-shaped sections (admin users, jobs, plugins, backup,
automation rules, connections keys, the persona roster/this-chat) keep their anatomy and get
section-level `teach` only. Existing declared leaves gain `teach` (tsc drives the totality). CT fixtures
declaring `ConfigSubcategory` literals are tsc-enumerated into the same sweep.

**Deferred WITH receipt (not built in S3):** §3.4's row chrome — the modified rail, per-row Reset,
scope chip, Copy-id/Copy-link menu, `useConfigLeaf` — is in the program design but in neither the canvas,
the dispatch, nor the owner's ruling set; it needs a per-leaf value/write seam (`owns`-keyed reads + a
reset patch per section) that deserves its own leg. The teacher's About tab therefore teaches
summary/affects/related without the "default vs current + Reset door" block until that leg lands.

### 7.3 S4 — Looks, the background grid, and the Appearance fold

- **`appearanceLooksSection`** (`features/settings/lib/appearance-looks-section.tsx` + nav model; D114 —
  settings owns theme): FIRST at the `appearance` anchor. Tier 1 PICK: the three seed rows off
  `settings.listThemes` as fixed CARDS (swatch strip via `ThemeScope`, the picker's isActive rule:
  `selectedThemeId === null` ⇒ Hearth) — picking calls `useSelectTheme` (the D71 pipeline, apply-not-mode);
  the row is closed (seeds are ownerless and non-deletable). Tier 2 MANAGE: "Your themes" = the non-seed
  rows as `ListRow`s (swatch · name · built/edited age · ⋯ = Apply · Edit in builder · Export · Delete
  \[confirm-gated, the `ThemeRowMenu` lineage]) + an Import file door. Tier 3 MAKE: ONE builder door "New
  theme from <current>…" = the picker's draft/mint machinery verbatim (`duplicateTheme` of the current
  theme at first real edit — nothing minted on the click); the builder (`ThemeEditor`) mounts INLINE as
  the section's editing state with "← Back" (the ThemeManager swap, re-homed). NO freestanding accent
  knob anywhere; every color decision saves as a named theme.

- **The `theme` modal RETIRES**: `themeModal` def + `MODAL_SLOT_IDS` member + the rail-foot "Switch theme"
  trigger die; `theme-picker-surface.tsx` dissolves into the Looks section (the draft/mint/swatch pieces
  re-homed); the rail foot becomes Settings (gear) · persona slot, per the RailSwitcher board. Gates/tests
  that key on it re-key with planted-RED receipts (§7.5).

- **The "Customize this look" fold.** `ConfigSectionContribution.advanced?: boolean` +
  `ConfigGroupBase.advancedFold?: { label: string; useCaption?: () => string | null }`: the skimmer
  renders plain sections, then ONE `Collapsible` (trigger `size="control"`, collapsed by default) labelled
  by the group's fold decl (Appearance: "Customize this look", caption "your changes, on top of <current
  look>" via a hook reading the selected theme name) containing the `advanced` sections in door order.
  Appearance marks every non-Looks section advanced. LIST rows are unchanged (the map stays total); a
  landing whose target names an advanced section OPENS the fold before the jump (the content host's
  landing effect learns the fold; the spy simply cannot light a closed section). Search visibility is
  untouched (folded ≠ hidden — `@advanced` stays a leaf axis). *Rejected:* a Looks-local fold (any group
  may need the D107 axis; the host owning disclosure keeps LIST/jump/spy honest) and marking folded
  sections' search entries `advanced` (that would hide Reading/Density from default search).

- **The background grid (R-BG).** `appearance-background-section.tsx` rebuilds its body: PICK = one
  `media-grid` (the selectable house cell family — `selectedIds`/`aria-selected` built in): a None tile ·
  `listSeededBackgrounds()` thumbnails (their `public/` urls) · every `backgroundLibrary` entry
  (`blobUrl(assetHash)`); tap writes the derived patch through the SAME autosave form (seeded ⇒
  `{backgroundImageKind:"seeded", backgroundSeededId}`; library ⇒ kind `asset` + the three asset fields;
  None ⇒ kind `none`) — BG-D's one-atomic-patch invariant holds because it is still one form. MANAGE =
  a per-library-tile ⋯ (Remove from library — filters the entry; removing the SELECTED entry also resets
  kind to `none` in the same patch). ADD = one "Add background" door at the grid's end opening the
  existing `BackgroundUploadField` + `ExternalBackgroundField` pair (both still funnel into
  append+select). Fit/Scrim/Blur rows stay below (rendered while kind ≠ none). The `Image` kind Select
  and the seeded-name Select DIE (`BACKGROUND_KIND_ITEMS`/`SEEDED_BACKGROUND_ITEMS` retire with their
  consumers swept).

- **`background-source-field.tsx` rides the SAME grid grammar (owner addendum to R-BG, 2026-08-30).** The
  BG-C carried-background picker (tier-2 shared; the room-overrides Control A + the character-card
  Control B) rebuilds as the grid variant with its own constraints kept: a DISCRETE immediate-write picker
  (pick → the caller's mutate; no autosave session — D78 stays with the caller); None tile · seeded
  thumbnails · the viewer's library thumbnails off its existing read seam; NO inline upload/manage — the
  Add affordance stays the LINK to Settings → Appearance → Background; the kind DERIVES from the tapped
  tile. If `BACKGROUND_KIND_ITEMS` loses its last Select consumer it is retired (recorded here, not left
  dead). CT: both call-site postures red-first (a room-override pick mutates immediately; a card pick
  lands in the card patch; a seeded tap yields the ThemeBackground value; None clears).

- **ONE theme-swatch atom, three mounts (owner addendum #3, 2026-08-30).** `features/character/components/
  character-appearance-tab.tsx`'s `StartFromThemeField` (a Select of theme NAMES) is the same seen-not-read
  shoehorn — it adopts the Looks grammar. Minted: `@orb/ui/theme-swatch` (§13.9 — no `#data`, pure
  presentation over the theme's REAL stored override values through `ThemeScope`, so a stripe is never a
  hand-painted approximation): the swatch STRIPE plus a row/card composite (stripe · name · optional
  trailing slot · selected ring). Consumers: the Looks section's shipped cards + Your-themes rows, the
  builder's start-from state, and `StartFromThemeField` rebuilt as swatch rows — whose contract holds
  exactly: selecting SEEDS the override form, never applies a theme (the tab's "one applying act" line);
  the shared `theme-override-form.ts` flat-palette vocabulary is not forked; the tab's Font/Corner-radius
  Selects are named enums and stay. CT: the atom renders the same stripe for the same theme row in both
  mounts, red-first.

- **RESOLVED (#1152, 2026-09-05): the menu row keeps the STRIP; `ThemeMiniSurface` is NOT re-homed.** #920's
  cold contract asked for the mini surface to be reused in `StartFromThemeField`, and #1152 carried two arms
  — re-home the surface to a client shared tier both features may read, or rule the strip sufficient. The
  strip is sufficient, and the receipt is PAYLOAD HONESTY rather than taste. This door's payload is
  `cardEmbeddableSubset(theme.override)` (`character-appearance-tab.tsx::startFromTheme`), and the strip
  paints `theme.override` through the same `<ThemeScope>` clamp — depiction and payload are the same values,
  `density` aside, which the strip does not show. `ThemeMiniSurface` answers a DIFFERENT question ("what
  would selecting this theme paint the app"), and for the three SEED rows that answer is deliberately not
  the override: `resolve-theme-scope-tokens.ts` passes a seed NOTHING and lets its generated `[data-theme]`
  block paint, because feeding a seed's duplicate-to-customize override back through the clamp re-derives
  the 34 vars and shadows the hand-tuned block. Mounting it here would make the picture disagree with the
  payload on exactly Hearth/Mocha/Light. Nothing the row needs is lost either: the mini surface carries no
  provenance badge and no name (it is decorative — the cell's visible label carries identity), the menu row
  already renders `theme.name`, and the accent is the strip's third cell. `@orb/ui/theme-swatch`'s own
  header already records the other half — a menu row's leading slot is a different job from a picker cell —
  and this line is the durable answer to the reuse question, so a later reader does not re-open it.

### 7.4 S4 — Personas in full, the rail switcher, the You sheet

- **Roster restructure** (the interior freeze is LIFTED — owner 2026-08-30; the pin/active RESOLUTION
  mechanics stay frozen behind `persona-resolution.suite.int.test.ts`, byte-untouched): rows lean —
  avatar · name (+ inline rename) · "playing" marker · the PIN affordance · ⋯ · chevron. **Pin-not-crown**:
  the default marker `Crown`/`Star` pair is replaced by ONE inline `Pin` (solid = `seeds.defaultPersonaId`;
  faint-on-hover elsewhere on fine pointers, always-faint at coarse; click = `setSeed defaultPersonaId`) —
  crowns mean host, one glyph one meaning. Row ⋯ = **Edit · Duplicate · Export · Delete** (+ the
  coarse-overflow Favorite twin): Edit expands the row's editor (the editing model's HOME is unchanged —
  the expansion), Duplicate = `persona.duplicate` (was editor-only). Band doors = New · Import ·
  **From character** (`createFromCharacter` — a small dialog: the shared `CharacterPicker` + a
  "Swap {{char}}/{{user}}" switch). Editor gains the **Connected characters** `RelationManagerSection`
  (`listConnectedCharacters` read of §7.1 + connect/disconnect). Pills per the board: "playing as" on the
  current row, "pinned · {{user}}" on the default row.
- **The rail switcher popover** (`persona-panel-surface.tsx` rebuilt; `personaChrome` entry unchanged):
  bar lens = who-head (avatar · name · "Playing as · pinned — your default everywhere" when current =
  default, else "Playing as") → "Switch persona" radio rows (avatar · name · pin · "playing" pill;
  row-body = switch under the SCOPE) → the CONTEXTUAL block only while a chat room is open
  (`useActiveChatId()`): "In <room title>" · Applies segment `Everywhere | This chat` (a LOCAL scope for
  the next switch: Everywhere ⇒ `setSeed currentPersonaId` — the existing playing-as mechanism; This
  chat ⇒ `setActivePersona(chatId, personaId)`) · the re-attribute row (`reattributePersona(chatId,
  {kind:"mine"})`, target = the viewer's chat persona) → "Manage personas in Settings" =
  `openConfigTo("personas")` → the account foot (handle · mode words · Log out). The roster/editor/lore/
  this-chat management leaves the popover for Config (frequency law: only what travels with a switch).
- **The `account` modal RETIRES** (owner-ruled F-3): its three facts + sign-out become the popover's head
  and foot. `signOut` re-homes from `features/auth/surfaces/account-surface.tsx` to `#data` (beside
  `logout`; `postSessionMessage` from #lib) so persona reaches it without a cross-feature import;
  `account-modal.tsx` + `account-surface.tsx` + the `account` slot member + their CT retire (test-baseline
  deletions ledger + manifest regen in-lane); the `accountLogout`/`accountSurface` test ids move to the
  foot. D74 survives as You ⊃ Identity.
- **The You sheet lens** shrinks to the same grammar: who-head · switch rows (with pins — the DESIGN.md
  quick-surface ruling says EVERY switcher row carries the inline pin) · the account foot. No contextual
  block (the board draws none; a phone switch is the Everywhere mechanism). `you-sheet.tsx` itself is
  untouched (the widget's block still renders in the "Account and settings" group; the theme-modal row
  disappears by derivation). DEVIATION: the board draws the account foot BELOW "Go to"; the derive-only
  sheet renders the widget as one block, so the foot sits above "Go to" — recorded, not silently fixed
  (re-ordering would need a new chrome lens vocabulary; priced and declined).
- **As-built riders (2026-08-30, the S4b leg):** (a) the roster row's PIN sits between the action Layer
  and the chevron, not before the ⋯ as the board draws — the markers⇄actions pair share ONE Layer cell
  (the 2026-08-06 P1 width ruling) and a rest-visible pin can ride inside neither paint-swap half;
  (b) ONE pill max per row (current wins; "pinned · {{user}}" renders only on a non-current default row) —
  two pills on the your-only-persona row re-buy the width collapse the row's 320px fences exist to
  prevent, and "pinned" is already the solid pin's statement one cell over; (c) the editor's Connected
  characters section is NOT `RelationManagerSection`: its add-picker enumerates a flat `available` array,
  honest for bounded persona lists and a lie for the keyset-paged character library (cards past page one
  would silently vanish from the picker) — the shared `CharacterPicker` is the add door instead, summary
  rows + Disconnect keep the section grammar; (d) `chat.reattributePersona` returns `void` on the wire
  (verified at `domain/chat/contract/service.ts:342`), so there is no affected-rows count to toast — the
  confirming notify names the persona and rides `persona.showNotifications`, as the this-chat section's
  did; (e) `useAuthMe` moved to `#data` (the `useAuthConfig` precedent verbatim) so the persona foot
  reads identity without a cross-feature reach; `signOut` moved beside `logout` and THROWS — the calling
  control owns the toast.

### 7.5 Coupled sites (walked) and the test plan

Coupled sites over §6.5: `state/config-focus-store.ts` (new) · `config-group-registry.ts` (teach types +
`advancedFold`) · `config-section-registry.ts` (`advanced`) · `registry-contracts.ts` (`ConfigContextState`)
· `modal-slot-ids.ts` (−theme, −account) · `compose/authed-app.tsx` (modal rows die; teach assert at the
sections sibling) · `compose/config-sections.ts` (+`appearanceLooksSection`, `assertTeachHonesty`) ·
`config-section.tsx` (context flips to tabs) · `config-content-surface.tsx` (fold + landing) ·
`features/config/{lib/config-context.tsx,components/config-teacher.tsx}` (new) · `#components/
setting-teach-row.tsx` (new) · `@orb/ui` `hint-trigger` (+onClick, CT) · every `*-nav.ts`/`*-model.ts`
carrying leaves + every knob section body (the sweep) · `features/settings/{lib/appearance-looks-*,
components/theme-*,hooks/use-theme-*}` (fold-in; `theme-modal.tsx`/`theme-picker-surface.tsx` die) ·
`features/app-shell/components/{appearance-background-section, background-upload-field,
external-background-field}` + `lib/appearance-select-items.ts` · `features/persona/**` (roster, row,
editor, panel-surface, hooks +`use-persona-connections`, from-character dialog) · `features/auth`
(account modal/surface die; signOut → #data) · server `domain/persona/verbs/connection/list-connected-characters.ts`
(new, + contract/service/router rows + int test + presence mirror) · tests: `config-context-body.ct` →
`config-teacher.ct` · `theme-picker-surface.ct` → `appearance-looks-section.ct` · `appearance-group.ct` ·
`app-shell.ct`/`rail.ct` theme-modal drives · `modal-registry-provider.ct` fixtures ·
`account-surface.ct` (deleted) · `persona-*.ct` (pills/pin/menu) · `config-list-surface.ct` fixtures
(teach requiredness) · `tooling/src/snap/ops/scenarios/orb-app.json` `modal-theme` scenario → a
`config:appearance` landing · `tests/e2e/live-settings-render-truth.spec.ts` if it drives the theme modal
(owes `typecheck:tests-dom`) · `docs/test-baseline/manifest.json` + the deletions ledger · gate rows in
`Core-Enforcement-Active-Gates.md` where a re-key lands.

Red-first floor (each pin run against the pre-change source): the teacher CT (focus a planted row → the
pane's head + About swap to it; the tab KEEPS across a focus change; Learn absent without `more`; nothing
focused ⇒ the group lesson; no group ⇒ `CONFIG_CONTEXT_EMPTY`) · the derived-population teach test over
the REAL registry + planted RED fixtures for the three honesty arms · the Looks CT (clicking Mocha's card
issues the `selectedThemeId` patch — the real pipeline seam; three-shipped parameterization for any color
assertion; Hearth = NO `data-theme`) · the background grid CT (seeded tap → kind+id patch; library tap →
the three asset fields; None clears; the grid renders every seeded + planted-library entry — derived
population, two seeds planted; Remove-from-library of the selected entry resets kind) · the fold CT (fold
collapsed by default; a LIST click on an advanced section opens it and lands) · the pin CT (click a faint
pin → `defaultPersonaId` patch; the solid pin moves; NEVER a crown glyph in the persona tree — a planted
`Crown` import is the negative control) · the switcher CT (contextual block absent with no chat; present
with one; Everywhere vs This-chat scope routes to the two verbs; re-attribute fires `{kind:"mine"}`) ·
the You-sheet-lens CT (head · rows · foot; no editor) · `persona-resolution.suite.int.test.ts` run
UNTOUCHED (the phase gate) · the new `list-connected-characters` int test.

### 7.6 The "seen-not-read" sweep (report-only, per R-BG)

Delivered as a candidate table in the lane report (recommendations only): `chatStyle` (8 chat skins as a
Select — the strongest sibling; a skin is a visual anatomy), `density`/`elevation` (Selects whose outcome
is spatial; a labelled `OptionStrip`/segment with a live mini-preview is the honest control), the reading
font family Select (a typeface is seen), the theme-editor's token pickers (already visual — no change).
No rebuild beyond background in this lane.
**Superseded 2026-08-30 (owner ack via orchestrator): the candidates are ACKED FOR BUILD — §7.8.**

### 7.7 The §3.4 row-chrome leg, as built (2026-08-30, the deferred leg un-deferred — owner live ask)

Scope = the rider verbatim (stripe + revealed menu + `useConfigLeaf` defaults plumbing + About's
default-vs-current/Reset; NO scope chip), plus the owner's aesthetic bar: rest byte-identical, ZERO
layout shift on reveal, opacity-only fade on house motion tokens, the stripe a designed mark.

- **The leaf↔key binding is DECLARED, not derived.** `ConfigSettingLeaf` gains `key?: string` — the
  settings key this leaf's control writes, inside the owning contribution's USER-tier `owns` claim.
  Leaf ids are nav/search ids (kebab: `chat-width`) while claim keys are wire keys (camel:
  `chatWidthPct`); nothing mechanical binds them (counted: sizing is 5:5 by coincidence, background is
  not), so an inferred binding would be a lie. Absent `key` = no per-leaf chrome (composite rows like
  the background grid, CRUD lists, app-tier sections) — partial adoption is honest, never a false
  stripe. *Rejected:* leaf id === key (would force wire spellings into search ids and break every
  existing anchor); a per-row `settingsKey` prop (the teacher could never resolve it — the binding must
  live in the REGISTRY both readers already share). The door's `assertSettingsKeyPartition` gains the
  honesty arm: every declared `key` must be a member of its contribution's user-tier claim (planted-RED
  tested) — a leaf can never claim a key its section does not own.
- **`useConfigLeaf` homes in `#components`** (`components/use-config-leaf.ts`), NOT `#data` as §3.4
  originally sketched: it resolves the leaf through the config-section REGISTRY (a `#state` context,
  which `#data` may not import), and its two consumers are the tier-2 `SettingRow` and the config
  feature's teacher — `#components` is the highest common floor. Null-tolerant (`use(Context)` direct,
  the sanctioned nullable read — `useRegistry()` throws) so a `SettingRow` outside config stays inert.
  Returns `{ current, defaultValue, modified, reset, resetPending }`; `current` =
  `getUserSettings().config[claim.section][key]` (non-suspense — the `use-modified-sections` posture),
  default = `DEFAULT_USER_SETTINGS` at the same path, `modified` = the SAME structural compare
  `@modified` uses — `atPath`/`differs` HOIST from `use-modified-sections.ts` into `#lib`
  (`lib/settings-path.ts`) so "the same read" is literal, not parallel.
- **Reset is ONE direct write** — `updateUserSettingsSection({section, patch: {[key]: default}})` via a
  shared `createEntityMutation` (busDriven). DEVIATION from §3.4's "the frame gets `onReset` from the
  section": (a) the owner's re-ruling already collapsed every row write to per-user
  `updateUserSettingsSection` (what cut the scope chip); (b) the About tab's Reset door — the COARSE
  path — structurally cannot reach a section's form session; two reset paths would be the two-writer
  drift trap, one hook serving both doors cannot drift; (c) the autosave boundary's clean server-echo
  reseed (`create-autosave-entity-form.tsx` §5, two-device freshness) ADOPTS the round-tripped value
  into the live controls, so a direct write renders correctly; a dirty form keeps the in-flight edit
  (last-writer-wins — you were editing, your edit outranks the racing reset, Reset stays available).
- **The row chrome** (`setting-teach-row.tsx`): the row wears a NAMED group (`group/setting` — bare
  `group` keys on ANY ancestor `.group:hover` and an outer container would reveal every row at once) and
  a permanently-reserved 2px left rail (`border-l-2`, transparent at rest → `border-primary/60` when
  modified — reservation is what makes the mark shiftless; the flank-anchor lesson) + an `sr-only`
  "Modified from its default" text (the rail itself is paint). The trailing `⋯` (`RowActionsMenu`,
  `Actions for <leaf label>` — #443) sits in a RESERVED slot beside the `i`, `opacity-0` at rest,
  fading in on the row's hover/focus-within (`SETTING_ROW_REVEAL`, a named-group cousin in
  `row-reveal.ts`; `has-[[data-popup-open]]` pins it while the menu is open) and `pointer-coarse:hidden`
  entirely (the rider: touch reaches Reset through About). Items: **Reset to default** (disabled +
  titled while unmodified — a verb only where there is something to do) · **Copy setting id**
  (`group.sub.setting` — the `openConfigTo` address vocabulary, not the wire key) · **Copy link**.
- **The config deep link is MINTED** (Copy link must copy something true): `state/config-link.ts` —
  `formatConfigLink(group, sub?, setting?)` → `/config?to=<group>[.<sub>[.<setting>]]` and
  `parseConfigLink(to)` (validated against `CONFIG_GROUP_IDS`); the `/$section` alias route reads a
  `to` search param when the section is `config`, calls `openConfigTo(...)`, and redirects to `/`
  exactly as the alias already does — the "URL stays pinned at `/`" ruling is preserved (the address
  bar never holds state; the link APPLIES state and lands home). *Rejected:* shipping Copy link without
  a grammar (a copied link that drops the setting is a lying verb) and a real `/config/$group/...`
  route tree (nine routes' worth of surface for a one-shot landing).
- **About's value block** (`config-teacher.tsx`): `ConfigTeachView` gains
  `value: { current, defaultValue, modified, reset } | null` (raw `unknown`s across the state-free
  projection; the teacher formats — booleans as On/Off, scalars as text; enum wire values render as
  their raw spelling, recorded limitation: mapping to Select labels would drag every items table into
  the teacher). Modified ⇒ "Current … · Default …" + the Reset door (the coarse path); unmodified ⇒
  "Using the default — …", no button.
- **The key sweep**: `key` declared on every leaf whose row is a 1:1 `SettingRow` over a user-tier
  claim key (app-shell sizing ×5, reading, effects, background's fit/dim/blur; chat message-style,
  avatars, message-details, message-handling, streaming; library-settings where 1:1). Looks' leaves
  stay unbound (applying a theme is a verb, not a key write).
- **Red-first CT floor:** NEW `tests/client/components/setting-teach-row.ct.tsx` (rest: rail
  transparent, `⋯` opacity 0, row geometry byte-stable across hover — the zero-shift pin measures
  boundingBoxes before/during hover; modified: rail painted + sr-only text; Reset fires the exact
  `{section, patch}` wire; Copy id/link land the exact strings on the clipboard; coarse: the menu
  display-gone) · `config-teacher.ct.tsx` gains the About value arms (modified/unmodified, Reset wire)
  · the partition planted-RED (`key` outside the claim throws) · `config-link` unit test (round-trip +
  refusals) · the touched section CTs re-run.

### 7.8 The seen-not-read rebuilds (owner-ACKED, the §7.6 table graduates to build)

Same aesthetic bar; each control changes, its PATCH does not (red-first pick→patch CTs pin the wire
byte-identical). (a) **`chatStyle`** → preview CARDS on the Looks grammar (a skin is a visual anatomy):
each of the 8 skins renders a mini message-pair preview in its own anatomy, `aria-pressed` current,
picking writes the same `{section:"appearance", patch:{chatStyle,…}}` through the same bound field.
(b) **`density` + `elevation`** → labelled segments (`ToggleGroup`) with ONE live mini-preview panel
that renders a small real-token mock — the preview reads the DRAFT value, not the saved one.
(c) **reading font family** → rows rendered IN the typeface (each option's label wears its own
`font-family`), same Select→segment/list grammar as its section affords. (d) theme-editor token
pickers: untouched. Any of the four that fights its section's anatomy is a stated fork with a
default, never a compromised ship.

**As built (2026-08-30):** (a) the card previews DERIVE their anatomy from `MESSAGE_ROW_SKINS [style].outer/inner` — the transcript's own dispatch table — with labels/glosses off `CHAT_STYLE_ITEMS`;
immersive decorations (echo's portrait, whisper's banner) need a real avatar and stay out of the mini
pair (the gloss carries them). (b) the density preview derives by SELECTOR HOIST: shell.css's compact
token block moved from `.shell-grid[data-density]` to the bare `[data-density]` attribute (custom
properties cascade, so the shell grid and the preview box read the ONE definition — no mirrored number;
`CARD_EMBEDDABLE_THEME_KEYS` still excludes density, so no card path can stamp the attribute). The
**elevation** control is ILLUSTRATED CARDS, ruled (owner, 2026-08-30, two refinements): elevation's
meaning is *hairlines vanish across the whole chrome horizon* — a structural rewrite across seven
anatomy selectors (shell.css:84-112) — so a faithful mini-PREVIEW is impossible (a nested box has no
seams to lose, and shrinking the shell would misrepresent). **The general rule this minted: a control
whose outcome is seen owes a VISUAL; when a faithful preview is impossible, the answer is an honest
DIAGRAM, never a bare label.** A preview claims to BE the surface; an illustration depicts the
DIFFERENCE between the options and is honest precisely because it is obviously a diagram — and it is
ALLOWED TO EXAGGERATE (a truthful 1px seam reads as nothing at diagram size; an under-drawn diagram
teaches nothing). The KIND of difference stays true (flat = seams kept; ramp = a seamless brightness
ladder; glow = floating islands), the AMOUNT is scaled for instant reading; every colour/hairline/
shadow derives from the shell's own tokens, and the diagram map is TOTAL over the option union (a new
member is a tsc failure until depicted). This CORRECTS the §7.6 table's recommendation, which lumped
the pair as "segment + live mini-preview": density earns a LIVE preview (custom properties cascade —
the hoist), elevation earns an ILLUSTRATION — both visual, by different means. (c) built as a
sealed-`Select` widening
(`SelectOption.labelStyle` — the HintTrigger-onClick precedent) with `{fontFamily: value}` derived from
the option's own value; `Select.Value` mirrors `ItemText`, so the closed trigger shows the chosen face
too, deliberately. A new bound `SegmentField` (single-select ToggleGroup in a Field; empty-pick refused)
joins the form kit for (b).
Design landed at `docs/design/config-revamp-design.md` (draft, 2026-08-30). Premise repaired: Settings is the `settings` MODAL on `rail.end`, not a section — `SECTION_IDS` stays at ten; what retires is the modal, its gear, `settingsCategory`/`openSettingsTo`. The design: ONE closed config-group registry (`CONFIG_GROUP_IDS`, four shelves User/App/Collections/Extensions; body arms `sections` | `collection` | `placeholder` — `surface` retired by §6.8) that the nine settings panes, the three collections, the persona surface and the Plugins screen all register through, with the D120 section seam and key partition untouched and plugins riding the Extensions group's data rows; a LIST of shelves + group bands with the shipped `settings-scroll-spy.ts` re-homed as the one spy; ONE search index (groups · subcategories · leaves · collection members · persona names) over the sealed fuzzy-search hook with VS Code-style `@modified`/`@shelf:`/`@in:`/`@ext:`/`@advanced` tokens, in-place `HighlightedText` hits in both panes, a ⌘K `CommandPaletteSource`, and `openConfigTo(group, sub?, setting?)` replacing `openSettingsTo` + `goToCollection` (17 call sites); a dense CONTENT row frame (modified rail · gloss · control · reset/copy menu · scope chip); the CONTEXT pane as the TEACHER on the #860 bracket via `defineContextTabs<ConfigContextState>` (About · Applies · Learn) fed by a `configFocus` seam and per-leaf `SettingTeach` data; the rail persona slot as switcher · identity · log out. Zero new `@orb/ui` primitives; four client composites with CTs named. Nine owner forks with recommendations (closed tuple for collections; keep the Theme picker; retire the account modal; defer tags-as-facet; rename the label "Settings"). Sequence: S1 registry+surface and S2 search are dispatchable now; S3 teacher waits for #860; S4 rail slot after S1.

## 8. The COLLECTIONS species contract and the landing redesign (#925 + #1043, as built 2026-09-02)

Owner rulings of 2026-09-02, recorded on #925 in four comments (the later ones supersede the earlier where
they differ) and executed in lane `cb-collections`. This section is their one durable home; the code and its
file headers carry the per-site reasoning.

### 8.1 The ruling set, compressed

1. **SPECIES — THE FENCE IS RETIRED (amended 2026-09-05, #1714; see §8.1a).** As ruled on 2026-09-02:
   collections (Tags · Regex scripts · World Info · Rosters) are a genuinely distinct species from settings
   groups and that distinctness is legitimate — the bar is that **they must WORK**: no dead ends, no
   capability lies. An earlier comment's "the axis is CONSISTENCY, collections are config sections with a
   member list" was retracted by the owner minutes later and is NOT law. **The "must WORK" bar stands. The
   "distinct species → therefore do not converge" half no longer does** — read §8.1a before citing this
   clause against a convergence.
2. **LANDING.** The CONTENT-side "Not built yet" band DIES. Feature status belongs to the LIST: a genuinely
   unbuilt group is a GREYED but clickable row whose activation renders the coming-soon body in CONTENT.
   No parallel status region.
3. **CLASSIFICATION (#1043).** Start from re-derived, per-collection build receipts. Built-but-empty is a
   LIVE row with an honest empty state; only a genuinely unbuilt feature greys.
4. **ARRIVAL.** Config opens SHOWING SETTINGS — default-select the first group, sections expanded when the
   pane has room — instead of a landing gauntlet. The owner's lens is CLICK COUNT.

### 8.1a The species fence is RETIRED — the ruling survives, its INPUT changed (owner, 2026-09-05, #1714)

**Owner word, verbatim (Nate, 2026-09-05 \~15:45Z, mid-fold of #1169):** *"also yes i changed my stance on
collections in case you or anyone is getting hung up on it lol my most recent ruling is the preference."*
The most recent ruling is #1169's **"receipt + full convergence"** (2026-09-05 \~13:50Z): a cohort-anatomy
census across all four LIST panes, then config rows adopt the shared machinery wherever the collections
species does not forbid it. This clause is what "does not forbid it" now means.

**What SURVIVES — all four #925 rulings, as BUILT behaviour, untouched by this amendment:**

1. The **must-WORK bar** (ruling 1's substance): no dead ends, no capability lies. A zero-member band is
   still a control, a bulk toggle still follows its members.
2. The **landing** (ruling 2): feature status is the LIST's; the CONTENT-side "Not built yet" band stays
   dead; `CONFIG_UNBUILT_MARKER` keeps its one home.
3. The **classification** (ruling 3): built-but-empty is a LIVE row with an honest empty state.
4. The **arrival default** (ruling 4): first group active on arrival, sections expanded, never on a phone —
   and the **select-and-disclose ENTER** contract on a collection band (§8.3 row 1), which #1714 preserves
   by name.

**What is RETIRED — one inference, not a ruling.** "Collections are a distinct species" was being read as
"therefore a divergence between the two arms needs no justification of its own", and it was cited that way:
`docs/reviews/misc/2026-09-05-config-list-pane-divergence.md` §3a rested five LIST-pane verdicts on it. That
inference is gone. **A divergence is now legitimate only where a STRUCTURAL reason holds and is stated** —
what the thing IS, what its click DOES, what data it actually has. "It is a different species" is no longer
an answer; it is a restatement of the question.

**The re-judgment is done and its receipts are in the review doc §8** (#1714, lane cb-config-list, on this
tree at `9629e0b96`). Every verdict that had cited the species survived on a structural reason and none was
converged away — which is the outcome the amendment was for: the reasons are now load-bearing rather than
inherited. The §8.3 table below is re-read the same way: each row's "Verdict" column is a structural claim
about members-vs-body, and none of them says "species" as its reason.

### 8.1b The members left the LIST (owner ruling 2026-09-05, #1725) — the ruling survives, its INPUT changed

**Owner word, verbatim (Nate, \~16:40Z):** *"k but tag list under in list is kinda a no go that needs to move
into content when clicking onto tags, same thing for regex and world info is what im trying to say right now
its mixed and looks weird"* · seconds later: *"so that means content will need to be redesigned for those
interfaces to properly be consistent"* · on the approved canvas, \~18:05Z: *"redesign approved it can be built
to spec but must match the mockups"*.

The spec is [`mocks/config-collections/DESIGN.md`](mocks/config-collections/DESIGN.md) (canvas source +
22 true-size renders + the two v1–v2 reviews, all beside it). This section is the LANDING contract's home,
so what the ruling did to §8.1's four rulings is recorded here and nowhere else:

| #925 ruling | verdict under #1725 |
| - | - |
| 1 · must-WORK | INTACT. No dead ends, no capability lies — every control that left the band arrived in the library's control row rather than vanishing. |
| 2 · landing / feature status is the LIST's | INTACT. The greyed unbuilt band still opens a coming-soon CONTENT body. |
| 3 · classification | INTACT. Built-but-empty is a live row with an honest empty state — now drawn in CONTENT (F5 arm A, board 07). |
| 4 · arrival default | INTACT, and it now has more to land on. |
| **ENTER (select-and-disclose)** | **the ruling survives, its INPUT changed.** The owner ruled WHERE the members live. SELECT is untouched — one act, `selectConfigGroup`, never a select-then-toggle pair. DISCLOSE is RETIRED: there is nothing in the LIST to unfold, so the band carries no `aria-expanded` and no second-click fold. |

Two more clauses this section owned are amended by the same ruling, both recorded at their code homes:
`COLLECTION_LARGE_GROUP`'s FILTER half (the gate is gone — the library's pane makes the box always worth
drawing) and `CONFIG_COLLECTION_LANDING.hint` (deleted with its reader: it pointed AT the LIST, and the
members are on the pane the sentence was written on).

**Commit 3 (the control row, the window's bound, and the drill header).** Commit 1 moved the rows and
commit 2 built the band; this one finished DESIGN.md §3.2/§3.4 and closed the fork commit 1 recorded:

- **`COLLECTION_WINDOW_MAX_HEIGHT` is DELETED, by RE-BIND rather than by removal (§5.4).** The constant
  could not simply go: `@orb/ui/virtual-list` throws at mount on an unbounded scroll box
  (`assertBoundedScrollHeight`), so deleting the cap without giving the window another bound would have
  traded a wrong height for a crash. The bound is CONTENT's own `overflow-y-auto` box now, reached by flex —
  the landing is `min-h-0 flex-1` in the pane, each library's windowed arm is `min-h-0 flex-1` in the
  landing (`character-library-body.tsx`'s chain). The window is the pane's height at every width instead of
  384px at all of them, and the row past the old fold is reachable. Receipt: the width matrix in
  `tests/client/features/config/components/config-collection-landing.ct.tsx` at 752/1440/1920 over a 60-row
  library, plus the phone snap.
- **Two new `CollectionContribution` fields, both optional hooks under the #1203 keying law.** `sort` (the
  library's reading order — the host draws the Select, the contribution owns the mode and the comparator)
  and `actions` (library-level verbs, drawn in the control row's overflow beside `importFile`; a
  contribution declaring neither gets NO kebab). Tags declare both: the sort moved out of
  `tag-collection-rows.tsx`, and "Prune unused tags" moved out of it into the kebab while its CONFIRM
  stayed with the rows, because the unused count and the cascade copy are the rows' knowledge.
- **The order hint moved into the Manual option's own `description`.** The 2026-08-03 P1/P2 rulings survive
  verbatim; board 02 draws no line beside the sort, and `SelectOption.description` is the primitive's own
  slot for copy that must survive the popup opening over it.
- **The drill header (§3.4)** — host-drawn, `← Back to <library>`, with NO lifecycle chrome (D121(D),
  \#271: Delete stays on the row's kebab). TWO NAMED DELTAS against boards 03/05/06, and they are the same
  deferred decision: the member's NAME and the member's own verbs (regex "Test against a sample", world info
  "Edit details · Backfill · New entry", rosters "Start chat") stay on each member surface's own header one
  row below, not on this row. The name is the load-bearing half — a host heading over four surfaces that
  each already render the member's name as their `h2` prints it TWICE, measured as a strict-mode violation
  that took `config-content-surface.ct` and `config-list-surface.ct` red. The merge (the member surface
  owning the whole drill row through the `detail` it already renders) is the next commit's; the pin that
  keeps the name single meanwhile is in the landing CT.

### 8.2 The classification receipt (ruling 3, re-derived against the tree)

`ast-grep -p 'placeholder: true'` over `packages/client/src`, both languages (tsx `scannedFileCount=668`,
ts `scannedFileCount=587`), matches ONLY the type declaration (`state/config-group-registry.ts`) and
comments: **no group definition carries the placeholder arm.** `automation` was the last one and became a
real surface at `cb8026bfc`. All four collections are BUILT — each declares a real tRPC list read, a
`CollectionContribution` with a mounted member editor, a create verb and a context arm
(`features/{tag,regex,world-info,roster-preset}/lib/*-group.tsx`). **So the greyed arm has ZERO occupants on
today's tree**: the band dies and nothing replaces it in the LIST. The arm is still built, because
`{ placeholder: true }` is live declared intent with a synthetic CT subject (`placeholderConfigGroups`), and
it is pinned there — a mechanism waiting for its first real occupant, never a speculative feature.

### 8.3 The species contract (ruling 1 — this row's design call)

A collection's CONTENT is a MEMBER; a settings group's CONTENT is its own body. Everything below follows
from that one difference, and each divergence from the settings species is marked as legitimate or as drift.

| Question | The collection's answer | Verdict |
| - | - | - |
| What does a band's click mean? | **Enter the library** when it is not the current location (select + disclose in one act, CONTENT lands on the library's own landing); **toggle its rows** once it already is. | Species-legitimate divergence: a settings group's active band cannot collapse itself because its rows ARE the map of the pane beside it; a library's rows are its contents, and folding contents away is a thing a reader does. |
| Where do members live? | In the LIST, under the band, owner-rendered — unchanged (C-4). | Same as a settings group's section rows: not a divergence. |
| How does the editor open? | Selecting a member; the editor mounts in CONTENT (C-7), and the member is what PUSHES on a phone. | Legitimate: `isPushingGroup` stays false for the whole species. |
| What is "you are here"? | The band carries `aria-current` while no member of the collection is open; once one is, the member's row is the location. | The one-current-per-location rule, applied to a species whose children are members. |
| What does an empty library show? | Its own empty state (`emptyText` + the create verb) in CONTENT — #1099 F5, unchanged. | Legitimate. |
| What does a populated library show with no member open? | Its own LANDING: the library's glance (name · blurb · the ranked preview wall) + one host sentence about where the members are + the create verb. | New. It replaces a fall-through to the four-library welcome, which named every library except the one the reader had just opened. |

The one anatomy the welcome's launcher and the CONTENT landing share is
`features/config/components/config-library-glance.tsx` — two hosts, one wall, no second spelling.

**The seam this section left for #1169 is CLOSED (2026-09-05, #1714).** Every row above was priced against
the tree with the species fence retired (§8.1a) and all six held on their structural reason — members vs a
body, a live census vs a compile-time registry, a click that ENTERS vs one that ACTIVATES. Two more in-pane
divergences the fence had made invisible were priced at the same time and also held, both by TYPE rather
than by taste: a collection band can carry no **Modified** mark because `useConfigModified` resolves a
section's `owns` `SettingsKeyClaim` and a collection declares none, and it can carry no **Not built yet**
mark because `ConfigGroupBody` is a three-arm union in which `collection` and `{ placeholder: true }` are
mutually exclusive. Receipts: review doc §8.

### 8.4 The landing redesign (ruling 2) and what it deleted

- The welcome's `<Section kicker="Not built yet">` band is gone, and with it the whole **lead/rail column
  split** — the split existed only to segregate "not built" from "built". `ConfigWelcome` became ONE
  auto-fit grid, one slot per collection in canonical `(shelf, order, id)` order; population changed what
  a slot SAID, never where the surface filed it. (That grid then retired outright — §8.6.)
- Both ruled anatomies survive as the slot's two ARMS: populated sheds the count and the create verb and
  pays for its promotion with `preview` + a door (2026-08-08 C7 arm 2); empty keeps count(0) + create and no
  box (2026-08-03 · CD1).
- The `data-config-built` / `data-config-unbuilt` markers are now `data-config-populated` /
  `data-config-empty` — the vocabulary fix #1043 is actually about: those attributes report the READER's
  library, and the app's own readiness is the LIST's word alone (`CONFIG_UNBUILT_MARKER`, one home, two
  surfaces: the greyed row and the placeholder body's chip).
- **What did NOT die:** the settling census (`HIDE_WHILE_SETTLING` + the zero-box `data-config-settling`
  marker). Its input changed but did not disappear — a slot whose count lands late still swaps its arm, and
  the populated arm is taller than the invitation it replaces. The CT that measures the browser's own
  layout-shift score across the counts landing stays green at 0.
- CD3's single focal moved from `first:` to a sibling verdict (`[[data-config-populated]~&]`): with one
  mixed grid the first CHILD may be an empty slot, which draws no card, so a `first:`-gated halo would have
  belonged to nobody.

### 8.5 The arrival default (ruling 4) and the click-cost receipt

`useConfigArrivalDefault` (`features/config/surfaces/config-list-surface.tsx`) calls the SAME
`onSelectGroup` a band click calls, once per mount, in a layout effect (before paint), for the first
`when`-visible group in the LIST's canonical order — Appearance today, derived and never named.

| Cold arrival at `/config` | Clicks to see a setting | Notes |
| - | - | - |
| Before this row (desktop) | **1** | The launcher landing (`ConfigWelcome`) held CONTENT; one band click landed the group AND its first section — the owner's "category then section" was measured against the pre-`fd85639f8` surface; the nav fold had already collapsed the second click. |
| After (desktop) | **0** | The first group is active in the first painted frame; its band is expanded (the ACTIVE-group rule, unchanged) and its first section row is `aria-current`. |
| After (phone) | unchanged | The default does NOT fire on a mobile viewport: an active pushing group makes `hasSelection()` true and the one-shell rule would push CONTENT over the map the reader arrived for. **True since #1741 — see the repair below; the row described the code's intent for three eras while the phone did the opposite.** |

**TRUTH REPAIR (#1741, 2026-09-05) — the phone row above was a WISH, not a behaviour, and the ruling is
untouched: its INPUT changed.** The guard was written and shipped exactly as stated, and it was inert on
every phone. `useMobileViewport()` reads the shell's PUBLISHED regime mirror in `#state` (a feature may not
read matchMedia — `no-raw-matchmedia`), and `use-shell-layout.ts` published that mirror only from a PASSIVE
effect. A passive effect runs after every layout effect in the same commit's subtree, and `/config` puts the
LIST in the shell's FIRST commit (`router.tsx` sets the section in `beforeLoad`), so the arrival default's
`useLayoutEffect` read the store's pre-mount `false` DEFAULT, took the desktop arm, and selected a group —
after which the one-shell rule correctly pushed CONTENT over the LIST and the whole map was unreachable
without a panel drive. The fix is at the publisher: the regime is now SEEDED during `useShellLayout`'s own
render, so no reader in the shell's first commit ever sees the pre-mount default. Every other `#state`
viewport reader was wrong for one frame by the same mechanism; only this one latched. The pin is the
cold-arrival test in `tests/client/features/config/lib/config-section.ct.tsx`, which is red on the old
publisher.

Three conditions, each a real state: once per mount (a reader who backs out to the landing STAYS there —
`clearActiveConfigGroup` is a door they walked through), never when a member or a deep-linked group is
already active, never on a phone. **"Sections expanded when the pane has room" needed no new rule** — the
ACTIVE group has always been the expanded one, and every sibling keeps the 2026-08-02 collapsed-by-default
posture (an expanded 400-row library would bury the map).

Two consequences worth knowing: CONTENT no longer takes the section's arrival focus for an active GROUP
(only an open MEMBER means the reader asked for the pane — otherwise the arrival default would re-create the
2026-08-19 defect by a different route), and every config host mount now exercises the first group's
section reads, which is why the CT stubs feed them.

### 8.6 The retirement and the library-level landing (#1210 + #1209 + #1213, as built 2026-09-02)

Two owner rulings on the rows, executed in the same lane and the same commit as each other because they are
one story: what the CONTENT pane says about a library.

**#1210 — `ConfigWelcome` is RETIRED.** The spot lens found it had no reachable door on any viewport: the
arrival default (§8.5) takes CONTENT before the first paint, every re-entry re-lands on the first group, the
only `clearActiveConfigGroup` caller sits behind `hasSelection()` (false for a collection with no member
open), and a phone never paints CONTENT unpushed by design. The component and its CT are deleted; the
NOTHING-active arm is now the section's own two-line teaching frame (`data-slot="config-teaching-frame"`),
whose copy is `CONFIG_WELCOME` in `config-copy.ts` — still shared with the phone's LIST header, which is
untouched. What died with it: the launcher grid, the two population arms, the CD3 sibling-focal treatment
and the settling census, plus six CTs that pinned them. What survives: `config-library-glance.tsx` (name +
blurb), because the landing draws it at every arm.

Vocabulary note (orchestrator addendum, and the reason it is worth a line): this surface was informally
called "the Hearth" in headers and reviews. That word already names the SEED THEME and the HOME lead-column
region, and the config borrowing was a third collision with no disambiguation row in the vocabulary map — it
dies with the surface. Also corrected here: `ConfigWelcome` was **not** program #102's owner-picked variant
(that is the home hearth region); the earlier attribution in this doc's §8.4 and in the file header was
wrong and is not carried into the retirement record.

**#1209 — the populated landing states LIBRARY-LEVEL FACTS.** Measured live: with Tags active, CONTENT's
only interactive element was "New tag"; twelve inert chips restated the twelve rows the LIST was already
showing in the same order, and "+16 more" named sixteen members reachable from nowhere. The `preview` seam
that fed that wall is RETIRED with it (contract field, the four `use*Preview` hooks, `CollectionPreviewEntry`
and `COLLECTION_PREVIEW_LIMIT` — a dead field left declared is the half-migration the constitution bans), and
`CollectionInsight` takes its place: `label · value · optional door`, declared per contribution, drawn blind
by the host in one grammar. A fact is DATA unless it is about ONE member, and then its door opens that
member's editor — which is the acceptance bar stated as an assertion in the CT (the pane's control count is
exactly the fact doors plus the create verb; zero affordance-shaped text).

What the four libraries state today, each from the SAME cached list read its census and rows already use —
no new server verb was needed for any of them:

| Library | Facts | Door |
| - | - | - |
| Tags | "Labelling nothing" (N of M) · "In use" | opens the first unused tag |
| Regex scripts | "Switched off" (N of M) · "Last edited" | opens that script |
| World Info | "Fires in every chat" · "Attached to nothing" (N of M) | opens that book |
| Rosters | "Carry room rules" (N of M) · "Last saved" | opens that roster |

**PRICED GAP, not stubbed (the brief's rule):** the ruling also named IMPORT and EXPORT doors on the landing.
Import is already DATA on the seam and the host draws it on the group BAND (D121-D `band=Import ·
kebab=Export`), so a second landing copy would be a third home for one verb — refused, and stated here rather
than smuggled. A LIBRARY-level export ("export all N scripts") has no server verb on this tree: it is a new
bulk-export contract per collection, which is a domain change, not a landing change. Neither is stubbed.

**#1213 — the EMPTY landing teaches.** The zero arm rendered `emptyText` alone, so the reader with nothing —
the first-timer the empty state exists for — was the only one not told what the library is FOR. It now
renders the group's blurb and the collection's own empty sentence above the create verb.

### 8.7 The five mechanicals (#1212 #1213 #1214 #1217 #1218, as built 2026-09-02)

Each from the same spot lens, each pinned in `tests/client/features/config/surfaces/config-list-surface.ct.tsx`
unless stated.

- **#1212 · the BULK toggle follows the MEMBERS.** Regex at count 0 drew "Select scripts" — enabled,
  focusable, over a library with nothing to select. The toggle now renders only where a collection declares
  a bulk mode AND has members (a settling count draws nothing either). **PRICED GAP:** the row's other
  direction — "Tags at 28 exposes none" — is not a host fix: `bulkSelect` is a DATA declaration and the
  contribution owns everything behind it (the selection bar, the checkbox rows, the batch verbs). Giving
  tags a bulk mode is a tag-feature build, not a config-host change, and it is not stubbed here.
- **#1213 · the empty landing teaches** (§8.6).
- **#1214 · the a11y trio.** (1) A modified band announced "AppearanceModified" — the same welding the
  collection band's count fix solved, so the same fix: an explicit `aria-label` stated ONLY when a mark
  exists, separator a SPACE (WCAG 2.5.3 Label in Name). (2) The shelf's Modified mark was a second kicker
  identical in step, tracking and ink to the shelf's own name; it is a `Badge` now — the house's state
  chrome, with its own box and its own accessible text, and the shelf's NAME is the kicker alone.
  (3) **PARTLY REFUTED:** the row says the expanded rows have "no aria-controls/owned container" — the
  `aria-controls` relation and a real `div#bodyId` wrapper have existed on BOTH band species since #978.
  What was true is that the wrapper is a bare `div`, which is generic and therefore transparent to AT, so
  the rows still announced as siblings. The row Stack now carries `role="group"` + `aria-labelledby` the
  band — the anatomy the row itself cites as proof nesting is representable — rather than the tree/treeitem
  promotion, which would re-spell the whole LIST's semantics for one relation.
- **#1217 · the auto-opened arrival group folds** when the location moves on. Auto-open is not user intent:
  the disclosure store is a memory of what the READER opened (C-12), and the arrival default writes into it
  on nobody's behalf. It closes exactly one group — the one it opened, by id — and a group the reader opened
  themselves is untouched (both arms pinned).
- **#1218 · the arrival focus target is a visible control.** The Tab-walk receipt: focus landed on the LIST's
  own `tabIndex={-1}` scroller, `:focus-visible` true over `outline: none`. **RULING FORK, stated:** the row
  offers "paint a ring" as one arm, but "a programmatic-only focus target must NOT paint a ring" is a
  recorded rule for every section surface and the shell modal's body (a ring on a non-tab-stop is a lie about
  tabbability). So the TARGET moved instead: the ACTIVE GROUP'S BAND — a real control, already a tab stop,
  inside the LIST (the 2026-08-19 "the map owns the section's arrival focus" ruling, preserved), announcing
  exactly where the reader is. The row's own second arm (the search box) was built first and REVERTED with a
  receipt: `CommandInput` keeps an internal ref to correct cmdk's `aria-expanded`, a caller `ref` replaces
  it, and the box then claims an expanded listbox that does not exist (measured as a red in
  `config-search-input.ct.tsx`). Fixing that needs a ref-merge inside a sealed `@orb/ui` primitive, which is
  not this lane's to change.
