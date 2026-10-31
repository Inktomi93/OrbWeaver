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

The contract is recorded in `docs/plans/css-system/design.md` under "Viewport and text scale". Verified against the source: `useSandboxTheme` (`packages/ui/src/content/sandbox-frame/use-sandbox-theme.ts`) delivers the viewer's `--appearance-font-scale` as the style token `--sandbox-root-size`; `packages/kit/src/card-frame/index.ts` owns the token name, its percent grammar and the clamp into the appearance range, and the frame document root reads it. The srcdoc delivery, the routed chat card mint (`packages/client/src/features/chat/components/card-block.tsx`, `packages/server/src/entry/http/card-frame.ts`) and the plugin frame mint (`packages/server/src/entry/http/plugin-frame.ts`) all carry the token and re-clamp it on the server; a value outside the grammar is refused, a number outside the range is clamped. Rem and em frame text follows the scale. Authored px text and authored fixed-size boxes keep their size. First-party frame bundles size text in rem (`pocket-arcade` was converted and `release-entries.json` rebuilt).

Proof, all against real iframe content:

- `tests/ui/content/immersive-card/immersive-card-text-scale.ct.tsx`: srcdoc delivery at the minimum, default, maximum and a planted scale.
- `tests/client/features/chat/components/platform-routed-card-text-scale.suite.ct.tsx`: the routed chat card through the real mint, at the default viewport and at 320px wide. An authored 800px box keeps its width and the host does not overflow horizontally.
- `tests/client/features/plugin/components/platform-plugin-frame-text-scale.suite.ct.tsx`: a plugin frame through the real plugin mint, at 390px and 320px wide, same assertions. A planted regression (the token sent as 100%) fails both widths.

The two suites above pass on Chromium and WebKit. Server-side clamp cases are in `tests/server/entry/http/card-frame-style-tokens.int.test.ts` and `tests/server/entry/http/plugin-frame-style-tokens.int.test.ts`. The srcdoc test has no WebKit run (`pnpm test:ct:webkit` takes the platform suites).

Boundary the clamp sets: the frame stops at the appearance maximum (150%), so a host root scaled to 200% or 300% by the text-scale suite's probe still renders frame text at 150%. This follows the design's ruling that the token rides the same clamp as the other frame style tokens.
