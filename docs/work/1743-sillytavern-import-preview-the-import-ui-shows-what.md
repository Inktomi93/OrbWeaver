---
kind: work
status: open
updated: 2026-11-01
priority: P2
area: client
plan: unwired-code
---

# SillyTavern import preview: the import UI shows what would be imported before it runs, wired from importStWorkloadParams.dryRun (owner: build)

## What

Picking a SillyTavern folder runs the `import-st` workload as a dry run, and the import preflight shows its counts, names and skip reasons before the owner confirms or cancels.

## Why

`importStWorkloadParams.dryRun` had no user-facing sender, and the owner ruled to build on it. An import was only described after it ran.

## Done when

- A picked SillyTavern folder shows counts and names per kind, and what would be skipped and why.
- Same-name persona collisions show in the same preflight, with their merge or keep-both choice.
- A dry run changes no row in any table except its own `workloads` row, and removes its staged tree.
- Cancel writes nothing and stops the running dry run. A failed preview leaves Import available.
- A `.zip`, a card file and an Orbweaver backup folder keep their preflight, with no dry run.

## Evidence

Filled at landing: what ran and where its output is.
