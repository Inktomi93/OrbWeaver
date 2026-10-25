---
kind: work
status: open
updated: 2026-10-24
priority: P1
area: ui
plan: css-system
---

# UI primitives for the feature className drain

## What

The 402 sites `orb/feature-classname-layout-only` and `orb/no-built-class-string` report (exact rows: `docs/plans/css-system/feature-classname-sites.md`) need primitive props that do not exist yet. This item builds them; items 1334–1336 and 1338 migrate the sites onto them.

## Owner rulings

2026-10-24:

- A bordered, rounded, filled Row or Stack is a **Card**: add the missing Card shapes (inset/outline row, nested well) as Card variants; no new surface vocabulary.
- Text colour by meaning is a **tone**: extend Text `tone` with `info`, `accolade`, `speaker`, `dialogue`, `narration`.
- Pointer visibility is a **primitive prop**: `hiddenAt="coarse"|"fine"` and `srOnlyAt="coarse"` on Text, Row, Stack and Button, a reveal prop on ListRow/Row for hover-reveal actions, and touch-floor props replacing the `*_AT_COARSE` constants.
- Link-styled buttons use a Button **`intent="link"`** (the Link primitive where it navigates); line-through is a Text **`strike`** boolean.
- Also needed from the site census: Icon `tone` (item 1334), an Icon shadow arm (`MESSAGE_ACTION_ICON_CLASS`), a numeric prop on `TrackerValue`, and the datum and code voices (item 1338).

## Done when

Every prop above exists in `@orb/ui` with a CT per new variant, the token or recipe it paints from, and law text in UI-Density-Law or ui-package-design naming it; no feature site is migrated in this item.

## Evidence

Filled at landing: what ran and where its output is.
