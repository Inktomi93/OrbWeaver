---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: rpg
---

# RPG card archive follow-ups: time chip form, landmark labels, quest link name

## What

Side-eye of the RPG scene card archive after items 1261 and 1262. The turn chip in `packages/client/src/features/rpg/components/rpg-turn-ref.tsx` renders the full date and time (`Oct 23, 2026, 09:02 PM`) as a 132 px nowrap `span`, so a long card title truncates at 430 px, three cards from one minute show identical chips, and the transcript stamps the same message as `09:02 PM`, so one fact has two formats; the chip is a `span` rather than `time` with `dateTime`, and its `title` still shows the raw message id. Only the Cards section is a landmark; the other Scene sections are headings alone. The quest link's name (`Open <quest> in Quests`, `rpg-scene-tab.tsx:306`) promises a specific quest but the Quests tab opens with nothing highlighted, and every quest row calls the same reveal, so adjacent 44 px tap areas overlap harmlessly today and become a defect the day each row opens its own quest.

## Why

The chip exists to tell cards apart and to match the transcript; a landmark list that shows one section hides the rest; a link name that promises a target the tab does not honour misleads.

## Done when

The chip uses the transcript's short form (time only for today, short date otherwise) from the kit time lib, renders as `time` with `dateTime`, and its hover text names the turn, not the id; the Scene sections either all carry a landmark with `aria-labelledby` on their heading or none do, with the ruling stated in the kicker header; the quest link either opens the named quest highlighted or drops the quest name from its accessible name; CTs assert the chip format and the landmark rule at phone width.

## Evidence

- Chip: `rpg-turn-ref.tsx` renders a timed ref as a `time` with `dateTime`. `lib/turn-stamp.ts` stamps it with the kit's `formatTime` for a turn from today, `formatMonthDay` plus `formatTime` for an older turn in the current year, and `formatDateTime` for a turn from another year, so two cards from one earlier day still differ and a year is never implied. Hover text is `Told <formatDateTime>`, never the id. The card row's accessible name carries the same stamp, because its `aria-label` replaces the chip's content. The id-only ref (veiled ledger) keeps the id tail.
- Landmark ruling: Kicker sections are headings and the tab panel is the landmark. The context bracket already names each tab panel a region, so section regions nested inside `region "Scene"`, made up half the page's landmarks, and carried names that change with the game ("Cards — 4") or mean nothing in a list ("Just now"). Stated in the `rpg-scene-tab.tsx` and `rpg-kicker.tsx` headers. The archive renders its Kicker outside the boundary, so the heading survives the error arm (which must stay `QueryErrorState`-rooted) and the count moved to a `N total` line in the settled arm.
- Quest link: the Quests tab opens with nothing highlighted (`revealContextPanel(tab)` takes no quest), so the row drops its `aria-label` and is named by its visible goal text. A long goal name is clipped (`min-w-0 truncate` in `GoalLine`) instead of the button's `whitespace-nowrap` pushing the panel sideways.
- CT: `scene-cards.ct.tsx` and `scene-panel.ct.tsx` (the whole Scene tab at 430 on a game seeded through the product verbs) failed on the previous source (regions present, no stamp, a long goal overflowing) and pass now; `pnpm test:ct tests/client/features/rpg` 19 passed.
- Not run: `tests/e2e/rpg-lite-loop.spec.ts` was edited for the goal button name.
