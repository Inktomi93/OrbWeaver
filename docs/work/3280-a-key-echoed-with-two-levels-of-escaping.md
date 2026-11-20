---
kind: decision
status: open
updated: 2026-11-15
priority: P3
area: inference
---

# A key echoed with two levels of escaping stays readable in provider error text

## What

The scrub that removes a key from a provider's error text decodes one level of JSON escaping. A body that echoes the key with a doubly escaped character, or inside a nested JSON string, or past the read cap, shows part of the key in the user's error line.

## Why

A provider that echoes the request key in an error is rare but real, and the line is shown to the user and can reach a log.

## Done when

A recorded ruling says whether the decode widens by one level or the one-level limit is accepted for provider error text, with a case if it widens.

## Evidence

Filled at landing: what ran and where its output is.
