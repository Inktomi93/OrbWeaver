---
kind: work
status: open
updated: 2026-11-06
priority: P3
area: client
plan: unwired-code
---

# Plugin macro links and resolution edge cases

## What

A plugin link pressed before plugin.list loads leaves focus on the link, because the config landing looks for the card once. A never-settling macro delays its own plugin's sibling macros. The diagnostics drawer lists a legacy alias as its own registered entry. Automation rule fields offer no macros, which under-offers builtins.

## Why

Each is a small gap in the macro work that the first pass left outside its scope.

## Done when

A cold link lands focus on the card, a stalled macro leaves its siblings on time, an alias shows beside its macro, and automation fields offer what resolves there.

## Evidence

Filled at landing: what ran and where its output is.
