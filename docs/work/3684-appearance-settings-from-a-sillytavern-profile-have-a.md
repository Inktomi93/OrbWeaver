---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: import
plan: test-foundation
---

# Appearance settings from a SillyTavern profile have a folder-import test

## What

Appearance settings in packages/server/src/domain/import/loader/collect.ts import from a profile, and only a unit test covers the mapping. No folder import run asserts them.

## Why

The mapping can pass while the folder run never applies it.

## Done when

A folder-import integration test asserts the stored appearance settings, red against a planted break.

## Evidence

Filled at landing: what ran and where its output is.
