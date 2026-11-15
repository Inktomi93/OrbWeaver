---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: regex
plan: import-robustness
---

# Hint in the regex editor that raw find substitution makes a name pattern text

## What

Beside the raw choice of the find pattern's macro substitution in `packages/client/src/features/regex/components/regex-editor-fields.tsx`, add one line saying that a substituted name, such as a member's persona name under `{{user}}`, becomes pattern text, and that escaped mode matches it literally.

## Why

In raw mode another person's text is compiled into the host's pattern. The executor now refuses a substitution that adds more than a bound set at a multiple of the name cap, so a prose field cannot be pulled in, but a name still lands in the pattern as source, and a per-turn macro makes it compile again each turn. The author should know whose text lands in their pattern.

## Done when

The raw choice shows the hint, and the escaped choice does not.

## Evidence

Filled at landing: what ran and where its output is.
