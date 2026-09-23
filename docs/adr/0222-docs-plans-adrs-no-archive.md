---
kind: adr
status: active
updated: 2026-09-23
supersedes: docs/adr/0164-docs-plans-adrs.md
---

# Docs, plans and ADRs are markdown with one structural writer

## Context

The docs tree had grown past two thousand tracked files across three history homes, two review homes, a flat design drawer and a vendored third-party mirror. The decision ledger lived in a few files large enough that agents patched their middle and broke their structure. The catalog that was meant to keep docs fresh pinned a whole-file hash per document, so a one-line edit invalidated a review and a rebase orphaned its commit; a sizeable share of every day's commits touched the catalog alone. Mutable work state lived on a GitHub project board that throttled and rotted. The authors are cold agents, so the structure has to carry the memory. Supersedes [ADR 0164](0164-docs-plans-adrs.md), whose Decision described an unbuilt `pnpm doc archive` verb and archive folder for done plans; no such verb or folder was ever built.

## Decision

Docs are markdown in the repository, in four homes plus the mission doc: `docs/law/` for standing law, `docs/adr/` for one decision per file, `docs/plans/<slug>/` for a program's design, and `docs/work/` for one work item per file. A plan with no open item has finished: its lasting knowledge moves into an ADR or law first, then the plan is deleted with `pnpm doc remove`; the repository's history holds the rest, so a finished plan is never archived. Agent run output leaves `docs/`; vendored docs leave the tracked tree.

Agents write prose only. Every structural change goes through `pnpm doc` (`tooling/src/doc/`): numbering, status and supersession, work-item transitions and landing, deletion with citer refusal, and the generated indexes. The tool rewrites a file's frontmatter block or a whole generated file; it never edits inside prose.

One checker, `pnpm check:agents`, covers the new tree: frontmatter schema per kind, required sections per kind, size caps per kind, allowed folders, generated-index freshness, dead links and paths, and the writing rules on history, counts and banned words. The rules live in `tooling/src/doc/lib/rules.ts` and `tooling/src/_shared/prose-rules.ts`; `.claude/rules/writing.md` is the one style law.

An ADR keeps the ledger's D number as its file number and earns a file only when the decision was contested or expensive to reverse. It is immutable: a change is a new ADR that supersedes the old one, and the tool writes both halves of that link. Status lives in frontmatter only.

Freshness has two tiers. Hard: every cited path, symbol, heading and D id resolves, red at `pnpm check`. Soft: a doc is due for review when a repository path its body cites changed after the doc's `updated` date, reported by `pnpm doc due` as a warning and never red. Nothing is committed for freshness beyond `updated`; `pnpm doc review` sets it in batch.

Work items have four states (`open`, `doing`, `blocked`, `done`); any transition is legal and only the final shape is checked. Lanes never write item state: they add a `Closes:` trailer, and a post-merge hook on `main` lands the items with the merge commit as evidence. A plan's `tasks.md` is generated from its items.

## Consequences

A new document costs its prose and nothing else: no lane row, no attestation, no regenerated catalog. The legacy catalog's hash-bound attestation is removed at once, not with the migration: its rows carry a path and an authority only, so a legacy prose edit reds nothing there either. A structural mistake is caught by the checker with the fixing command in the message. The legacy tree keeps its current checker until each folder migrates (`docs/plans/doc-migration/design.md`), and a migrated file must satisfy the new rules on landing; there is no grandfather exemption and no compatibility path, so the red is the to-do list.

The ledger split is one commit that re-points the D-citation gate at the ADR tree; the five thousand bare `D<n>` citations in code do not move because the numbers do not change. A finished plan leaves no trace under `docs/plans/` beyond the repository's own commit history; a reader who wants why a removed plan existed reads the ADR or law entry its knowledge moved into, or the deletion commit itself.

## Alternatives rejected

- SQLite for docs or items: a binary database cannot merge across parallel worktree lanes.
- An MCP server: Claude-only, a server for a script's job, and a mid-session change invalidates the prompt cache; Codex and Qwen must use the same tool.
- The proposal, design and tasks trio of spec-kit and OpenSpec: measured to cost two to three times the tokens for no better code.
- Keeping the single ledger file: it is the mega-doc problem; one row per file keeps the numbers and lets a lane own a bounded batch.
- Keeping GitHub Projects: throttled, rotted, and off the tree; in-flight state lives in the repo.
- A second checker (`pnpm doc check`): one checker; the doc tool exports its rules and `pnpm check:agents` runs them.
- A hash or commit pin per document for freshness: a whole-file hash reds on a one-line edit and a commit is orphaned by every rebase; a date is enough for a warning tier.
- A union D-id resolver while the ledger splits: a shim; the split is one commit.
- Extending the legacy catalog tool instead of a new `doc/` tool: the catalog is the model being removed; the survivor owns the verbs and only borrowed the catalog's frontmatter reader and formatter until those moved.
- A `describes:` frontmatter list of paths: the paths are already in the body as backticked citations, and a second list would drift from the first.
- A `## Status` section on an ADR: frontmatter `status` already holds it, and a second home for the same fact drifts.
- Work items as lines in a plan's `tasks.md`: no room for the four required sections or a blocker reason, and two lanes editing one `tasks.md` collide.
- The post-merge hook leaving its writes uncommitted: an uncommitted `main` blocks the next merge, so the hook commits under the standing commit contract with the whole-tree check excluded.
- An archive folder under `docs/plans/` for done plans: a done plan's lasting knowledge already has a home in an ADR or law, the repository already keeps the deleted file's history, and a second copy of a finished plan drifts from the record it was folded into.
