---
kind: tooling
status: open
updated: 2026-10-04
priority: P3
area: tooling
---

# Snap keeps typed secrets out of run files and session logs

## What

snap persists every --fill value verbatim into run.json and the session log, so a key typed into a connection form lands on disk.

## Why

Reviews that need a live connection cannot type a provider key through snap safely.

## Done when

A fill can take its value from an environment variable and is redacted in every artifact snap writes, with a test.

## Evidence

Filled at landing: what ran and where its output is.
