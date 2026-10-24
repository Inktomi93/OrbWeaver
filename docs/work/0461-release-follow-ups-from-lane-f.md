---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: release
---

# Release follow-ups from lane F

## What

Prove sharp, node-av and onnxruntime-node build on arm64 and add linux/arm64 to `.github/workflows/release.yml`, or rule arm64 out. Make the bug-report listing label (versionLabelOf in `tooling/src/bug-reports/lib/read.ts:78`) follow formatVersionIdentity; it prints `v<release> (<short>, <source>)`. Snap the Settings About section on a stable and a main build; the copy change has never been rendered. Wire actionlint into a check; no script, hook or workflow runs it.

## Why

Release images are amd64 only, the listing prints its own version format, the About copy has no rendered check, and no check lints the workflows.

## Done when

arm64 published or ruled out; the listing label matches formatVersionIdentity; actionlint runs on the workflows and passes; a snap shows both version lines and their update verdicts.

## Evidence

CI check: `.github/workflows/release.yml:9,103` and `.github/workflows/development-image.yml:51` publish linux/amd64 only. No workflow builds or tests linux/arm64.
