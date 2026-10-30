---
kind: bug
status: open
updated: 2026-10-11
priority: P2
area: chat
---

# Centred chat styles keep one column width at the 4xl crossover

## What

At 1920 in flat, hush and document, rows holding a code block render 541px wide and indented against 750px prose rows, the chip jumping from x=773 to 878 (the Moonlit desktop-mobile parity side-eye report, F12). Likely the unlayered :has(pre) width rule at `packages/client/src/styles/globals.css:792-794` beating `CENTRED_COLUMN` (`@4xl:w-(--centred-column-width)`) at `packages/client/src/features/chat/lib/row-placement.ts:48`.

## Why

A ragged left edge at desktop width in the reading styles.

## Done when

A CT at a 1920 container pins equal column widths and chip x for prose and code rows in each centred style.

## Evidence

Reproduced at a 1920 viewport in flat, hush and document: a row holding a code block rendered 477px wide against 750px for a prose row, and the chip x moved. Cause: the client-layer `:has(pre)` rule set `inline-size: 100%` and outranked the `cq-56` utility, because a layer later in the order beats a utility regardless of specificity.

Fixed in `packages/client/src/styles/globals.css`: the centred column's width at `cq-56` and up is spelled after the code rule with `[data-column="centred"]`, which `MessageContentColumn` stamps (`packages/client/src/features/chat/components/message-row-layout.tsx`). The utility is removed so the width has one home.

Test: `tests/client/features/chat/components/platform-centred-column-width.suite.ct.tsx` (component test; production room through `ChatRoomShellStory`; centred styles derived from `MESSAGE_ROW_SKINS`). Red on the old source: 3 failed. Green after the fix: 3 passed in Chromium and 3 in WebKit. `chat-style-skins.ct.tsx` and `platform-transcript-identity.suite.ct.tsx` stay green in Chromium.
