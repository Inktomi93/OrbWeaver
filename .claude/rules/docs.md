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
until it moves. The governed kinds, statuses and keys are `KIND_RULES` in `tooling/src/doc/lib/rules.ts`;
the legacy tree's vocabulary is `tooling/src/doc-catalog/lib/vocab.ts`.

## Moving or deleting a doc

Supersede with `pnpm doc status superseded <path> --by <path>` and archive with `pnpm doc archive`. For a
path move, `git mv` the file, rewrite its full-path citers in the same commit with an exact prefix
replacement, and fix the moved file's own relative links. Search `packages`, `tooling`, `tests`, `scripts`,
`.claude`, `AGENTS.md`, the root configs and `docs/` with `rg`. Keep section numbers, because code cites
them. `pnpm check:structure` (`dangling-doc-cite`, `dangling-refs`, `dangling-ref-citations`) proves the
sweep. Dated records under a history or reviews tree keep the path that was true when they were written.

## Work items

States are `open`, `doing` (with `lane`), `blocked` (with `blocked: owner | on <id> | wake path <repo
path> | wake gone <repo path>`) and `done` (with `evidence`, a commit the checker proves is on `main`).
`lane` is the EXACT branch name the lane works on (`git rev-parse --abbrev-ref HEAD` in its worktree);
`drift` matches it against the live worktrees and the unmerged branches. A wake condition names a
repository path and wakes the item when that path exists (`path`) or no longer does (`gone`); nothing in
an item is ever executed. Any transition is legal; the checker validates the final shape. Lanes never
write item state: add a `Closes: 12, 14` trailer and the post-merge hook lands the items (a conflicted
merge concluded by `git commit` runs no hook; `drift` then names the by-hand landing). `pnpm doc
overview` is the column view; `pnpm doc drift` names each inconsistency with its fix.

## Checks

`pnpm check:agents` (the governed tree), `pnpm check:docs` (the formatter), `pnpm check:structure`
(dangling references and D citations), `pnpm check:doc-catalog` (the legacy tree's inventory: one lane
and one authority row per document, frontmatter debt; no content hash, so a prose edit reds nothing
there). A floor touching docs runs all four. A legacy document added, removed or re-kinded owes
`pnpm doc-catalog:sync` and `pnpm doc-catalog:write`.

## Editing a formatted doc

A scripted find-and-replace against a formatted doc asserts the match count is 1 before replacing. The
formatter rewrites characters such as `~`, so an unverified anchor can silently do nothing.

## `docs/architecture/proposed/`

Rebuild reference, not current plan or status; its own status lines can be stale. Check a claim against
the code and tests before relying on it, and never edit a status line to match reality. A dispatch into a
set reads every file in it, `README.md` first.
