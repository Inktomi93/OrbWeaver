---
kind: work
status: open
updated: 2026-11-22
priority: P3
area: client
plan: unwired-code
---

# The connection editor places each refusal on its field

## What

Ten CONNECTION_OP_CODES members reach the client with no branch: not_found, label_empty, provider_unknown, api_incoherent, base_url_shape, model_not_in_catalog, model_id_shape, credential_foreign, actor_task_unrouted, task_unservable.

## Why

The contracts header says the client keys on these codes; today they reach the person as a generic failure.

## Done when

Each code lands on its field or binding row with its own copy, typed through the reason union from 3835, and pnpm unwired codes lists none of them.

## Evidence

Filled at landing: what ran and where its output is.
