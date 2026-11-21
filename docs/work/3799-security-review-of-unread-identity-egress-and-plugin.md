---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: security
plan: unwired-code
---

# Security review of unread identity, egress and plugin budget fields

## What

PluginInstanceCreateData.budgets reaches the plugin host's limits (packages/server/src/infra/plugin-host/port.ts) and no caller sets it; ViewerVisibility.role, SafeFetchResult.contentType and SessionAdminView\.userId have no production reader.

## Why

An unused override that can change sandbox limits, and unread fields on visibility, egress and admin sessions, sit on trust boundaries.

## Done when

A security-builder review records keep or remove for each field with its reason, and the ruled changes land with their tests.

## Evidence

Filled at landing: what ran and where its output is.
