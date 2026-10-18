---
kind: tooling
status: doing
updated: 2026-10-18
priority: P2
area: tooling
lane: wt/agent-a86bb1a8ff46c7295
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

Automatic Codex edit feedback is disabled by owner ruling in `.codex/hooks.json`. Retained session commands do not invoke the checker. Required manual scoped checks supply source verdicts. Routing repair is active; this item does not authorize re-enabling automatic feedback. Independent review rejects first-edit baseline authority, symlink escape and incomplete compiler output. Preserve explicit refusals and linked-checkout controls. Evidence: `reports/review/1011-hook-checkout-independent.md`.
