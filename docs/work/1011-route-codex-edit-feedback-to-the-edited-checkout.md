---
kind: tooling
status: open
updated: 2026-10-13
priority: P2
area: tooling
plan: test-foundation
---

# Route Codex edit feedback to the edited checkout

## What

Codex patch feedback forwards event cwd to the shared checker. Absolute edits in linked worktrees retain main cwd and become ignored main-relative paths, so typecheck planning refuses them. Route subjects to their actual registered checkout without weakening repository, symlink or authored-file boundaries.

## Why

The routine edit feedback supplies no source verdict across lanes, forcing explicit scoped checks. This is a caller-context defect, not permission to accept ignored worktree paths as main source.

## Done when

Bounded hook controls cover main, linked checkout, multi-checkout edits, moves, deleted paths and foreign or symlink escapes. Each accepted group uses its real checkout and compiler owner. Failures stay explicit; existing host-load and source-only scheduling controls remain respected. No native-check flood or duplicated compiler pass.

## Evidence

Deferred while the main foundation program proceeds. Misrouted worktree paths produce an explicit planner refusal, not a false pass. Required scoped lane checks supply the missing feedback. Leave main-checkout feedback enabled; this item does not justify a global hook change or a competing implementation lane.
