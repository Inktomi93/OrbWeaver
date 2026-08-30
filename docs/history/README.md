---
kind: index
status: active
updated: 2026-08-30
---

# docs/history — landed program records (reference only, never live law)

**The rule:** a design/spec/review doc moves here ONLY when EVERY stage, finding, and recommendation
in it is landed or explicitly superseded/ruled-dead — verified against Project 1, `git log`, and the
code. Partial = it stays where it lives. Moves only; nothing is ever deleted, and
a moved file keeps its filename so its cites stay greppable.

**Check the paragraphs, not just the tables:** a findings table is not the whole doc — live obligations
also hide in prose tails (a "Process notes" bullet, a blueprint step, an INFO-rank row called out only in
text). A doc with a clean findings table can still carry an unlanded obligation in its prose; the
graduation check must read both before a move.

**Workboard snapshots:** the complete pre-Project board is frozen here as
`retro-workboard-2026-08-14.md`; earlier rewrites remain as `retro-workboard-<date>.md`. These are
provenance, never executable backlog. Current mutable state belongs only to Project 1.

**Never moves:** `docs/retro-workboard.md` (the recovery index) · `docs/Mission.md` ·
`docs/architecture/core/**` and `docs/architecture/proposed/**` · any spec with an open ladder ·
a live spec's mocks (mocks follow their spec).

**Layout:** archived designs land in `design/`; archived reviews land in `reviews/<kind>/`, mirroring
`docs/reviews/<kind>/`. `reviews/repository-audit-2026-08-13/` is the frozen truth snapshot of that dated
campaign — its `assignment.txt`/`read-receipt.tsv`/`MANIFEST*.json` record the 2026-08-13 tree and are
NEVER path-repointed. It keeps its own catalog lane (`repository-audits`, issue 6) rather than joining the
`history` lane, which is why `lanes.json` carries the matching `excludePatterns`.

Sibling archive: `docs/architecture/history/` holds the pre-retro architecture archaeology
(the constitution's §7 "resolved archeology" row points there). This directory holds the same class
for `docs/design/**` and `docs/reviews/**`.
