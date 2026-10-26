---
kind: work
status: doing
updated: 2026-10-26
priority: P2
area: client
lane: main
---

# Unify plugin chat presence and make composer commands menu-first

## What

Implement the [approved two-row composition](../reviews/composer-mock-study.md) across plugin flank panels, collapse state, per-plugin visibility and composer command placements. Commands are menu-first; ordinary panels live in Context, while explicit sidecar placement remains available through the existing authoring flow.

## Why

Panel hiding and collapse do not control command prominence. Rotation changes which commands become permanent buttons. A separate plugin column competes with Context and consumes chat space.

## Done when

Preserve the approved two-row composer, sticky message header, plugin attribution, grants and enabled state. Keep commands reachable through stable grouped controls; any persistent promotion is explicit. An unused sidecar reserves no width or collapse control. Verify all-enabled Hikari chats, both panel states, phone orientations and keyboard exits. Evidence: docs/reviews/orb-mobile-composer-audit.md.

## Evidence

The [implementation review](../reviews/composer-implementation-review.md) records the completed composition and evidence limits.
Production composer cases pass in Chromium and WebKit. Plugin invocation, Undo, placement persistence, keyboard focus and mobile panels pass through testkit.
Live private-clone captures verify both phone orientations, keyboard containment, desktop pane regimes, inline sidecars and narrow-overlay exits.
Independent source and screenshot reviews report no remaining findings in this scope. Private artifacts are retained under `reports/surface-review-private/composer-final/`.
