---
kind: work
status: done
updated: 2026-09-23
priority: P2
area: docs
plan: doc-migration
evidence: 220991d39
---

# Vendored docs leave git

## What

Done (cb-docsout): every mirror under the old vendor doc folder — ai-sdk, vite, and base-ui — is deleted
and the folder is gitignored; their catalog rows are dropped; their live prose citers now name the
upstream site or the installed package instead of the deleted bytes.

The ai-sdk and vite mirrors had no gate reader, so they were dead weight; their two live citers
(`tests/inference/backends/v4/result.test.ts`) now
cite the installed `@openrouter/ai-sdk-provider` package.

The base-ui mirror was different: it was committed **gate input**, folded by
`tooling/src/verify/contract/resource-vendor.ts` into the `css-var-defined` family (plus its `-health`
and `-grants` forms), `css-selector-has-a-writer`, `baseui-render-prop-composition`, and
`baseui-state-data-attributes`. A measured diff (every `.md` table row against every installed
`*CssVars.d.ts` declaration, `@base-ui/react` 1.7.0) proved the mirror's documented custom-property set
was identical to the set the reader already parsed from the installed declarations — the mirror carried
no fact that side didn't already carry, so it was deleted rather than relocated. Base UI's own
public-surface version drift stays caught independently by `baseui-surface-manifest`
(`tooling/src/verify/gates/baseui-surface.manifest.json`, generated from the installed package). Every
prose citer of the mirror's component pages (styling/composition handbooks, the radio and drawer
component docs) now points at the corresponding `base-ui.com` page.

## Why

A third of the tracked docs were bytes this repo does not author; most are searchable upstream and in
`node_modules`. The base-ui mirror looked like an exception because a gate read it, but the fact it
carried turned out to be fully redundant with a fact the same gate already reads from the installed
package — so it left too, rather than earning a relocation under `tooling/src/verify/`.

## Done when

The vendor doc folder is gone and ignored, every prior reader has a named replacement source, the
`css-var-defined`/`css-selector-has-a-writer`/`baseui-*` gate family stays green with its populations
unchanged (verified: `pnpm typecheck --config tooling/tsconfig.json`, `pnpm test:scoped
tests/tooling/verify/lib/vendor-css-contract.test.ts tests/tooling/verify/ops/resource-vendor.test.ts
tests/tooling/verify/lib/resource-declaration.test.ts tests/tooling/doc-catalog
tests/tooling/doc/lib/rules.test.ts tests/tooling/doc/lib/items.test.ts`), `LEGACY_ROOTS` loses its
vendor row, and `pnpm check:doc-catalog` and `pnpm check:agents` are green.

## Evidence

Filled at landing: what ran and where its output is.
