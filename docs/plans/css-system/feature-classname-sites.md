# Feature className sites

The sites `orb/feature-classname-layout-only` and `orb/no-built-class-string` report in `packages/client/src/features`, from `pnpm lint:eslint packages/client/src/features`. The migration items are 1334 to 1336, 1338 and 1346; the rules are on, and the feature tree lints clean.

The props a drained site moved onto are listed in `docs/law/UI-Density-Law.md` §2.3 and §4.3. The `datum` voice carries its ruled spelling (D5): machine text moved to `code` first, then `datum` became the body face with tabular figures at the gloss step.

## The chat row skin table

The skin table (`features/chat/lib/message-row-variants.ts`, with `row-edges.ts` and `pager-chrome.ts`) is a `Record<ThemeChatStyle, RowSkin>` of data: the track and alignment, the message box (`bubble`, `plate`, `page`), the pinned header's fill, corners and reach, the actions chip and the swipe foot's edge. The row components turn each field into `@orb/ui` props: the bubble `Card` (`components/message-box.tsx`), the row's root, body and column (`components/message-row-layout.tsx`), the header frame (`components/message-name-row-frame.tsx`), the swipe foot row (`components/swipe-strip.tsx`) and the art slots (`components/art-slot.tsx`). A feature className left on those elements spells layout only.

The name row's bubble ink is the one rule keyed on chat slot names, so it lives in client `globals.css` (`data-bubble-ink`) rather than in a primitive.
