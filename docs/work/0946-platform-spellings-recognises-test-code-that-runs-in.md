---
kind: tooling
status: open
updated: 2026-10-12
priority: P2
area: tooling
plan: test-mirror
---

# platform-spellings recognises test code that runs in the page

## What

platform-spellings treats only packages/client and packages/ui as browser roots, so test code that runs in the page (page.evaluate callbacks and mounted CT fixtures) is told to use node:timers/promises, which does not exist there. The item 892/906 lane left reasoned waivers on those sites. Teach the gate that an in-page callback or browser-world test module is browser code, judged by the test-kinds world and the evaluate boundary, with planted controls.

## Why

A gate that demands a node API in browser code forces waivers on correct code.

## Done when

The gate judges in-page test code as browser code, the reasoned waivers on those sites are deleted, and the budget row falls to the measured count.

## Evidence

Filled at landing: what ran and where its output is.
