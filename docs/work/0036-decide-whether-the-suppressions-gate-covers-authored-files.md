---
kind: decision
status: open
updated: 2026-09-23
priority: P3
area: verify
---

# Decide whether the suppressions gate covers authored files outside its population roots

## What

The suppressions gate only reads .ts and .tsx files under packages/<pkg>/src, tooling/src, tests and scripts. That leaves out three groups of authored code. First, repo-root files such as knip.ts, platform.d.ts, eslint.config.js and the vitest and playwright configs. Second, package files outside src, such as packages/ui/token-contract.ts and the showcase-plugins bundle scripts. Third, .cjs, .mjs and .js scripts, such as scripts/eslint.cjs, scripts/ts7.cjs, scripts/vitest-supervised.mjs and scripts/probes/st-goldens/write-v2-png.cjs. These files hold live biome-ignore directives. Some use rules that already have a source grant: noProcessEnv, useNamingConvention, noBitwiseOperators and noNamespaceImport. Others use rules with no source grant: noProcessGlobal, noDefaultExport and useConsistentMethodSignatures. The population test also states that the workspace root has no authored file outside the existing roots, and that statement is false.

Owner ruling: outcome (A), widen the population. First convert each `.cjs`, `.mjs` and `.js` script to
`.ts`, because node runs TypeScript directly. Keep a script in its old format only when the tool that
loads it cannot load TypeScript, and state that reason in the script's header.

## Why

A suppression outside the population needs no grant and is checked by no gate. A new unjustified directive in a root config or a .cjs script will pass unseen. The gate header lists the files it admits but never says why the rest is left out. The population test's reason for excluding the workspace root rests on a claim the tree contradicts, so the boundary reads as an accident rather than a ruling.

## Done when

One of two outcomes holds. (A) The suppressions population admits the repo-root authored files, the package files outside src, and the .cjs, .mjs and .js scripts. Every directive found there is either removed or covered by a source grant row, and the gate passes. (B) The suppressions gate header and the no-blanket-suppression gate header state which authored files are excluded and why. In both cases, the workspace-root `why` in tests/tooling/verify/contract/population.test.ts is corrected so that it no longer claims every authored file is under a population root.

## Evidence

Outcome (A), from lane cb-suppress. The commit messages carry the full list of checks.

- Converted, with every caller updated: `scripts/{ts7,eslint,depcruise,vitest-supervised}.ts`,
  `scripts/probes/st-goldens/write-v2-png.ts` and `stryker{,.gate}.config.ts`. `pnpm typecheck` covers
  each one through the root or tests-dom program, and a planted type error turned it red.
- Kept as JavaScript, each with its reason in its header: `eslint.config.js` and
  `.dependency-cruiser.cjs`. The showcase QuickJS guest bundles keep theirs in
  `packages/showcase-plugins/src/index.ts`.
- `harnessGlobs` loads the repo-root files, the package files outside `src/` and `playwright/`. The
  `suppressions` population is `of: "all"`, and `population.test.ts` holds the corpus to git's tracked list.
- Directives: the `knip.ts` one is removed, because a Biome config block now covers that file.
  `suppressions:source-lint-style-use-consistent-method-signatures` grants the `platform.d.ts` ones.
  `token-contract.ts` falls under an existing grant.
- `pnpm check:structure` shows `suppressions` green with 0 tool errors. `pnpm check:policy-conformance`,
  `pnpm typecheck` and `pnpm depcruise` are clean.
