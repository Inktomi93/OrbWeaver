---
kind: plan
status: active
updated: 2026-09-23
---

# Config tags become a facet: edited in place, surveyed in Corpus

## Goal

Tags stop being a destination: a tag is edited wherever its chip appears and understood from a Corpus overview, and the Config collection keeps only authored things.

## Shape

**Already built:** Config and Settings merged into one Config section with shelves (`CONFIG_SHELVES` in `packages/client/src/state/config-group-ids.ts`); tags, regex, world info and saved rosters are its collections. The tag editor (name, colours, folder type, hide-chip, merge, delete) exists in `packages/client/src/features/tag/`.

The test that sorts the drawer: a **thing** is an authored object you own and visit (a character, a preset, a book, a regex script) and earns a home; a **facet** is a property of many things (a tag) and lives on those things. A concept that cannot fill the CONTEXT pane honestly does not belong in a section; forcing it in produces a pane that narrates its own emptiness.

A tag has four jobs, each with its own home:

| Job | Home |
| - | - |
| Apply a tag | on the thing |
| Filter or group a library | in that library's list |
| Edit one tag | an in-place popover from any tag chip and from the filter picker, reusing the existing editor |
| Understand the whole taxonomy (usage, orphans, bulk cleanup) | a Corpus overview |

The relocation is a registry edit at the composition door, not a rewrite.

## Open questions

- Do regex scripts and world-info books pass the CONTEXT test with a populated surface, and where does each live?
- What does Corpus hold today, and can it host the tag overview?
- Should the imagery prompt templates in settings be renamed so "template" means only the preset templates (D132)?

## Rejected

- Making the Config tag screen prettier: the problem is the home, not the screen.
- Rebuilding the tag editor: it already has the power; only its home is wrong.

## Coupled sites

- `packages/client/src/features/tag/` (the editor becomes a popover)
- `packages/client/src/state/config-group-ids.ts` (the collections tuple)
- `packages/client/src/features/discovery/` (the Corpus overview)
- every surface that renders a tag chip

## Test plan

- A CT that opens the tag popover from a chip on each tagged surface and saves an edit.
- A CT for the Corpus tag overview, including orphan tags and a bulk action.
- The config group completeness gate after `tags` leaves the collections tuple.
