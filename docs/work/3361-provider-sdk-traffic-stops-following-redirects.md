---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: server
plan: cross-surface-consistency
---

# Provider SDK traffic stops following redirects

## What

SDK requests go through the configured endpoint fetch with redirects followed. The key stays on its host only because the runtime drops the authorization header on a cross-origin hop, and a row with a custom credential header would forward it.

## Why

The JSON fetch path already refuses redirects; the SDK path should not rest on the runtime's behaviour.

## Done when

The SDK path refuses or re-checks a cross-origin redirect, with a case using a custom credential header.

## Evidence

Filled at landing: what ran and where its output is.
