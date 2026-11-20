---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: tests
plan: test-foundation
---

# The You sheet's focus return and the phone touch cases have tests that can fail

## What

Reverting the focus return to the declared You tab in packages/client/src/features/app-shell/components/modal-host.tsx leaves every You sheet case green, because a Playwright tap already focuses the tab. The webkit CT project runs only files in its testMatch list in playwright-ct.config.ts, and the touch-drag helper needs CDP, so the keyboard drag guard and the drawer clip cases cannot run on WebKit.

## Why

A test that passes with the behaviour removed proves nothing, and Chromium-only touch cases leave the WebKit claim unproven.

## Done when

A You sheet case fails when the focus return is removed, and the touch cases either run on WebKit through a touch helper that works there or state why they cannot.

## Evidence

Filled at landing: what ran and where its output is.
