---
kind: tooling
status: open
updated: 2026-09-30
priority: P3
area: tooling
---

# Close the tooling gaps the cb-tools review found

## What

Three gaps. The gitignored-segment exemption in tooling/src/\_shared/prose-references.ts never checks existence below an existing ignored directory, so a typo like dist/bundlez passes. Nothing pins that a real CT failure with the browser present exits 1. The cloud Playwright revision hook has never run in a real cloud session.

## Why

The first gap lets a dead citation through the agent-config check once a build directory exists. The second leaves half of the CT exit contract unguarded. The third is shipped but unproven.

## Done when

A path under an existing ignored ancestor must exist to pass, with a test. A test plants a real CT failure and asserts exit 1. One real cloud session shows the hook set PLAYWRIGHT_BROWSERS_PATH and a CT run launched.

## Evidence

Filled at landing: what ran and where its output is.
