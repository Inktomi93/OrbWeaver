---
kind: index
status: active
updated: 2026-08-02
---

# docs/history — landed program records (reference only, never live law)

**The rule:** a design/spec/review doc moves here ONLY when EVERY stage, finding, and recommendation
in it is landed or explicitly superseded/ruled-dead — verified against `docs/retro-workboard.md`,
`git log`, and the code. Partial = it stays where it lives. Moves only; nothing is ever deleted, and
a moved file keeps its filename so its cites stay greppable.

**The one exception, and its shape:** the live board FILE never moves, but its ARCHEOLOGY does. When the
board is rewritten current-state-only after an audit, the superseded blocks land here as
`retro-workboard-<date>.md` (the first: `retro-workboard-2026-08-03.md`) with an audit header saying what
was proven done. Only proven-done claims may move; anything unprovable stays on the live board.

**Never moves:** `docs/retro-workboard.md` (the live board) · `docs/Mission.md` ·
`docs/architecture/core/**` and `docs/architecture/proposed/**` · any spec with an open ladder ·
a live spec's mocks (mocks follow their spec).

Sibling archive: `docs/architecture/history/` holds the pre-retro architecture archaeology
(the constitution's §7 "resolved archeology" row points there). This directory holds the same class
for `docs/design/**` and `docs/reviews/**`.
