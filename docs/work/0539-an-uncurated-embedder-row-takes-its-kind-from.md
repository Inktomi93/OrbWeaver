---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: connection
---

# An uncurated embedder row takes its kind from the catalog

## What

A row's kind comes only from declared.kind or curated rows (domain/connection/substrate/kind.ts), so an OpenRouter embedder the catalog lists as kind embedding (e.g. baai/bge-base-en-v1.5) offers chat tasks and is refused connection_task_unservable until the user sets Purpose and width by hand. Found by the 0507 live matrix (scripts/probes/embed-width/RESULTS.md, observation 2).

## Why

Picking an embedder from the list should just work.

## Done when

A row whose catalog listing states kind embedding is an embedder without manual Purpose; its width comes from the probe; a live OpenRouter embedder binds in one step.

## Evidence

Filled at landing: what ran and where its output is.
