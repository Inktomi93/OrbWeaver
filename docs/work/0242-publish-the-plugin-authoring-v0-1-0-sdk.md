---
kind: work
status: blocked
updated: 2026-09-29
priority: P1
area: plugin
blocked: owner
plan: plugin-authoring
---

# Publish the plugin-authoring v0.1.0 SDK and toolchain release

## What

Cut the `plugin-authoring-v0.1.0` GitHub Release carrying `orb-plugin-sdk-0.1.0.tgz` and `orb-plugin-toolchain-0.1.0.tgz`, then run `pnpm install` in both starter repositories (Inktomi93/orb-plugin-template-server, Inktomi93/orb-plugin-template-visual) and commit their lockfiles.

## Why

Both starters pin those release assets. Until the release exists their install step and CI stop by design, so no author can use them. The orbweaver and starter repositories are private, so the assets need a location an author can fetch without credentials.

## Done when

Both starters install with `pnpm install --frozen-lockfile` from a clean clone without credentials and their CI passes.

## Evidence

Filled at landing: what ran and where its output is.
