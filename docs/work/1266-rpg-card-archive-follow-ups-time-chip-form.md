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

- Chip: `rpg-turn-ref.tsx` stamps a timed ref with the transcript's `timeLib.formatTime` for a turn from today and `timeLib.formatDate` otherwise, as a `time` with `dateTime`; its hover text names the turn by its instant. The id-only ref (veiled ledger) keeps the id tail.
- Landmark ruling: every Scene section headed by a `Kicker` is a `role="region"` named by `aria-labelledby` on that heading; ruling stated in `rpg-kicker.tsx`. The card archive keeps `aria-label` as the name for its error arm, which renders no heading.
- Quest link: the Quests tab opens with nothing highlighted (`revealContextPanel(tab)` takes no quest), so the row drops its `aria-label` and is named by its visible goal text.
- CT: `scene-cards.ct.tsx` phone-width tests failed on the old source (no `time` chip, region named `Cards` instead of its heading) and pass on the new; `pnpm test:ct tests/client/features/rpg` 17 passed.
- `scene-regions.ct.tsx` mounts the whole Scene tab (`RpgContextTabStory`) at phone width on a game seeded through the product verbs (on-stage and offstage npcs, a quest, a game tracker, a beat) and asserts each heading is the name of exactly one region. It failed with the regions removed and passes with them; `pnpm test:ct tests/client/features/rpg` 18 passed.
- Not run: `tests/e2e/rpg-lite-loop.spec.ts` was edited for the goal button name.
