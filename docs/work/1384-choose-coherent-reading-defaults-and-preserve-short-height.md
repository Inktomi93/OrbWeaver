---
kind: work
status: doing
updated: 2026-10-26
priority: P3
area: client
lane: main
---

# Choose coherent reading defaults and preserve short-height chat space

## What

Implement flat messages with small rounded avatars, selected from the measured reading comparison. Preserve the current text metrics and quote colorization. Verify responsive composition across the supported skins.

## Why

Default bubble and large-avatar geometry narrows portrait reading. Composer height and decorative banners consume much of a short landscape viewport; changing font scale alone does not address this.

## Done when

Record selected values and reasons, preserve other users' overrides and all chat skins, and keep sticky message identity/actions. The owner permits overwriting his own appearance preferences. Prove portrait and landscape reading with populated Hikari messages and coarse controls. Use existing ramps and layout primitives. Evidence: docs/reviews/orb-mobile-composer-audit.md.

## Evidence

The [implementation review](../reviews/composer-implementation-review.md) records the selected defaults and evidence limits.
Production-room tests reset appearance from its schema and cover the governed styles, both roles, viewport regimes and explicit avatar choices.
Live Hikari captures verify corrected Whisper art, shallow transcript fade, sticky identity and the selected reading defaults.
Appearance contracts preserve valid stored overrides. Independent source and screenshot reviews close the scoped findings.
