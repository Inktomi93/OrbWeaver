---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: ui
plan: cross-surface-consistency
---

# CSS cleanup bundle: generated-file freshness in the main suite, the closed set check, and the literals the sheets still carry

## What

Move the generated CSS freshness test into the main suite. Add a native test that lists tracked stylesheets against the closed set in docs/law/client-architecture-lockdown.md section 4.2. Resolve the open wallpaper halo note in the shell grid sheet. Remove the second copy of the shell swap deadline. Correct the KaTeX layer comment. Write the z-index rule into law and name the overlay offsets. Audit raw z-index, px, colour and var fallback values in the stylesheets. Emit identical theme declarations once. Remove the double glob from the doc format hook.

## Why

A review of the stylesheets found them sound, but freshness of generated CSS is outside CI, the closed set has no check, and a few values and comments disagree with the law.

## Done when

Each listed change has landed with its test or recorded reason, stylelint and the affected tests pass, and no raw value remains without a token or a local reason.

## Evidence

Filled at landing: what ran and where its output is.
