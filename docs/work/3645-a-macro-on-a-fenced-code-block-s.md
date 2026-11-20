---
kind: bug
status: doing
updated: 2026-11-20
priority: P3
area: kit
lane: wt/agent-a4d098f9b2f799d95
plan: chat-html-and-presets
---

# A macro on a fenced code block's info line is not read as code

## What

markdownCodeAfterMacros counts the opening line of a fenced code block as code, while the renderer draws the info string as a label and a class value.

## Why

Inert today, but it is a disagreement the kit and renderer differential must not carry.

## Done when

Code stretches start at the first content line, or the info string is ruled code with a recorded reason.

## Evidence

Filled at landing: what ran and where its output is.
