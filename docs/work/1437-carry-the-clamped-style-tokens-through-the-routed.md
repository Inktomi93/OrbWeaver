---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: plugins
plan: css-system
---

# Carry the clamped style tokens through the routed chat card mint

## What

`packages/server/src/entry/http/card-frame.ts` mints a routed chat card with `styleTokens: undefined`. Accept the clamped style-token slice on the mint input, clamp it again on the server, and deliver it so the frame root reads `--sandbox-root-size`, radius and mono family. Route to `security-executor`: this widens a trust-boundary wire.

## Why

Item 1411 made srcdoc cards and plugin frames follow the viewer's font scale through `packages/ui/src/content/sandbox-frame/use-sandbox-theme.ts`. Routed chat cards never receive the tokens, so their text ignores the scale.

## Done when

The mint schema accepts only the clamped slice and the server clamps it. A routed-delivery CT shows card text scale with the appearance font scale, and a planted out-of-range token is clamped. The CSP, sandbox flags and script hash are unchanged.

## Evidence

- Wire: `cardFrameMintRequestSchema` in `packages/contracts/src/chat/card-frame.ts` takes an optional `styleTokens` strict object with exactly the `CARD_FRAME_STYLE_TOKEN` names (`packages/kit/src/card-frame/index.ts`). Each value must pass `clampCardFrameStyleToken`, so another key or a CSS-bearing value answers 400. `CARD_FRAME_MINT_BODY_MAX_BYTES` counts the slice.
- Clamp: `clampCardFrameStyleTokens` is closed per name: a CSS length for the radius, a font-family list for the mono family, and a percentage clamped into `FONT_SCALE_PERCENT` for the root size. The font-scale range has one home, `packages/kit/src/font-scale/index.ts`; `appearanceSettingsSchema` and the client slider bounds in `packages/client/src/features/app-shell/lib/appearance-bounds.ts` derive from it. The server mint passes the slice to `buildCardFrameDocument`, which runs the clamp. The srcdoc delivery and the plugin frame mint use the same clamp.
- Font-family grammar: `FONT_FAMILY_LIST` in `packages/kit/src/card-frame/index.ts` is the one grammar for the `fontFamily` slot and the mono style token, on the chat card mint, the plugin frame mint and the srcdoc delivery. Each comma-separated name is a bare word sequence or one name wholly inside matching quotes, so an unbalanced quote cannot open a CSS string that swallows the rest of the frame's `<style>`. A theme's own CSS can write `--font-sans` and `--font-mono` on the app root; `useSandboxTheme` reads them live and both clamps drop a value outside the grammar. `tests/ui/content/immersive-card/immersive-card-theme-font.ct.tsx` proves the frame keeps every style rule under a planted unbalanced quote.
- The CSP, the sandbox grant and the script hash do not change: `tests/server/entry/http/card-frame-style-tokens.int.test.ts` asserts the served headers equal `cardFrameResponseHeaders(buildCardFrameCsp(...))` with and without the slice.
- Red first against main: the integration and contract cases failed with 400 on the mint; `tests/client/features/chat/components/platform-routed-card-text-scale.suite.ct.tsx` failed on Chromium and WebKit with routed rem text at 16px where 24px was expected. Mutations that removed the root-size bound or the schema grammar each failed the matching cases.
- Green: `pnpm test` on the contract, integration, kit and body-limit suites; `pnpm test:ct` on the routed CT, `tests/ui/content/immersive-card/immersive-card-text-scale.ct.tsx` and `tests/ui/content/sandbox-frame/sandbox-frame.ct.tsx`; `pnpm test:ct:webkit` on the routed CT.
