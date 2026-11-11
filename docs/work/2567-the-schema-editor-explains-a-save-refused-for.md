---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: client
---

# The schema editor explains a save refused for nesting depth

## What

The server refuses a draft schema nested past the depth cap with the code json_max_depth_exceeded. The schema editor's message for that refusal has not been reviewed on the rendered surface.

## Why

A refusal the user cannot read is a dead end. The message must say what to change.

## Done when

A rendered review shows the schema editor's message when a save is refused with json_max_depth_exceeded, the message names the depth limit as the cause, and a component test drives the refusal through the editor.

## Evidence

Filled at landing: what ran and where its output is.
