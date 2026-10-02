---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: release
---

# Release follow-ups from lane F

## What

Prove sharp, node-av and onnxruntime-node build on arm64 and add linux/arm64 to release.yml, or rule arm64 out. Make the bug-report listing label (versionLabelOf in tooling/src/bug-reports/lib/read.ts) follow the new version line. Fix shellcheck SC2174 on mkdir -p -m 0777 in install.yml. Snap the Settings About section on a stable and a main build; the copy change has never been rendered.

## Why

Release images are amd64 only, the listing still prints the old version format, install.yml carries a shellcheck warning, and the About copy has no rendered check.

## Done when

arm64 published or ruled out; the listing label matches formatVersionIdentity; actionlint clean on install.yml; a snap shows both version lines and their update verdicts.

## Evidence

Filled at landing: what ran and where its output is.
