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

- Red on the old code: `tests/server/infra/plugin-host/process-value-escape.int.test.ts` failed every marker-shaped value across the bridge frame, result frame and synchronous reply. A real guest's `setCardData` lost a `$orbUndefined` key and read a `$orbBytes` value back as `{ "0": 104, "1": 105 }`.
- Red on the old code: `tests/server/infra/plugin-host/bridge-call-parsing.int.test.ts` showed a guest's `{ op: "set", key: "scene" }` accepted, then the room's earlier `mood` variable erased at the next write. Forged frames for variable ops, preconditions, quick replies, picture args and picture asks all passed the app boundary.
- Green: both suites plus `tests/server/infra/plugin-host` and `tests/server/domain/plugin` `substrate`, `verbs` and `activation`.
- The fix escapes every data key in the `$orb` prefix in `packages/server/src/infra/plugin-host/process-protocol.ts`. Casts in `bridge-rpc.ts` and `membrane.ts` now parse with their schemas.

`$orbUndefined` and `$orbBytes` in `packages/server/src/infra/plugin-host/process-protocol.ts` aren't escaped on encode, so guest data shaped like a tag decodes as `undefined` or `Uint8Array`. From reading; no harm shown. Area security. Also read unflagged boundary casts at `bridge-rpc.ts:391,392,460,463` and `membrane.ts:1062,1064`. Done: an escape round-trip test, casts parsed or justified.
