---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: server
---

# A regex replacement whose macros pass the budget empties its match silently

## What

Lead, not probed. `buildReplacement` in `packages/kit/src/regex/index.ts` renders a script's replacement template through `processMacros`, which degrades to an empty string when the template's render passes the macro byte budget. On the persisting USER_INPUT and AI_OUTPUT passes the match is replaced with nothing and the message is stored that way. The template is host-authored.

## Why

The same silent loss the send-path macro fix closed, one layer down: stored text changes with no refusal and no warning.

## Done when

A probe confirms or refutes it; if confirmed, the persisting regex passes use `processMacrosOutcome` and refuse or skip the script with a named outcome, with a case through the composed root.

## Evidence

Filled at landing: what ran and where its output is.
