---
kind: work
status: open
updated: 2026-10-25
priority: P3
area: server
---

# The app CSP enforces Trusted Types

## What

React 19.3 passes Trusted Types values to DOM sinks without coercing them to strings, so the app can send require-trusted-types-for 'script' in its CSP (packages/server/src/entry/http/security-headers.ts).

## Why

Trusted Types blocks DOM-based script injection at the browser; the app writes no innerHTML itself, so the cost may be small.

## Done when

Every bundled library that writes an injection sink (Streamdown, CodeMirror, ECharts, Shiki, KaTeX, Vite runtime) is checked; the header ships with any needed policy; an e2e or HTTP test asserts the header and that the main journeys raise no Trusted Types violation; the card sandbox frame keeps its own CSP.

## Evidence

Filled at landing: what ran and where its output is.
