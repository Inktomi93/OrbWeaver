---
kind: work
status: doing
updated: 2026-10-06
priority: P1
area: plugin
lane: codex/launch-packages
plan: plugin-authoring
---

# Ship standalone QuickJS plugin author templates

## What

Publish two standalone starter repositories using the public SDK and author toolchain: one for server behavior, and one for visual plugins. The visual starter teaches scripted house UI and custom frames as separate examples. Each default branch contains checked built entries that Orbweaver can install from its Git URL. Each repository includes an author guide, locked dependencies, and CI.

## Why

A plugin author needs a repository they can copy without the Orbweaver monorepo or an app installation. Editor types and hook discovery must work from that repository alone. A template must teach the correct QuickJS or isolated-frame boundary and produce files the app can install directly.

## Done when

Both repositories build and test outside the monorepo against versioned GitHub-hosted SDK and toolchain packages. Both visual examples build and install independently. An editor resolves main, UI, and frame types from locked dependencies in an arbitrary directory. Unsupported host calls fail typechecking without loose global casts. Generated JavaScript passes freshness checks, pack validation, and real install acceptance. A person can paste the default repository's Git URL into Orbweaver, review consent, and enable it without building or cloning locally. The guide walks through a first plugin and lists supported host calls, events, action placements, and live surface mounts against checked adapters. It points to the showcase plugins and explains state, lifecycle, visuals, assets, and the TypeScript/JSX boundary. It covers the one-command build, consent, versions, updates, and troubleshooting. Every documented hook has an acceptance path rather than an inferred declaration-only promise.

## Evidence

Filled at landing: what ran and where its output is.
