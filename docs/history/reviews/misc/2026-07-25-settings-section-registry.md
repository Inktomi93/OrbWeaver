---
kind: history
status: archived
updated: 2026-08-01
---

# Settings-section contribution seam — design (Phase B, stint 1)

> Lane: Phase B settings-surface. Mandate (owner, final): mint the settings-SECTION registry BEFORE any
> pane work — the pain-point §7 cure. This is the granularity BELOW panes (§8's `SettingsPaneDefinition`
> already exists). A domain contributes its settings SECTION descriptor; the settings surface derives —
> "like defineContextTabs". Every Phase B item then lands AS A CONTRIBUTION, never more god-feature growth.

## The pain being cured (§7)

`client/features/settings` is a god-feature: adding a domain's settings adds a **surface + form + hook +
mutation** to that ONE feature every time (`use-*-form`/`use-*-mutations`/`*-settings-surface` all pile
up under `features/settings/`). The pane-LEVEL registry (§8) fixed the CATEGORY granularity — a feature
owns a whole PANE (personas→persona, connections→credentials, …). But a domain that only needs ONE
SECTION inside an existing pane (memory's master switch, world-info's scan knobs) had no seam: its choices
were "grow settings" or "mint a whole new pane for two fields". This seam is the missing granularity.

## The shape — a contributor registry, NOT a total registry

**Chosen: an open-ended `ContributorRegistry<SettingsSectionContribution>` per host pane, assembled empty
at the door, consumed at a named pane anchor.** This is a STRUCTURAL MIRROR of the character-detail
`editor-sections` seam (`CharacterDetailContribution` + `resolveDetailSections`, §6c/M8) — the in-tree
precedent the mandate names. NOT `defineContextTabs` verbatim (that mint solves an S-variance existential
the settings case doesn't have — a settings section renders unconditionally into a scrolling pane, no
per-section projection to erase), but the SAME cross-feature contribution DISCIPLINE.

### Why a contributor registry, not a total one (the load-bearing fork)

§A of the dispatch: "if your design creates a NEW TOTAL registry over EXISTING vocabulary, migrating
existing sections onto it must complete in the SAME effort — leaving the old structure beside the new is a
banned escape hatch." A total `Record<SettingsSectionId, Def>` over a new section-id tuple would force
migrating EVERY existing pane's in-body `<Section>`s (chat-behavior's message-handling + streaming,
appearance's dozen sections, …) onto it in this stint — intractable and unwarranted. A **contributor**
registry has NO fixed vocabulary (§5 `createContributorRegistry`): it is purely ADDITIVE. Existing panes
keep their hand-authored `<Section>` bodies untouched; a contribution APPENDS at the pane's anchor. So the
"migrate-or-it's-rot" clause never triggers, and the seam is adopted naturally (mirrors `editor-sections`:
zero contributions ⇒ byte-identical to today's pane). This is the tractable, precedent-matching choice.

### Home + walls

| Piece | Home | Wall |
| - | - | - |
| `SettingsSectionContribution` (the union), `SETTINGS_SECTION_ANCHORS` tuple, `resolveSettingsSections` | `packages/client/src/lib/registry-contracts.ts` (tier 4) | `client-lib-floor` (lib imports nothing in-client); mirrors where `CharacterDetailContribution` lives |
| the per-anchor `ContributorRegistry` assembly | `main.tsx` ONLY | G8 `registry-assembly-at-door-only` (`createContributorRegistry(` outside the door is RED) |
| each contribution DEFINITION | its OWNING feature's `lib/*-settings-section.tsx`, exported on the front door | `client-features-no-cross` (the host pane never imports the contributor; the door imports both — one-directional flow) |
| the host pane consuming its registry | the pane's surface, threaded by PROP from the pane def (mirrors `makeChatsSection`/`CharacterEditorSurface`'s `detailContributors` prop) | tsc |

### The anchor vocabulary

`SETTINGS_SECTION_ANCHORS = ["chat-behavior"] as const` — a closed tuple (an unlisted anchor is
unspellable), the `CHARACTER_DETAIL_ANCHORS` posture. Today ONE anchor: the **chat-behavior pane** body —
memory's master switch and world-info's per-chat scan knobs are both chat-generation behaviors, so they
land as contributed sections at the bottom of the chat-behavior pane. A future pane that wants
contributions adds one tuple entry + one arm to the discriminated union (the `ChatSurfaceContribution`
growth shape). The union is discriminated by `anchor` so a second anchor carrying a different projection
narrows cleanly with zero casts.

### The contribution shape

```ts
type SettingsSectionContribution = {
  readonly id: string;                    // registry key + React key (dup ⇒ throws at door construction)
  readonly anchor: "chat-behavior";       // the ONE anchor today (discriminant)
  readonly nav: SettingsSubcategory;      // the pane's left-nav + search-index entry (derived, not re-spelled)
  readonly body: () => ReactNode;         // the contributed <Section>, anchored via settingsAnchorId(pane, nav.id)
};
```

`nav` reuses the EXISTING `SettingsSubcategory` shape (`state/settings-pane-registry.ts`) so a contributed
section is a first-class nav/search citizen with ZERO new vocabulary — the host pane def MERGES its own
`subcategories` with the contributed navs (derive, don't re-declare). `body` renders the section keyed to
the shared `settingsAnchorId(categoryId, nav.id)` so scroll-spy + fuzzy-search jump work unchanged.

## What it kills / prevents

- Kills the god-feature growth vector for SECTIONS: memory + worldInfo land in their OWNING features
  (`features/chat` owns memory's master switch; `features/world-info` owns the scan knobs), never in
  `features/settings`.
- Prevents the next "one-section domain" from either bloating settings or minting a vanity pane.
- Structurally one-directional: the chat-behavior pane (settings-owned) consumes a blind registry; the
  contributors never import it; the door wires both — `client-features-no-cross` enforces it for free.

## Stint-1 contributions landed on the seam

- **① memory.enabled** — `features/chat/lib/memory-settings-section.tsx` (owner: the chat/memory
  subsystem). The per-user master switch (`UserSettings.memory.enabled`, live-read every turn, previously
  unreachable). Writes via `updateUserSettingsSection({ section: "memory", … })` — the audit's #1 finding.
- **② worldInfo** — `features/world-info/lib/world-info-settings-section.tsx` (owner: world-info).
  scanDepth + tokenBudget, read-live via ForeignInputs, previously UI-less. Writes
  `section: "worldInfo"`.

Both prune their `knob-wire-coverage` DEFERRED entries (`B:memory`, `B:worldInfo`) — the `section: "…"`
literal the surface emits satisfies arm B's write-path predicate; a stale entry then goes STALE-RED.
