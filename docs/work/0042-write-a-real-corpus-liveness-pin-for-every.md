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

Chunk 1 (lane cb-pins). The one runner (item 0043's ruling) is
`tests/tooling/verify/gates/real-corpus-liveness-family.suite.repo.int.test.ts` over
`tests/support/real-corpus-liveness.ts`; pins are data in `tests/tooling/verify/gates/_liveness/*.ts`. The ten
earlier pins moved onto it, and the 37 unpinned policies whose population is exactly `@client` gained pins
(`_liveness/client-app.ts`). All 47 pins pass both directions, and a planted dead control is refused. No
policy in the chunk was blind on the real tree. `real-corpus-liveness-manifest`: 341 unpinned before, 304
after (`pnpm check:structure --check real-corpus-liveness-manifest`).

Chunk 2 (lane cb-pins). The 34 unpinned policies whose population is `@client` + `@ui` gained pins in
`_liveness/frontend.ts`. All pass both directions on the batched runner. The runner gained a `resource`
overlay for stylesheet and token-vault subjects, carried by the production reader's own overlay, and a
planted resource control is refused. No policy in the chunk was blind on the real tree.
`css-family-direct-client-mechanism` has no pin: its only reports are the three recipes the central grant
table licenses, so no overlay can make it report anything new. Its liveness shows as grant consumption,
which an arm cannot yet assert. `real-corpus-liveness-manifest`: 305 unpinned before, 271 after.

Chunk 3 (lane cb-pins). The 26 unpinned policies whose population is `@tooling` or `@authored` gained pins
in `_liveness/tooling-and-authored.ts`. None was blind on the real tree. A `grantConsumption` arm now pins
`css-family-direct-client-mechanism`. On the real tree its three central grants must be consumed, and with the
client sheet's recipes taken away they must go stale. A planted control that leaves the recipes in place is
refused. The baseline pass now measures only the arms whose silence is not structural.
`real-corpus-liveness-manifest`: 271 unpinned before, 244 after.
