---
kind: work
status: open
updated: 2026-11-28
priority: P3
area: server
plan: unwired-code
---

# Wire or drop the provider row's origin user

## What

The providers law (docs/law/Tier-3b-Providers.md) lets an admin add a provider as a row through the provider schema at runtime, and provider_rows carries an admin origin with origin_user_id, but no screen or route lets an admin create, edit or remove one; only tests register admin rows.

## Why

Owner ruling: build it. An admin should add a custom provider type without a code change or a plugin, and the row should say which admin added it.

## Done when

Admin settings has an editor that creates, edits and removes an admin provider row through the one provider schema, behind an admin-only route with a cross-tenant refusal test; the row shows who added it; endpoint URLs pass the egress allowlist; a CT covers the editor and an int test covers each verb through the router; a security-builder review passes.

## Evidence

Filled at landing: what ran and where its output is.
