---
kind: decision
status: blocked
updated: 2026-11-11
priority: P2
area: tooling
blocked: owner
---

# Rule on native lint rules for the single stream and for raw clock reads

## What

Two rules lost their only check when the custom verification was deleted, and the law now says review holds them. One: no procedure outside `packages/server/src/transport/trpc/routers/stream.ts` declares a subscription, except the permanent `chat.impersonateStream` (ADR 0118). Two: package source reads time through an injected clock, never `Date.now()` or a bare `new Date()` (Spine-Testing section 3); the mounted `orb/no-module-state` rule covers only reads at module load. The lane that corrected the citations proposes one native ESLint `no-restricted-syntax` block for each, written out in `.claude/worktrees/agent-a672cae2c753c5fe3/reports/lanes/2026-11-10-rv-gates.md`. Each flags no site on the current tree. Recommendation: adopt both; D333 keeps maintained native lint rules and forbids only a policy framework.

## Why

Both rules hold today. With no check, the first violation lands unnoticed, and a second stream or a raw clock read is costly to find later.

## Done when

The owner has ruled. On yes: both blocks are mounted in `eslint.config.ts`, each with a planted test like its sibling rule tests, the tree passes, and the law docs name the rule ids. On no: the item records the ruling and the law keeps saying review.

## Evidence

Filled at landing: what ran and where its output is.
