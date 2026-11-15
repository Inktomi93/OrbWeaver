---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: tooling
plan: snap-secret-hygiene
---

# Read the URL secret names from one home in every URL redactor

## What

`tooling/src/floor/browser/browser-request-url.ts` keeps its own unanchored query and path regexes beside `tooling/src/floor/browser/url-secret-names.ts` and does not read its word pair names, and `sanitizePairs` in `tooling/src/snap/lib/har-redaction.ts` reads only the secret pair names. A `?code=` or `?key=` value passes by name through the request summary and the HAR and request-log URL evidence.

## Why

An OAuth code the app mints after a redirect is never noted, so only a name rule can keep it out of the request evidence.

## Done when

Both redactors read every set in the home, the request redactor's regex is folded into the home or its extra names move there, and a `?code=` canary at each redactor shows the value masked.

## Evidence

Filled at landing: what ran and where its output is.
