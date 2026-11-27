---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: release
---

# Release follow-ups from lane F

## What

Make the bug-report listing label (versionLabelOf in tooling/src/bug-reports/lib/read.ts) follow formatVersionIdentity; it prints its own format. Snap the Settings About section on a stable and a main build; the copy has never been rendered. Wire actionlint into a check; no script, hook or workflow runs it. Owner ruling: release images stay linux/amd64; arm64 is out.

## Why

Release images are amd64 only, the listing prints its own version format, the About copy has no rendered check, and no check lints the workflows.

## Done when

The listing label matches formatVersionIdentity; actionlint runs on the workflows and passes; a snap shows both version lines and their update verdicts.

## Evidence

CI check: `.github/workflows/release.yml:9,103` and `.github/workflows/development-image.yml:51` publish linux/amd64 only. No workflow builds or tests linux/arm64.
