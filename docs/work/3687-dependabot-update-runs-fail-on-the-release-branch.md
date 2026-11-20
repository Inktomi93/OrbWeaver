---
kind: bug
status: open
updated: 2026-11-20
priority: P3
area: ci
---

# Dependabot update runs fail on the release branch

## What

The Dependabot Updates workflow runs on the release branch fail, while the same runs on main pass.

## Why

Security updates for the release line can stop arriving with no other signal.

## Done when

The cause is found from the failed run logs, and Dependabot either runs green on the release branch or is configured to target main only with the reason recorded.

## Evidence

Filled at landing: what ran and where its output is.
