---
kind: bug
status: doing
updated: 2026-11-12
priority: P2
area: security
lane: wt/agent-a84eabc3e8d8f0a49
---

# The asset upload route admits each kind only from its own door and only the media its consumers render

## What

The avatar kind now accepts only bytes that carry an image signature. The same survey found the card, gallery, background and attachment kinds accept bytes their consumers cannot render, and the generated, document, plugin and export kinds have no client door on this route yet the route accepts them. The per-kind table is in the security lane's report for its thirteenth leg under reports/lanes.

## Why

A stored blob of the wrong type renders broken wherever it appears, and a kind the route has no client for is a path around the door that owns it.

## Done when

Each kind has its accepted media in a contracts table checked where the blob is stored, the route refuses kinds it does not serve, and a test per kind runs through the production route with a refused and an accepted file.

## Evidence

Filled at landing: what ran and where its output is.
