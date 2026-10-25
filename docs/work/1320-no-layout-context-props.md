---
kind: work
status: doing
updated: 2026-10-25
priority: P3
area: client
lane: closeout/dom
---

# Layout-context props are refused by lint

## What

`docs/law/UI-Architecture-and-Layout.md` §4b axis 1 bans layout-context props (`compact`, `inDrawer` and the like) and names "ESLint attribute restrictions in `eslint.config.ts`" as the guard. No such restriction exists in `eslint.config.ts` or `tooling/src/eslint/`. Two uses remain in one client file.

## Why

A component told where it is cannot be placed anywhere else; its container answers that question.

## Done when

A `no-restricted-syntax` entry refuses the named attributes on JSX in `packages/client/src` and `packages/ui/src` (the list owned by one constant), the two uses move to container queries, a planted control fails, and the law sentence names the rule.

## Evidence

- `orb/no-layout-context-props` lives in `tooling/src/eslint/ui-feature-policy.ts` (the list is the module constant `LAYOUT_CONTEXT_PROPS`) and applies to `.tsx` in `packages/client/src` and `packages/ui/src` through `eslint.config.ts`.
- No `@orb/ui` variant is keyed by a listed name. `compact` appears only as a value of `size`, `density` and `listSize`, so nothing is left off the list.
- The two remaining uses were `data-compact` attributes on `rpg-takeover-header.tsx`. Nothing read them and the arm they marked follows the data, not the container, so they are deleted.
- Control: `pnpm test:tools tests/tooling/eslint-layout-context-props.test.ts` fails 6 of 7 with the rule off, passes 7 of 7 with it on.
