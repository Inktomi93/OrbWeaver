---
kind: bug
status: open
updated: 2026-11-25
priority: P3
area: plugin
---

# The stored-source plugin update review states standing refusals and names providers by label

## What

The update review a stored URL or Git upgrade opens says the update asks for nothing beyond what the owner allowed while an earlier refusal still stands, so after Apply the plugin stays disabled pending approval; and it lists raw provider ids such as plugin:ledger/vision where the consent card shows labels.

## Why

The review exists so the owner knows what an update changes; telling them it asks for nothing and then leaving it disabled, or naming providers by internal id, defeats it.

## Done when

The review names a standing refusal and says the plugin stays off until it is answered, provider rows show the labels the consent card shows, with a CT each.

## Evidence

Filled at landing: what ran and where its output is.
