---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: server
plan: unwired-code
---

# Wire or drop the provider row's origin user

## What

provider_rows.origin_user_id has no product writer: the registry's register with an admin is called only from tests, so the admin surface can never show who added a provider.

## Why

Unwired code is a question about intent: a column only tests fill is either a missing admin door or dead schema.

## Done when

An admin provider door writes the column and the admin surface shows it with a CT, or the column leaves the schema with its reason after its history is read.

## Evidence

Filled at landing: what ran and where its output is.
