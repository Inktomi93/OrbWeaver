---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: tooling
plan: cross-surface-consistency
---

# The scroll-driven motion allowance admits only what the ruling covers

## What

packages/kit/src/motion-allowance/index.ts admits any property on a scroll or view timeline, so a scroll-timeline width animation scores no dirty frames and reports an exemption citing the scroll-driven fade ruling in ui-platform-rulings §8.4, which covers fades only.

## Why

The motion instrument now passes a layout animation the law forbids, so a real defect would read as allowed.

## Done when

The allowance admits only an empty property set or compositor-safe and mask properties on a scroll or view timeline, and a planted scroll-timeline width animation fails the instrument test.

## Evidence

Filled at landing: what ran and where its output is.
