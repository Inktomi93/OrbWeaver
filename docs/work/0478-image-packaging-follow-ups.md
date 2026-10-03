---
kind: work
status: open
updated: 2026-10-03
priority: P3
area: release
---

# Image packaging follow-ups

## What

Two findings from the Dockerfile lane: (1) typescript (about 31 MB) ships in the production node_modules as a peer of @trpc/server; decide whether a manifest change keeps it out of the prod graph. (2) COPY --link --chown makes /app owned by node; dropping --chown would make the code root-owned and read-only to the app user, after checking nothing writes under /app on a bare docker run.

## Why

Smaller image and a read-only code tree are cheap hardening.

## Done when

The image carries no typescript, or a ruling says why; /app ownership ruled with a smoke boot.

## Evidence

Filled at landing: what ran and where its output is.
