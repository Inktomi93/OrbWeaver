---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: security
plan: cross-platform
---

# The boot scrub matches reserved and database names without regard to case

## What

`scrubAppSecretsFromProcessEnv` in `packages/server/src/foundation/env/index.ts` and `isSecretEnvKey` in `packages/server/src/foundation/env/record/index.ts` compare environment names case-sensitively. On Windows a lower-case spelling of a reserved or database name is the same variable to the parse and to every child, so it survives the scrub. Reasoned from the documented Windows behaviour; not yet run on Windows.

## Why

The product ships native Windows, and a secret that survives the scrub reaches every child process.

## Done when

Both compare upper-cased names, and a unit case that runs on every platform plants a lower-case reserved key and a lower-case database name and shows them scrubbed, red first.

## Evidence

Filled at landing: what ran and where its output is.
