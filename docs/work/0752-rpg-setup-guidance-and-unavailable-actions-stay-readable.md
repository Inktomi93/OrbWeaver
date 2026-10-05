---
kind: bug
status: open
updated: 2026-10-05
priority: P3
area: client
---

# RPG setup guidance and unavailable actions stay readable

## What

RPG setup guidance spans long lines in the wide details pane. Disabled Add actions fade in Light appearance.

## Why

Long lines slow reading, and faded actions are harder to recognize. These findings do not block launch.

## Done when

Each guidance paragraph uses the prose measure without narrowing controls. Disabled Add actions remain visibly present in Light appearance.

## Evidence

Guidance reached 97 average-glyph characters per line in the 480px details pane. Disabled Add actions measured 2.25–2.26:1 in Light appearance at opacity 0.50. Inactive controls are exempt from the relevant WCAG contrast requirement; this is a readability finding.

The affected copy lives in `packages/client/src/features/rpg/components/rpg-game-tab.tsx` and `packages/client/src/features/rpg/components/rpg-host-scalars.tsx`. The full rendered review is retained in the launch handoff.
