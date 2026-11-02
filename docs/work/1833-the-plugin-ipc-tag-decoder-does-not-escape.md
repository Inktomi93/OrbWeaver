---
kind: bug
status: open
updated: 2026-11-02
priority: P3
area: security
---

# The plugin IPC tag decoder does not escape guest data shaped like a tag

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Filled at landing: what ran and where its output is.
`$orbUndefined` and `$orbBytes` in `packages/server/src/infra/plugin-host/process-protocol.ts` aren't escaped on encode, so guest data shaped like a tag decodes as `undefined` or `Uint8Array`. From reading; no harm shown. Area security. Also read unflagged boundary casts at `bridge-rpc.ts:391,392,460,463` and `membrane.ts:1062,1064`. Done: an escape round-trip test, casts parsed or justified.
