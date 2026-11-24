---
kind: tooling
status: doing
updated: 2026-11-24
priority: P3
area: client
lane: wt/agent-a8cf6e1a6f93ccf36
plan: unwired-code
---

# A bound select field holds a branded value

## What

SelectField (packages/client/src/forms/editor/bound-fields/select-field.tsx) is string-valued, so the run dialog bulk target targetOwnerId (packages/client/src/features/workloads/lib/workloads-model.ts) holds a user id as a string and run-workload-dialog.tsx re-narrows it with users.find. Make the field generic over its option value so a pick writes the matching option value found by lookup, with no cast; type targetOwnerId as UserId or empty and drop the re-narrow.

## Why

orb/no-raw-id reads brands by label since 3895 and reports targetOwnerId; it is the one red that change left on main.

## Done when

orb/no-raw-id reports nothing in workloads-model.ts; a CT proves a bulk import start call carries the picked user id.

## Evidence

Filled at landing: what ran and where its output is.
