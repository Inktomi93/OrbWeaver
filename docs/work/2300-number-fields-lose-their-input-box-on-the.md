---
kind: bug
status: doing
updated: 2026-11-09
priority: P2
area: ui
lane: wt/agent-a3238f16751f90318
plan: cross-surface-consistency
---

# Number fields lose their input box on the phone at enlarged text

## What

On the phone at enlarged text a number field's input renders with no visible box: the World Info entry Depth field at 200% and 300%, and the Library Rows per page field at 300%.

## Why

The value cannot be read or edited at enlarged text.

## Done when

Depth and Rows per page are visible and editable at 200% and 300% on chromium-phone-portrait; Config independent category worldInfo and Config reversible settings pass there.

## Evidence

Filled at landing: what ran and where its output is.
