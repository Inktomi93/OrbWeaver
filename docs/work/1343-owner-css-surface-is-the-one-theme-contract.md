---
kind: work
status: doing
updated: 2026-10-25
priority: P2
area: client
lane: closeout/css
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

Built:

- `packages/client/owner-css-surface.build.ts` writes `OWNER_CSS_SURFACE` (kind-tagged slots, shell classes, tokens) and writes every roster as literals. A regen that drops a published hook without a row in `packages/client/src/owner-css/renames.ts` throws.
- `CodeEditor` takes `CodeEditorCompletionRule[]`; `features/config/lib/theme-css-completions.ts` builds the rules from the surface.
- `features/config/lib/theme-css-warnings.ts` raises stale-hook warnings; `CustomThemeStyle` rewrites recorded old names before injecting.

Checks:

- `pnpm test tests/client/owner-css-surface.repo.int.test.ts tests/client/owner-css/rewrite.test.ts tests/client/features/config/lib/theme-css-warnings.test.ts`
- `pnpm test:tools tests/tooling/generated-css-drift.repo.int.test.ts`
- `pnpm test:ct tests/client/features/config/surfaces/theme-css-editor.ct.tsx` drives each completion context, a planted stale slot and a current slot.
- `pnpm typecheck tsconfig.json packages/client/tsconfig.json packages/ui/tsconfig.json tsconfig.tests-dom.json`, `pnpm knip:prod`, `pnpm depcruise`.

The appearance attributes, their values and registered properties are included in the generated surface. Current surface, rename, rewrite and warning tests pass. Regeneration also includes the existing home-recents height token. See [CSS closeout](../reviews/css-closeout.md) for current rendered qualification and limits.
