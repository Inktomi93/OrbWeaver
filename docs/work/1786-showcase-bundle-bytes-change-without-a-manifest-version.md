---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: plugins
plan: unwired-code
---

# Showcase bundle bytes change without a manifest version bump, so seeded installs keep the old bytes

## What

Add a check that fails when a showcase bundle file hash in `packages/showcase-plugins/release-entries.json` changes against the base and the bundle manifest version does not.

## Why

A seeded install keeps the bytes it already has when the version is unchanged (`packages/server/src/domain/plugin/seeder/showcase.ts` upgrades only when a newer version ships), so a changed bundle never reaches existing installs. The release file is read only by `tooling/src/plugin-author-showcase`, and nothing compares versions.

## Done when

A planted showcase bundle with changed bytes and the same version fails the check. The same bundle with a bumped version, and an unchanged bundle, pass.

## Evidence

Filled at landing: what ran and where its output is.
