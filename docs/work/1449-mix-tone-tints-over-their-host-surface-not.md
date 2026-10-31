---
kind: work
status: open
updated: 2026-10-30
priority: P3
area: ui
plan: css-system
---

# Mix tone tints over their host surface, not the page background

## What

Tone tints mix over `--color-background`, so a soft badge on a card host nearly vanishes (1.04:1 on Mocha). Give the tint recipes a host operand that surface primitives (Card, raised, popover) set, and judge the floors per host in the token build and the clamp.

## Why

Side-eye finding 7 (`reports/side-eye/2026-10-30-tone-roles-step1.md`).

## Done when

A soft badge on a card, raised or popover host shows a tint distinct from that host, at the ΔE floor, in each seed and a custom theme, pinned by a CT.

## Evidence

The tint, tint-active and edge recipes mix toward `host`, `var(--tone-host, var(--color-background))`. The token build emits a `tone-host-<host>` utility per member of `TONE_HOSTS`, and the surface primitives wear it beside their fill. D336 records the ruling and the rejected forms.

- `tests/ui/content/theme-scope/platform-tone-host.suite.ct.tsx` reads each soft badge's painted tint against its card, raised and popover host in every seed and on each contrast-case custom base. On the old source it failed the Hearth and Mocha seeds: warning and info sat 0.016 to 0.019 off the popover host. Card and raised already cleared the 0.02 floor there; the reported Mocha card badge sat at 0.024. It passes on Chromium and WebKit after.
- The token build judges every floor and the tint separation over each host; `tests/ui/token-contract.test.ts` plants a 1% tint and reads the build refuse it as merged with its host.
- `tests/ui/content/theme-scope/tone-knobs.test.ts` judges the emitted scope over every host across the accepted-base matrix: the literal tints sit off every host and carry each host's ink.
