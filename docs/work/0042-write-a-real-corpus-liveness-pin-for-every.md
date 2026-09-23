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

Chunk 4 (lane cb-pins). The 30 unpinned policies whose population is `@server` alone gained pins in
`_liveness/server-app.ts`. None was blind on the real tree. `plugin-dump-guard` judges only the membrane
module, so its pin rewrites that module. `verb-naming` also reports every other verbs-directory pin in the
shared pass, so the entanglement check proves it alone. `real-corpus-liveness-manifest`: 244 unpinned before,
214 after.

Chunks 5 and 6 (lane cb-pins). The 40 leftover `@client` and `@ui` policies gained pins in
`_liveness/client-ui.ts`, and the 17 leftover `@authored` policies gained pins in `_liveness/authored.ts`. These
are the policies with narrowed populations that the exact-population chunks skipped. None was blind on the real
tree. One real-tree discrepancy came out of it. `persistence-no-in-memory-state` reports a planted bare
`new Map()` as an unresolvable constructor, not as the ambient global. The real `Map` does resolve to
lib.es2015, but it also carries the repo's global augmentations (`platform.d.ts` and ts-reset), which the
fixture project lacks. The policy still reports, and that verdict is the one pinned. An earlier "no ES2015 lib"
explanation was wrong. `real-corpus-liveness-manifest`: 214 unpinned before, 157 after.

Chunks 7 and 8 (lane cb-pins). The leftover `@product`, `@db` and `@server`+`@inference` policies gained pins in
`_liveness/product-db-server.ts`, and the leftover `@tooling` and `@tests` policies gained pins in
`_liveness/tooling-tests.ts`. Two policies have no pin:

- `byte-check-cast` is BLIND on the real tree. Its own `mustFlag` row, planted verbatim at a real schema path,
  reports nothing. Real drizzle's `sql` has two declarations (the function and its merged namespace), so the
  shared module-origin reader answers "unresolved: ambiguous", and the policy never recognises a `sql.raw` or
  `sql` tagged CHECK. The fix belongs in the origin reader.
- `no-manual-memo-compiler-health` reads the installed React Compiler under `node_modules`, which the
  ResourceHost overlay refuses to mutate.

`real-corpus-liveness-manifest`: 157 unpinned before, 101 after.
