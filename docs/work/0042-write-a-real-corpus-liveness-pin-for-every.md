---
kind: tooling
status: open
updated: 2026-09-23
priority: P2
area: verify
---

# Write a real-corpus liveness pin for every final policy that lacks one

## What

Give every final policy a real-corpus liveness pin (`tests/support/real-corpus-liveness.ts`): the policy is silent on the real tree, then reports when an overlay plants its violation (`add`) or removes its watched subject (`neutralise`). Group pins by corpus glob-set so each corpus is built once, and run them in `.repo.int` suites. Plan: census the unpinned policies by population and analysis tier, then run one workflow per corpus group. Sonnet drafts each pin from the policy's own `mustFlag` rows and message. Opus runs it and confirms both directions. A policy whose pin cannot go green is blind on the real tree; fix that policy. Then promote `real-corpus-liveness-manifest` from warning to blocking.

## Why

Fixture proof rows prove a policy's logic but not that it reads the real tree. A policy can pass every row and be dead on the corpus; this happened more than once in this audit. The obligation was ruled in the gate-runtime program and never scheduled past the first pins.

## Done when

`real-corpus-liveness-manifest` reports no unpinned policy and is blocking. Every pin passes in both directions. Every policy found blind has its own fix commit.

## Evidence

Filled at landing: what ran and where its output is.

Built by lane cb-pins. One runner, `tests/tooling/verify/gates/real-corpus-liveness-family.suite.repo.int.test.ts` over `tests/support/real-corpus-liveness.ts`, with the pins as data in `tests/tooling/verify/gates/_liveness/*.ts`. Overlay kinds: `add`, `neutralise`, `remove`, `resource`, `replace`, `delete`, `edit`, plus `reportsAt` and grant-consumption pins. Every pin passes in both directions, and a planted dead control is refused for each kind. The whole file passed with every pin wired in, one serial file inside `--full` per the owner ruling in item 0043.

Blind policies found and fixed: `byte-check-cast` (the shared origin reader refused drizzle's merged `sql`; fixed under item 0107) and `persistence-no-in-memory-state`'s identity verdict on augmented globals (item 0107).

Still unpinned, per `pnpm check:structure --check real-corpus-liveness-manifest`:

- `no-manual-memo-compiler-health`: needs an installed-package overlay (item 0145).
- `open-json-column-key-parity-health` and `css-var-defined-health`: they count every JSON column or every product stylesheet, and no bounded overlay empties those counts.
