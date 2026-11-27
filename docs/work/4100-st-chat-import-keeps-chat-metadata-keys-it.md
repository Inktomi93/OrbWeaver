---
kind: bug
status: open
updated: 2026-11-27
priority: P3
area: import
---

# ST chat import keeps chat_metadata keys it does not parse

## What

ParsedChat.sourceMetadata was meant as the lossless copy of SillyTavern chat_metadata, but nothing read it and the old fields scan dropped it, so metadata keys beyond the parsed ones are lost on import.

## Why

The import records every loss, and a lossless claim about ST chats is false while these keys vanish.

## Done when

Unparsed chat_metadata keys are kept and re-exported, or the import notes name each dropped key, with an int test over an ST chat that carries extra keys.

## Evidence

Filled at landing: what ran and where its output is.
