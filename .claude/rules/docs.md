---
paths:
  - "docs/**"
---

# Docs

Write to `docs/architecture/core/Documentation-Law.md` (content) and `Core-Docs-Formatting-Law.md`
(mechanics). They own doc style; do not restate it here. `.claude/rules/writing.md` covers instruction
files and code comments, not docs.

## Frontmatter

Every `docs/**` file carries `kind`, `status`, and `updated` in its frontmatter block. This is a docs
exception to writing.md's ban on dates. `docs/architecture/history/` and `docs/reviews/` are dated
records by design.

## Checks

`pnpm check:docs` runs the doc formatter. `pnpm check:doc-catalog` checks catalog freshness.
`pnpm check:structure` runs dangling-reference and D-citation gates. A floor touching docs
runs all three.

## Editing a formatted doc

A scripted find-and-replace against a formatted doc asserts the match count is 1 before
replacing. The formatter rewrites characters such as `~`, so an unverified anchor can
silently do nothing.

## `docs/architecture/proposed/`

This tree is rebuild reference, not current plan or status. Its own status lines can be
stale. Before relying on a claim inside it, check the claim against the code and tests.
Never edit a status line here to match reality; treat drift as expected.

A dispatch into a `proposed/<set>/` folder reads every file in that set, starting with its
`README.md`, before writing any code. List the set with `find` or a tree listing, not a bare
`ls`, so no file is missed.

Graduating a set to `docs/architecture/history/`: annotate drift in place, close real test
gaps with code, `git mv` the files, fix self-links and sibling cross-links, run
`pnpm format:docs`, flip its `INDEX.md` row, and mint a ledger entry.

## `docs/catalog/receipts/**`

After rebasing a branch that added rows to these files, remap any `verifiedCommit` value that now
points at an orphaned sha to its rebased equivalent before treating the merge as done.
