---
kind: tooling
status: open
updated: 2026-09-24
priority: P1
area: tooling
---

# Make a fresh machine install without manual workarounds

## What

Three snags hit a fresh machine. (1) Pin Node through devEngines.runtime in the root package.json so pnpm installs Node 26 itself; with pnpm 12 the lockfile entry needs checksums from unofficial-builds.nodejs.org, so generate it on a machine with open egress. (2) onnxruntime-node's postinstall downloads from api.nuget.org and fails the whole install behind a proxy; make that download lazy or non-fatal. (3) Playwright CT needs its exact browser build; name the one-time pnpm exec playwright install step where setup is documented.

## Why

The goal is that the app runs on everyone's machine with pnpm install and pnpm start.

## Done when

A clean machine with only pnpm installs, starts and runs one CT file with no manual step beyond the documented browser install.

## Evidence

Filled at landing: what ran and where its output is.
