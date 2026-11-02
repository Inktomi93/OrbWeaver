---
kind: bug
status: open
updated: 2026-11-02
priority: P3
area: security
---

# Parse the remaining bridge values at dispatch: databank ingest recordAt and requestTurn hints

## What

The app-side bridge dispatch in `packages/server/src/infra/plugin-host/bridge-rpc.ts` parses `databank.ingest` with `databankTextDocumentSchema` and `chat.requestTurn` hints with the turn-hint schema its ask arm already used. The hint's steer takes chat's own `GUIDED_STEER_INPUT_MAX`, now exported from `packages/contracts/src/chat/metadata.ts`, for both the direct turn and the ask. `databankTextDocumentSchema` moved from the tRPC router into `packages/contracts/src/databank/index.ts`, so the router and the bridge share it.

Also in this item: a guest variable write the realm cannot serialize refuses. The QuickJS `dump` returns a string fallback when the realm's own `JSON.stringify` fails, so an 11 MiB op list reached the membrane as a string. `chat.applyVariableOps` read the string as no ops and answered `applied`. The membrane now refuses an object argument that reads back as a string, and it refuses a non-list op argument.

## Why

A forged broker frame could hand the databank a non-text name, and chat a non-id speaker. The dispatch is the trust boundary for broker data, so each value must parse there with its owning schema. A write that silently applies nothing tells the guest a write landed.

## Done when

A forged frame with a non-text document name, or with a non-id speaker hint, is refused at dispatch with `TypeError`. A steer one character past the cap is refused before it becomes an ask; a steer at the cap is asked. An 11 MiB value and a non-list op argument both refuse, and the room keeps its earlier variables.

## Evidence

`tests/server/infra/plugin-host/bridge-call-parsing.int.test.ts`. On the old source: the forged name ingested a document, the forged speaker reached chat and failed as `ChatNotFoundError`, and the 11 MiB write returned `applied` with nothing written. All pass after the fix. With only the dump guard, the 11 MiB case refuses and the non-list case still applies. With only the list guard, the 11 MiB case refuses, which shows the argument arrived as a string. The steer cap case in `tests/server/domain/automation/verbs/plugin-ask-confirm.int.test.ts` failed before the cap: the over-cap steer became an ask.
