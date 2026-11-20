---
kind: bug
status: open
updated: 2026-11-20
priority: P3
area: docs
---

# The background-removal model in the docker config is removed or built

## What

`docker/orbweaver.env:46` and `docker/README.md:258-260` describe a background-removal model that downloads at first use. No such task, slot or code path exists (`packages/contracts/src/inference/tasks.ts:15`). Delete both passages.

## Why

An operator plans disk and egress for a feature the app does not have.

## Done when

Neither file mentions a background-removal model, and a search of the docker files for it finds nothing.

## Evidence

Filled at landing: what ran and where its output is.
