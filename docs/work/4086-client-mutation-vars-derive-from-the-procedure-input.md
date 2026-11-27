---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: client
plan: unwired-code
---

# Client mutation vars derive from the procedure input they send

## What

orb/derived-port-member (tooling/src/eslint/derived-port.ts) refuses a local type only when a contract value flows into it as a call argument and it repeats two or more fields. It misses: a hand-written type given as a generic type argument where the library binds it to a tRPC procedure's input or output (createEntityMutation\<TVars, TData> beside mutationOptions(), as in the client's reap and detach hooks); a one-field type that is the procedure's whole result; and a Vars interface that restates the procedure input it is sent to (packages/client/src/components/regex-mutations.ts, packages/client/src/features/automation/lib/rule-mutations.ts, packages/client/src/features/chat/hooks).

## Why

A restated wire shape is a second home: it drifts from the contract silently and hid reads from the unwired graph, which led to false deletes.

## Done when

The rule refuses each missed shape with a red-first fixture case and a twin it still accepts (a client-only composite vars type that names its procedure input), every production site derives from inferInput or inferOutput or the contracts type, and the rule passes at zero on the tree.

## Evidence

Filled at landing: what ran and where its output is.
