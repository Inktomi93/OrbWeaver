---
kind: tooling
status: open
updated: 2026-10-25
priority: P2
area: tooling
plan: test-foundation
---

# Test-authoring rules close their factory, alias and hand-release holes

## What

Review of orb/ct-responder-reads-input (tooling/src/eslint/test-routes.ts) found fixed responders for input-taking procedures that pass: a one-line factory always(CHAT), a function declaration with an unused parameter handed by name, (input) => (input, CHAT), and const \_x = input; return FIXED. typeAnswersRequests judges non-inline values by type alone, and onlyNamed misses the comma and dead-binding forms. A typed map with a computed const key and an untyped map passed through a TrpcRoutes-typed wrapper (routeSurfaceReads, routeSeeded in \_surface-harness.ts) are not judged. orb/no-hand-copied-label (test-labels.ts) reads only literals, so a hoisted const label passes, and toHaveAccessibleName is unjudged. Route-map trpcHold releases with hand data remain in join-invite-dialog.ct.tsx, first-boot-boxes.ct.tsx, config-content-surface.ct.tsx, notification-inbox.ct.tsx and preview-result-lifetime.ct.tsx. The absence rule does not count toBe(null) or toBeFalsy().

## Why

Spine-Testing §9 bans minted results and copied labels; a rule with easy holes reads as enforcement it does not give.

## Done when

Each form has a planted red case in eslint-ct-responder.test.ts or eslint-test-authoring.test.ts; route-map holds release through the real caller; whole-tree ESLint is 0 with no waivers.

## Evidence

The [acceptance map](../reviews/test-enforcement-closeout.md) records implementation, controls, commands and limits. Main owns whole-tree acceptance.
