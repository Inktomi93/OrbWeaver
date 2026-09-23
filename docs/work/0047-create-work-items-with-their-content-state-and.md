---
kind: tooling
status: open
updated: 2026-09-23
priority: P2
area: tooling
---

# Create work items with their content, state and batch in one call

## What

Extend `pnpm doc item`:

- It takes `--what`, `--why` and `--done`, plus the state flags `--blocked`, `--lane` and `--plan`, so one
  call writes a complete item.
- It takes `--from <file.json>`: an array of items created in one batch, all or nothing, with one index
  regeneration.
- It runs the writing rules and the item shape check on the new text before writing. It refuses with the
  findings instead of writing a file that `check:agents` then reds.
- `doc new adr` and `doc new plan` get the same content flags.

## Why

Filing five items took five create calls, a script to replace the template placeholders, separate `set`
calls for the blocked state, and a second pass to fix banned words the checker found afterwards. Agents
repeat that sequence and get it half-right.

## Done when

One `pnpm doc item --from items.json` call creates a batch of complete items, including blocked ones. A
batch where any item breaks a writing rule writes nothing and names the finding. Tests cover both cases.

## Evidence

Filled at landing: what ran and where its output is.
