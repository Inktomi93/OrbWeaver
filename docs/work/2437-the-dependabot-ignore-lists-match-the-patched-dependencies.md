---
kind: bug
status: doing
updated: 2026-11-11
priority: P2
area: ci
lane: wt/agent-ad0e85a8b8ba4ff64
---

# The Dependabot ignore lists match the patched dependencies

## What

`.github/dependabot.yml` ignores patched packages so a bump cannot land before its patch is ported, but the lists cover only part of `patchedDependencies` in `pnpm-workspace.yaml`. The same file names a `ts7` catalog alias that does not exist. `.github/workflows/dependency-graph.yml` states a removal condition that upstream has changed. `package.json` sets an `engines.node` floor below the `@types/node` floor. `codegraph.json` has an `include` key with no documented effect. Source: `reports/codebase-review/units/root-ci.md`, `root-config.md` and `root-lint-configs.md`.

## Why

A Dependabot pull request for an unlisted patched package fails installation until someone ports the patch by hand.

## Done when

A test fails when a patched dependency is missing from either ignore list, and the lists pass it. The alias comment names the real catalog keys. The dependency-graph comment states the current reason or the job is removed. The engines floor meets the types floor. The `include` key is explained from the tool's documentation or deleted.

## Evidence

Filled at landing: what ran and where its output is.
