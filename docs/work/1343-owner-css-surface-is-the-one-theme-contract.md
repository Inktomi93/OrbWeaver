---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: client
plan: css-system
---

# The owner-CSS surface is the one theme contract

## What

Custom theme CSS (stored on the theme, injected unlayered by `features/app-shell/components/custom-theme-style.tsx`, edited in `features/config/components/theme-editor.tsx`) has three disconnected sources: the editor autocompletes only `THEME_SCOPE_EMIT_VARS`, `validateThemeCss` (`@orb/kit/css-validate`) checks syntax and policy, and the generated `packages/client/owner-css-surface.ts` lists every `data-slot`, shell class and token the app renders — read by nothing at runtime.

## Why

A theme author cannot discover the hooks, nothing warns when a theme targets a hook that no longer exists, and a refactor renames hooks with no signal.

## Owner ruling

2026-10-24: do it properly and unify — one generated surface feeds the editor, validation and the change signal.

## Done when

- One generated surface owns the public theme hooks: `data-slot` values, shell classes, semantic tokens and theme-scope vars, and the `data-appearance-*` attributes and appearance custom properties once leg 9's manifest lands. Primitive tokens and private `--orb-*` names stay out.
- The theme editor autocompletes from it in context (`[data-slot="` → slot names, `var(--` → tokens, `[data-appearance-` → keys and their values).
- Validation warns (not errors) on a selector or `var()` that names a hook absent from the surface, with the closest current name.
- A test fails when a hook leaves the surface without a recorded rename, and the rename table maps old names to new so existing themes keep working or get a precise warning.
- A CT drives the editor's completions and the stale-hook warning; the law names the surface as the theme contract.

## Evidence

Filled at landing: what ran and where its output is.
