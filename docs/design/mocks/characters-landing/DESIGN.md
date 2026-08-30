---
kind: design
status: active
updated: 2026-08-30
---

# Characters landing — the CONTENT pane at rest

**Owner-ruled 2026-08-30 (#864, "Yes — build to it").** The clickable canvas is the Claude Design artifact
`https://claude.ai/code/artifact/c0fcd1ff-2296-4efe-9ce3-c77284f58099`; these files are its repo source —
`build.mjs` assembles the four `*.dc.html` artboards, `canvas.json` lays them out, the `*.png` are the
default-state renders at true size. Re-seed the canvas from these; never edit the artifact by hand.

## Why

Side-eye (Characters delta pass, 2026-08-30): the unselected CONTENT pane is "a 917×750 hole with a caption
in it" on the surface that owns the app's most visual objects; `UI-Architecture-and-Layout.md` §4.1 gives
Chats a committed `{kind: landing}` pane and Characters only a "teaching state" — this closes that gap.

## The four states

| Board | Frame | What it shows |
| - | - | - |
| `Main` | 917×750 — 1280 with the list DOCKED, context collapsed | "Pick up where you left off" · **Recently chatted** (sort `recent`, 4–5 faces) · **Starred** (sort `starred`, one row) · a foot line naming the week's additions. **No New door** — the LIST band owns it (#520); the lead names it by label. |
| `ListCollapsed` | 1224×750 — list collapsed | The same shelves, wider cells, plus **Just added** (sort `newest`); the landing OWNS `New character` + `Import a card` because the band's door is off screen (#520's collapsed arm). |
| `FreshInstall` | 917×750 — the seeded ten, nothing chatted, nothing starred | "Meet the cast" · one shelf **Shipped with Orbweaver · 10** with the elevator pitches · a hint that the shelves appear when they have something to show. Empty shelves are ABSENT (applicability), never empty rooms. |
| `Phone` | 430×860 — reachable only with the list hidden (the section root is the LIST on a phone) | Lead, the doors, three-column faces, Recently chatted · Starred, a foot line with "Show the list". |

## Material — nothing drawn that the wire does not carry

`character.list` today: `name` · `handle` · `avatarHash`/`avatarAssetId` · `starred` · `archived` · `createdAt` ·
`lastChattedAt` (the recent signal) · `tags` · `elevatorPitch`; server sorts `recent | starred | newest`
(`packages/server/src/domain/character/verbs/list.ts`, `contract/views.ts:47-80`). Ruled onto the wire by
\#865: `chatCount` (already computed in `persistence/queries.ts:104`, dropped in `summaryOf`) and a closed
`provenance` (`CharacterProvenance` = shipped · imported · authored) — the faces show "· N chats" and the
fresh-install shelf is named by `provenance`. NOT `source`: that name is already the card's own ST V3
provenance-URL list, and #865 landed the verdict as `CharacterSummary.provenance` (corrected here on the
build, 2026-08-30). The face tile is the Chats home tile's shelf (`features/chat/components/home-quick-picks-tile-body.tsx`:
`Grid cols="cellFixed"` + `Avatar` + `Text voice="promoted"` + gloss), not a new primitive.

## Fences the build honours

- **#520 / #532 one New door** — band's when docked, landing's when collapsed; never both visible.
- **#518** — the library count lives in the list pane; the landing prints shelf counts ("Starred · 6") only.
- **#226** — shelves are single-column bands with a fixed-cell grid, so width crossover cannot unbalance them.
- **D44** — portraits through the `Avatar` media primitive; art never behind prose.
- The caption component being replaced: `features/character/components/character-library-welcome.tsx`
  (`EmptyState` "Choose a character"); the list-mode hint it carries moves to the lead line.

## Sequence

After cb-char-polish (#839–#843) and the #860 Characters commit merge, and after #865 lands the two fields.
