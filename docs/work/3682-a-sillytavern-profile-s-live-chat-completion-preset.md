---
kind: work
status: open
updated: 2026-11-20
priority: P2
area: import
plan: test-foundation
---

# A SillyTavern profile's live chat-completion preset has a test that proves it lands

## What

The profile import reads the live chat-completion preset from settings.json in packages/server/src/domain/import/loader/collect.ts, and the profile inventory marks it imported. No test runs a profile through the import door and asserts the preset row it writes.

## Why

The inventory claims a kind imports with no test behind the claim, so a break in that read ships unseen.

## Done when

An integration test imports a real-shaped profile through the composed import door and asserts the stored preset matches the settings.json preset, red against a planted break in the read.

## Evidence

Filled at landing: what ran and where its output is.
