---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: tooling
---

# The doc tool and its decision records stop naming commands that do not exist

## What

Files under `tooling/src/doc/` and `tests/tooling/doc/` name `check:agents`, `check:docs` and `check:ledgers-fresh` as commands; `package.json` defines none of them. `tooling/src/doc/ops/run.ts` prints `check:docs` as a verb name to the author. Several tool `cli.ts` headers and `tooling/src/snap/contract/contrast.ts` cite a five-slot cap whose check is deleted. `docs/adr/0164-docs-plans-adrs.md`, `docs/adr/0222-docs-plans-adrs-no-archive.md` and `docs/adr/0283-docs-lifecycle-and-publication-editorial-corrections.md` describe `check:agents` as the live checker, which D333 deleted. `tooling/src/doc/lib/drift.ts` says the SessionStart hook prints the drift lines; `.claude/hooks/session-onboard.sh` does not run it. Item 2433 already removes the `check:agents` refusal message in `tooling/src/doc/ops/check.ts`. Ruling under the delegated-rulings memory: the whole-tree rules audit stays a test with no command, because ADR 0164 rejected a check verb and D333 forbids a replacement. Source: `docs/work/codebase-review/units/tooling-doc.md`.

## Why

A message that tells an author to run a missing command stops them mid-task, and the decision records contradict each other.

## Done when

No file under `tooling/src` or `tests/tooling` names a `pnpm` command that `package.json` does not define, and no printed message does. The five-slot cites state the layout as convention or are removed. The three ADRs state the standing ruling after D333. The drift header names who runs it.

## Evidence

Filled at landing: what ran and where its output is.
