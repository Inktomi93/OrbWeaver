---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: kit
---

# A user macro does not evaluate an argument a second time

## What

`resolveDelivered` in `packages/kit/src/macro/user-macros.ts` evaluates any delivered argument that contains an opening brace pair, not only an argument delivered raw. A room variable that holds macro text, passed to a user macro through a variable read, runs: a security review probed it in kit, and the variable's text rendered a name and wrote a second variable, while a plain read of the same variable stayed literal. Any present member, a plugin and automation can set a room variable. It needs a preset or card of the host that passes a variable read into a user macro.

## Why

Text another account or a plugin wrote gains macro power on the host's turn through the host's own template.

## Done when

Only an argument delivered raw is resolved again; every other argument is spliced as literal text. A kit case shows a variable-delivered macro writes nothing and a raw argument still resolves.

## Evidence

Filled at landing: what ran and where its output is.
