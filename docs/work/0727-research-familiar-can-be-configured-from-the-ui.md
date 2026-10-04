---
kind: bug
status: open
updated: 2026-10-04
priority: P1
area: plugin
---

# Research Familiar can be configured from the UI

## What

((lookup: …)) logs 'no lore book configured — set {{setglobalvar::familiar_book_id::<book id>}}', but chat messages do not evaluate macros and the plugin has no settings surface; only an automation rule or the developer console can write the variable. ((clip: …)) depends on net.fetch, which is broken (0697). Final pass leg 2 (plugins); review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-2-plugins.md.

## Why

The plugin cannot be switched on by a user.

## Done when

The plugin has a settings surface with a lore book picker that writes its variable, the README drops the setglobalvar instruction, and a lookup works once a book is chosen, with a test.

## Evidence

Filled at landing: what ran and where its output is.
