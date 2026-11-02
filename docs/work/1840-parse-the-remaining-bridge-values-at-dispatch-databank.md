---
kind: bug
status: open
updated: 2026-11-02
priority: P3
area: security
---

# Parse the remaining bridge values at dispatch: databank ingest recordAt and requestTurn hints

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Filled at landing: what ran and where its output is.
Remaining unparsed bridge values. `databank.ingest` in `bridge-rpc.ts` casts `recordAt` to `{ name, text }`; `chat.requestTurn` passes `recordAt` through as hints, so a non-string `speakerCharacterId` is not parsed there. Done: both parse at dispatch or are justified.
