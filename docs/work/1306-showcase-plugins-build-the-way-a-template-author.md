---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: plugin
---

# Showcase plugins build the way a template author builds

## What

The showcase tsconfigs (packages/showcase-plugins/tsconfig.author-\*.json and tsconfig.json) include the SDK declarations by path (../plugin-sdk/main.d.ts, shared.d.ts, frame.d.ts), add the repository's reset.d.ts and platform.d.ts globals, and extend the repository's tsconfig.base.json or tsconfig.world-browser.json. ADR 0266 says authors build against the standalone public SDK, shipped as a deterministic tarball on a versioned GitHub Release that the template repositories lock, with the author toolchain checking emitted artifacts.

## Why

The showcases are the reference plugins. If they compile against more than a template author gets (repo globals, unpublished declarations, repository compiler options), a showcase can depend on something no author can use, and an SDK packaging defect never shows up in our own build.

## Done when

Each showcase builds against the packed SDK and toolchain artifacts a template locks (or byte-identical declarations resolved through the package's exports), with the template's compiler options and no repository globals; a planted use of a repository-only global or an unexported SDK path fails the showcase build; one showcase also builds in a clean template-shaped checkout outside the workspace.

## Evidence

- The showcase build already compiled with the toolchain's own compiler options and no repository globals. The `tsconfig.author-*.json` files fed only typed lint and `pnpm typecheck`. They now mirror the toolchain options, have no `extends`, `reset.d.ts` or `platform.d.ts`, and take the SDK through `types: ["@orb/plugin-sdk/<runtime>"]`, which resolves via the exports map. `@orb/plugin-sdk` is a showcase devDependency, and `compileShowcasePlugins` resolves the SDK directory through `@orb/plugin-sdk/package.json` as the `orb-plugin` CLI does.
- `pnpm --filter @orb/showcase-plugins build` and `check:artifacts` exit 0 for all nine bundles; `release-entries.json` is unchanged.
- Planted `new Map<string, number>().getOrInsert("a", 1)` in a showcase: accepted by the old author tsconfig, rejected by the new one (TS2550) and by `check:artifacts` (exit 1). Planted `import "@orb/plugin-sdk/shared"`: rejected by both (TS2882) and by the build.
- Clean directory outside the workspace, with the SDK and toolchain tarballs from `pnpm plugin:author-release`: `orb-plugin build`, `check` and `pack` exit 0 on affinity-tracker, and its `main.js` and `ui.js` equal the shipped bundle entries byte for byte.
- `pnpm typecheck` exit 0. `noUncheckedIndexedAccess` stays on in the author tsconfigs: it is stricter than the toolchain, and the showcases guard indexed reads.
- Not changed: `scripts/pack-plugin.ts` and `tests/support/node/showcase-guest.ts` still pass `packages/plugin-sdk` by path.
