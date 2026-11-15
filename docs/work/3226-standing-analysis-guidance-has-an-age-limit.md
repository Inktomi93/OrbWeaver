---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: automation
---

# Standing analysis guidance has an age limit

## What

Analysis guidance is injected every turn while its rule is enabled and never expires. Stamp guidance with the beat it was written at and stop injecting it after a stated number of beats, or have the rule editor state that it never expires.

## Why

Guidance about a scene that ended keeps steering the story.

## Done when

A test shows guidance stopping after its limit, or the editor text states that it never expires.

## Evidence

Filled at landing: what ran and where its output is.
