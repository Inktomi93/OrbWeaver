---
kind: tooling
status: open
updated: 2026-09-23
priority: P2
area: tooling
---

# Give doc set the fields agents edit by hand today

## What

Close the gaps that push agents to edit docs by hand:
- `pnpm doc set` can change an item's `kind` and title, and clear its `plan` (`--plan none`).
- A title change renames the file and rewrites every link to it.
- `pnpm doc remove <id…>` deletes items that were filed by mistake. It refuses when another doc links to
  the item or names it as a blocker, and it regenerates the indexes.
- `pnpm doc status` sets the `kind` of a law doc.
- Every change goes through the pre-write checks that `doc item` already runs.

## Why

Three workarounds happened in one session:
- Items were deleted with `rm` because no verb removes a mistaken item or clears its plan.
- Six law docs had `kind` rewritten by hand.
- Parked program items kept `kind: decision` because nothing can change it.
Each workaround is the hand edit the docs system exists to stop.

## Done when

Each case above has a verb, and a test covers each verb, including the refusals. `.claude/rules/docs.md`
and `docs/law/docs-and-work.md` list the new verbs. The parked program items move to kind `work` through
the tool.

## Evidence

Filled at landing: what ran and where its output is.
