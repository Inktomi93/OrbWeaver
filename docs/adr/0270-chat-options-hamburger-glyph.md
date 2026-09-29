---
kind: adr
status: active
updated: 2026-09-29
---

# Chat options uses a hamburger glyph in the composer

## Context

The left composer menu reads as an overflow menu even though it opens chat options.

## Decision

The existing Chat options control in the composer left gutter uses the hamburger glyph. It retains the same menu contents, trigger, accessible name, and placement. This decision clarifies the glyph in D111 clause (3); its control map and other rulings remain active. The client chat options component owns the glyph.

## Consequences

The composer has one recognizable chat options door without adding another menu.

## Alternatives rejected

Keep the three-dot glyph: it obscures the menu purpose in the dense composer.
