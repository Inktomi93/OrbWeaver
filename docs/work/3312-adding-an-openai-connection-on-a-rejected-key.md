---
kind: bug
status: doing
updated: 2026-11-15
priority: P2
area: connections
lane: wt/agent-aaaef4a406560836a
---

# Adding an OpenAI connection on a rejected key shows raw JSON and saves anyway

## What

When the model list call returns an auth refusal such as an expired key, the dialog prints the provider's raw JSON error body under the model field, offers "Try the list again" (which cannot help), and still saves the connection on the refused key.

## Why

A first user gets a code dump instead of "your key expired", and ends up with a connection that fails on its first turn.

## Done when

An auth refusal on the model list reads as one plain sentence naming the problem and where to get a new key, offers no retry, and warns before Save that the provider refused the key.

## Evidence

Filled at landing: what ran and where its output is.
