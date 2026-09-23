---
kind: work
status: open
updated: 2026-09-23
priority: P2
area: server
plan: plugin-distribution
---

# Build the three plugin install doors

## What

Build the install doors in `docs/plans/plugin-distribution/design.md`: load unpacked, folder upload, and a git-clone install with disclaimer text and no confirm step.

## Why

The owner commissioned these doors. Plugin origins are upload and URL only today.

## Done when

A plugin installs through each door, the git door records its source commit, and each door has an integration test.

## Evidence

Filled at landing: what ran and where its output is.
