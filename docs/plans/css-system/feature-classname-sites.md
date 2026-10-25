# Feature className sites

The sites `orb/feature-classname-layout-only` and `orb/no-built-class-string` report in `packages/client/src/features`, from `pnpm lint:eslint packages/client/src/features`. Each row is one `className`. The migration items are 1334 to 1336 and 1338; the rules are on, so the tree lints red until the last row goes.

The props a drained site moved onto are listed in `docs/law/UI-Density-Law.md` §2.3 and §4.3. The `datum` voice carries its ruled spelling (D5): machine text moved to `code` first, then `datum` became the body face with tabular figures at the gloss step.

## Remaining: the chat row skin table

Every remaining site reads its classes from the chat style skin table (`features/chat/lib/message-row-variants.ts` and the `row-edges`, `pager-chrome`, `art-decorations` and `message-row-backing` modules it composes): a `Record<ThemeChatStyle, RowSkin>` whose fields are class strings and class-building functions. They move together, in one change across all eight chat styles, once the skin fields become primitive props.

| file | line | element | source |
| - | - | - | - |
| `packages/client/src/features/chat/components/art-slot.tsx` | 125 | `Stack` | `band.className` beside `rounded-t-card` and a tappable `hover:opacity-80` |
| `packages/client/src/features/chat/components/art-slot.tsx` | 168 | `Stack` | `bg-cover bg-center bg-no-repeat`, `group-hover/art:opacity-80` and the side's corner radius |
| `packages/client/src/features/chat/components/ghost-message-row.tsx` | 381 | `Stack` | `skin.outer()` |
| `packages/client/src/features/chat/components/ghost-message-row.tsx` | 388 | `Row` | `rowBodyClassFor(skin)` |
| `packages/client/src/features/chat/components/ghost-message-row.tsx` | 392 | `Stack` | the skin's column class |
| `packages/client/src/features/chat/components/message-actions-row.tsx` | 271 | `Row` | the reveal mode and `skin.actionsRow.surface` |
| `packages/client/src/features/chat/components/message-name-row-frame.tsx` | 93 | `Row` | `headerBacking()` and `pinnedPaint` |
| `packages/client/src/features/chat/components/message-row-avatar.tsx` | 151 | `PortraitAvatar` | the weld corner radii |
| `packages/client/src/features/chat/components/message-row-bubble.tsx` | 50 | `Stack` | `withoutBubblePadding(bubbleClassName)` |
| `packages/client/src/features/chat/components/message-row-bubble.tsx` | 63 | `Stack` | `bubbleClassName` |
| `packages/client/src/features/chat/components/message-row-bubble.tsx` | 72 | `Row` | `withoutBubblePadding(bubbleClassName)` |
| `packages/client/src/features/chat/components/message-row-parts.tsx` | 215 | `Stack` | the train bubble class and its `opacity-50` |
| `packages/client/src/features/chat/components/message-row.tsx` | 370 | `Stack` | `skin.outer()` |
| `packages/client/src/features/chat/components/message-row.tsx` | 380 | `Row` | `rowBodyClassFor(skin)` |
| `packages/client/src/features/chat/components/message-row.tsx` | 392 | `Stack` | the skin's column class |
| `packages/client/src/features/chat/components/swipe-strip.tsx` | 67 | `Row` | `foot.row` |
| `packages/client/src/features/chat/components/swipe-strip.tsx` | 185 | `Row` | `foot.row` |
