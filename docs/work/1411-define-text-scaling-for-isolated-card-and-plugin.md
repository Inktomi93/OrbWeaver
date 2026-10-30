---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: ui
plan: css-system
---

# Define text scaling for isolated card and plugin documents

## What

Define which host typography tokens and font-scale settings cross the isolated card and plugin document boundary. The sandbox theme supplies colors, radius and font families but no root font size.

## Why

An isolated document cannot inherit the host root font scale. Host typography checks therefore do not prove consistent scaling inside cards and plugin pages.

## Done when

Record the intended scaling contract. Implement the chosen validated boundary without weakening isolation. Exercise real iframe content at default and enlarged text scales and narrow widths, including authored fixed-size content.

## Evidence

The contract is recorded in `docs/plans/css-system/design.md` under "Viewport and text scale". `useSandboxTheme` delivers the viewer's `--appearance-font-scale` to every frame as the style token `--sandbox-root-size` (a root percentage); the frame document root reads it. Rem and em card text follows the scale. Authored px text stays fixed. The srcdoc delivery and the plugin frame mint carry the token. The chat card mint (`packages/server/src/entry/http/card-frame.ts`) passes no style tokens, so a routed chat card keeps its default root size. Widening that wire and its server clamp is an open change on this item.

The `pocket-arcade` showcase bundle sized its text and pad buttons in px; they are rem now, and `release-entries.json` is rebuilt.

Proof: `tests/ui/content/immersive-card/immersive-card-text-scale.ct.tsx` mounts the production `ImmersiveCard` and moves the root scale through 1, 1.5, 2 and 3. It failed on the old source at 1.5, 2, 3 and on a live scale change, and passes now (Chromium). An authored fixed-size line stays at its px size throughout. The proof covers the srcdoc delivery on Chromium only. It has no WebKit run, no routed delivery and no narrow-width case.
