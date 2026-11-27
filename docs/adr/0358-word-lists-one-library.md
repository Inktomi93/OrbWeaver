---
kind: adr
status: active
updated: 2026-11-26
---

# Word lists: one library for bias, bans and slop

## Context

Logit bias, banned phrases and slop lists are all a phrase with a strength, edited today in separate per-preset editors, and a native slop list needs large lists with import, search and bulk edit. Engines differ: llama.cpp takes word keys but bans every token of a phrase, vLLM and KoboldCpp take only token ids for logit bias, and only KoboldCpp and the antislop proxy ban a phrase as a sequence.

## Decision

One Word lists library in settings holds named lists of phrases, each with one effect on a single scale from boost through push down to ban. A preset attaches lists by name and keeps a few inline extras; the preset's slop list points at a library list. One import path takes plain text, JSON, the antislop format and SillyTavern logit bias, with merge and duplicate rules. Users enter words only; orbweaver routes each entry to the connection's mechanism (logit bias through the server's tokenizer where it takes ids, the server's own phrase ban, the antislop proxy, or the native backtracking ban) and shows per entry what the active connection will do. Character and user names are always allowed. The native ban and slop bias run only on unmetered rows that declare prefill and logit bias; a metered connection says the lists are not used. DRY sequence breakers stay inline chips in the preset.

## Consequences

The per-preset logit bias editor and banned phrase chips are replaced by attachment plus inline extras, with a migration of existing preset values into inline extras. Not yet built; work item 4044 carries it, and a UX review runs before the build.

## Alternatives rejected

A fourth per-preset editor for slop lists: rejected, it duplicates lists across presets and adds a fourth import path. Typing token ids: rejected, every supported engine has a tokenize endpoint or takes words.
