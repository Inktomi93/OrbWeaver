---
kind: tooling
status: open
updated: 2026-11-06
priority: P3
area: tooling
plan: test-enforcement
---

# generate-plugin-author-support --check is format-aware and runs in a check, or is deleted

## What

Make scripts/generate-plugin-author-support.ts --check compare against the formatted file it generates and run it in a check, or delete the script and its generated file.

## Why

The --check mode compares the raw JSON.stringify output with the bytes on disk. packages/plugin-toolchain/src/support.generated.ts is committed formatted, so the comparison cannot be trusted, and no package script runs it.

## Done when

Either a root check runs the generator in check mode and passes on the committed file and fails when a contract registry changes, or the script and the generated file are gone and nothing imports them.

## Evidence

Filled at landing: what ran and where its output is.
