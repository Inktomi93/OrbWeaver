---
paths:
  - "docs/**"
---

# Docs

Style is `.claude/rules/writing.md`; this file covers only the docs mechanics.

## The tree

Four homes plus `docs/Mission.md`: `docs/law/` (standing law), `docs/adr/` (one decision per file,
immutable), `docs/plans/<slug>/design.md` (a program), `docs/work/` (one work item per file). A done
plan moves to the archive folder under `docs/plans/`. The other folders under `docs/` are legacy and
migrate under `docs/plans/doc-migration/design.md`; do not add a file to them.

## Write prose, not structure

Every structural change goes through `pnpm doc` (run `pnpm doc help` for the verbs): minting, status
and supersession, work-item transitions and landing, archiving, `review`, and the generated indexes
(`README.md` in each home, a plan's `tasks.md`). Never edit a generated file or a frontmatter block by
hand. `pnpm check:agents` reds a stale index, a missing section, a size cap, a dead link or path, and a
writing-rule finding; its message names the fixing command.

## Frontmatter

Every `docs/**` file carries `kind`, `status` and `updated`. `updated` is the one sanctioned date and
doubles as the review mark: `pnpm doc due` lists docs whose cited code changed after it, and
`pnpm doc review <path|glob…>` sets it in batch. The legacy tree keeps its dated-by-design exemption
until it moves.

## Work items

States are `open`, `doing` (with `lane`), `blocked` (with `blocked: owner | on <id> | wake <command>`)
and `done` (with `evidence`, a commit on `main`). Any transition is legal; the checker validates the
final shape. Lanes never write item state: add a `Closes: 12, 14` trailer and the post-merge hook lands
the items. `pnpm doc overview` is the column view; `pnpm doc drift` names each inconsistency with its fix.

## Checks

`pnpm check:agents` (the governed tree), `pnpm check:docs` (the formatter), `pnpm check:structure`
(dangling references and D citations), `pnpm check:doc-catalog` (the legacy tree only). A floor touching
docs runs all four.

## Editing a formatted doc

A scripted find-and-replace against a formatted doc asserts the match count is 1 before replacing. The
formatter rewrites characters such as `~`, so an unverified anchor can silently do nothing.

## `docs/architecture/proposed/`

Rebuild reference, not current plan or status; its own status lines can be stale. Check a claim against
the code and tests before relying on it, and never edit a status line to match reality. A dispatch into a
set reads every file in it, `README.md` first.

## `docs/catalog/receipts/**`

After rebasing a branch that added rows to these files, remap any `verifiedCommit` value that now points
at an orphaned sha to its rebased equivalent before treating the merge as done.
