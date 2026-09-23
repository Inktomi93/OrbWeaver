---
kind: work
status: open
updated: 2026-09-23
priority: P3
area: verify
---

# Pin that the DEV-only client instruments never reach the production bundle

## What

Add a check that runs a production build of the client and reads the source modules behind each emitted chunk, from sourcemap sources or the bundler's own module list. It fails if packages/client/src/lib/long-task-tracer.ts, packages/client/src/compose/config-sections.ts or packages/client/src/agent-handles/index.ts, or anything reachable only through them, appears in any chunk, preloaded or lazy. Also add a sentence to the prodonly command header (tooling/src/ast/ops/prodonly.ts) saying it measures reachability in the source import graph, not presence in the shipped bundle, and does not fold import.meta.env.DEV branches.

## Why

main.tsx says the bundler strips these instruments by folding the import.meta.env.DEV check, but nothing verifies it. boot-chunk-ratchet only weighs the boot set, so a refactor that pulls one of these modules into a lazy production chunk would pass every current check. Separately, prodonly counts these modules as production-live, and a reader has no way to tell that this overstates what actually ships.

## Done when

The new check exists under the verify tooling with a committed test. A planted control that statically imports one of the named modules into a production path turns it red, and the real tree is green. The prodonly.ts header states that the command covers source-graph reachability only and does not model DEV-only branches.

## Evidence

Filled at landing: what ran and where its output is.
