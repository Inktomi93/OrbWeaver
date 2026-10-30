---
kind: bug
status: open
updated: 2026-10-25
priority: P2
area: tests
plan: test-foundation
---

# The corpus-shell route-crash e2e passes again

## What

tests/e2e/corpus-shell.spec.ts:309 (a route render crash reports once) fails on main in every corpus cell: the planted chunk crash surfaces as a React invalid-element error instead of the planted message.

## Why

The crash fake likely no longer matches the authed-app chunk export shape after the polyfill entry moved the app graph behind entry.ts.

## Done when

The case passes on the corpus cells and its fake derives the chunk shape from production.

## Evidence

- Cause: the fake rebound every export of the real authed-app chunk to a namespace object, but the route resolves its component by export name (`lazyRouteComponent(..., "AuthedApp")`), so React received an object (minified error 130) and reported that instead of the planted message. The served chunk ends `export{xHt as AuthedApp}`; the fake still reads its export names from that served chunk and now rebinds each to a function that throws.
- Red: `pnpm e2e:corpus tests/e2e/corpus-shell.spec.ts -g "route render crash"` failed in all 16 corpus cells with error 130. Green: the same case passes on `corpus-desktop-bubble` and `corpus-phone-bubble`.
