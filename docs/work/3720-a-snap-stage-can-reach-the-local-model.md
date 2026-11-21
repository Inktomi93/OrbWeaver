---
kind: tooling
status: open
updated: 2026-11-21
priority: P2
area: tooling
---

# A snap stage can reach the local model for live-turn review

## What

A snap stage cloned from the container drops saved provider keys by design, and nothing seeds a connection on the stage from the repository env keys, so a reviewer cannot send a live turn. The e2e server already seeds OPENROUTER_API_KEY as the owner's credential (tests/e2e/support/README.md).

## Why

Notices, the Stopped mark and turn-time states need a live turn to review.

## Done when

A snap stage flag seeds a working connection from a named repository env key through the server's existing seed path, the key never appears in a log, report, screenshot or run.json, the snap-driving skill names the flag, and a tooling test proves the key stays out of the run output.

## Evidence

Filled at landing: what ran and where its output is.
