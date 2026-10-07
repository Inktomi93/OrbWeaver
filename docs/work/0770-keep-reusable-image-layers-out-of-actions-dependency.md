---
kind: tooling
status: doing
updated: 2026-10-07
priority: P2
area: release
lane: codex/ci-dependency-upgrade
---

# Keep reusable image layers out of Actions dependency cache storage

## What

Keep dependency and browser cache writes on trusted workflows. Store image build layers in the container registry instead of Actions cache storage.

## Why

PR-private cache copies consume storage that main cannot reuse. Image cache exports compete with dependency caches and slow release builds.

## Done when

PR runs restore without saving private copies. Image workflows retain intermediate build layers and preserve scan, identity and publication checks. Focused workflow tests pass; live cache-hit limits are explicit.

## Evidence

Focused workflow and cache controls pass. Dependency and browser restores use exact platform and version keys. Trusted triggers own cache writes. Verified image builds export separate registry caches before runtime publication.

The live Actions cache inventory confirms removal of obsolete closed-PR entries. Registry hit rates, export timing and publication behavior require a hosted run. No build-speed improvement is claimed.
