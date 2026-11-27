---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: auth
lane: wt/agent-ad0816928eb62737d
plan: unwired-code
---

# Decide whether the Principal carries externalId

## What

Principal.externalId (packages/contracts/src/identity/index.ts) is set at the auth seam and no code reads it off the Principal; readers take externalId from the user row. The viewer schema warns that a spread Principal would carry it.

## Why

An identity field nothing reads on the request principal widens what a spread can leak.

## Done when

A security-builder review records whether the Principal keeps externalId, with its reason, and the change it rules lands with its auth tests.

## Evidence

Filled at landing: what ran and where its output is.
