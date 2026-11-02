---
kind: bug
status: open
updated: 2026-11-02
priority: P2
area: client
---

# The background-upload CT fails on main: the saved upload record is missing

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Filled at landing: what ran and where its output is.

`tests/client/features/app-shell/components/background-upload.ct.tsx:34`: `toMatchObject` receives `undefined` from `saved.at(-1)`. It fails on main at 8476858b56, 74545057a3 and 610ce8014e, before and after 1815, and it reproduces alone. Find the commit that broke it, then fix the product or the test, whichever is wrong.
Lead: the last commits to touch the test or its component are the type-law T5/T7 commits (132fb27c36, fa46d7a2e6, branded ids through their slots). Start there.
