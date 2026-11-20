---
kind: decision
status: open
updated: 2026-11-14
priority: P3
area: connection
---

# Browse a provider's models without adding a connection

## What

Connections gains a Browse models view as a content state of the section, never a modal. It lists the providers whose catalogs need no key, with each provider's models and their stated capabilities. A pick opens Add a connection with the provider and model filled in. A provider whose list needs a key shows its curated rows and says the full list appears after the key.

## Why

Owner ruling. A person choosing a provider cannot compare models today without starting a connection draft and entering a key.

## Done when

A component test on the production Connections surface opens Browse models, shows a keyless provider's models, and a pick opens Add a connection with that provider and model set. A provider that needs a key shows the curated rows and the stated reason. No draft is saved by browsing.

## Evidence

Filled at landing: what ran and where its output is.
