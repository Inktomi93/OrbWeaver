---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: regex
---

# Pick a stored account selector by name in the regex author lists

## What

Give the user selector a picker over people the owner shares rooms with, and show the person's name on its row.

## Why

A user selector arriving in a file lists as 'One person, by account' with only a remove control (packages/client/src/features/regex/components/regex-author-scope-fields.tsx (on its branch)), so its owner cannot see who it names.

## Done when

A user selector row shows the person's name, and the add menu can add one.

## Evidence

Filled at landing: what ran and where its output is.
