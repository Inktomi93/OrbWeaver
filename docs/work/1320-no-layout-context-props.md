---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: client
---

# Layout-context props are refused by lint

## What

`docs/law/UI-Architecture-and-Layout.md` §4b axis 1 bans layout-context props (`compact`, `inDrawer` and the like) and names "ESLint attribute restrictions in `eslint.config.ts`" as the guard. No such restriction exists in `eslint.config.ts` or `tooling/src/eslint/`. Two uses remain in one client file.

## Why

A component told where it is cannot be placed anywhere else; its container answers that question.

## Done when

A `no-restricted-syntax` entry refuses the named attributes on JSX in `packages/client/src` and `packages/ui/src` (the list owned by one constant), the two uses move to container queries, a planted control fails, and the law sentence names the rule.

## Evidence

Filled at landing: what ran and where its output is.
