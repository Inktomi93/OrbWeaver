---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: client
---

# The model picker and the fact editor show plain words, not parser output or raw option names

## What

A list whose `data` is not an array shows the raw zod issue JSON as the picker's failure reason, and the Advanced fact editor offers the raw `modelInfoApi` names (`nanogpt`, `literouter`) and the new `keyCheckPath` and `forbiddenIsNotCredentialVerdict` rows in our property spelling. Give the failure a sentence and the options labels.

## Why

A user reading the pane sees implementation vocabulary where the rest of the pane speaks plainly.

## Done when

A malformed list shows a one-line reason with no JSON, and each new option in the fact editor has a plain label; ux-reviewer signs off on the rendered pane.

## Evidence

Filled at landing: what ran and where its output is.
