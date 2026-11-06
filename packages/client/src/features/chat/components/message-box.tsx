// The skin's message box as `@orb/ui` props, the one home for every bubble shape: the settled row, its train pills and
// the streaming ghost. `MESSAGE_BUBBLE_SLOT` is the owner-CSS hook, which also takes a bubble card out of the
// density tier map.

import type { MessageRole } from "@orb/kit/message-role";
import { Stack } from "@orb/ui/layout";
import { MessageBubble } from "@orb/ui/message-bubble";
import type { ReactElement } from "react";
import { cn } from "#lib";
import type { BubbleBoxProps, MessageBoxProps, ReadingBoxProps } from "../lib/message-box-facts.ts";
import type { RowSkin } from "../lib/message-row-variants.ts";

const MESSAGE_BUBBLE_SLOT = "message-bubble";

// The corner variant for a skin's corner set; a speech card's long corner follows the speaker's side.
function cornersFor(set: RowSkin["corners"], role: MessageRole): "card" | "speechAssistant" | "speechUser" | "pill" {
  if (set === "speech") {
    return role === "user" ? "speechUser" : "speechAssistant";
  }
  return set;
}

const PAGE_LAST_ROW_FLOOR = "min-block-(--immersive-document-last-row-min-height)";
const ECHO_CARD_FLOOR = "min-block-(--immersive-echo-min-height)";

export function MessageBox(props: MessageBoxProps): ReactElement {
  return props.box === "bubble" ? <BubbleCard {...props} /> : <ReadingBox {...props} />;
}

// The filled skins: the role's bubble card, which floats without a shadow at every elevation.
function BubbleCard({ role, shape, phoneCap, corners, editing, receded, positioned, artDecoration, children }: BubbleBoxProps): ReactElement {
  const weld = shape === "weld";
  const inset = shape === "stack";
  // An illustrated or striped card spans its column up to the bubble cap, so card widths do not jump between a short
  // reply and a long one; an editor spans it too.
  const spansColumn = editing || positioned || shape !== "stack" || artDecoration !== undefined;
  return (
    <MessageBubble
      ownSlot={MESSAGE_BUBBLE_SLOT}
      shape="bubble"
      messageRole={role}
      padding={inset ? undefined : "none"}
      receded={receded}
      artDecoration={artDecoration}
      share={phoneCap}
      corners={cornersFor(corners, role)}
      className={cn(
        "flex",
        weld ? "flex-row items-start" : "flex-col",
        inset ? "gap-row" : undefined,
        spansColumn ? "inline-full" : undefined,
        positioned && "relative",
        positioned && ECHO_CARD_FLOOR,
      )}
    >
      {children}
    </MessageBubble>
  );
}

// The ink a reading box takes over its plate: the page's reading ink, or a notice row's muted ink.
function readingInk(box: RowSkin["box"], role: MessageRole): "prose" | "muted" | undefined {
  if (box === "page") {
    return "prose";
  }
  return role === "system" ? "muted" : undefined;
}

// The insets a reading box lays on its stack, by the box that takes them. The plate column is inset a section from its
// gutter; on a phone its trailing edge takes a block, which leaves flat the 32px more reading width that the small avatar
// chip buys. The page is inset the gutter with no block-end inset, so the next page runs on, and keeps a tight inset on a
// phone. A box that hands its inset to its own content takes `none`.
const READING_INSET = {
  plate: { inline: "section", block: "row", blockStart: undefined, inlineNarrow: undefined, inlineEndNarrow: "block" },
  page: { inline: "gutter", block: undefined, blockStart: "row", inlineNarrow: "tight", inlineEndNarrow: undefined },
  none: { inline: undefined, block: undefined, blockStart: undefined, inlineNarrow: undefined, inlineEndNarrow: undefined },
} as const;

// The skins with no fill at rest: a full-width column that takes the reading plate over a wallpaper.
function ReadingBox({ box, role, shape, lastRowFloor, receded, positioned, children }: ReadingBoxProps): ReactElement {
  const page = box === "page";
  const inset = shape === "stack";
  const floor = page && lastRowFloor;
  const overlayPage = page && !lastRowFloor;
  const weld = shape === "weld";
  const insets = READING_INSET[inset ? box : "none"];
  return (
    <Stack
      data-slot={MESSAGE_BUBBLE_SLOT}
      align={weld ? "start" : undefined}
      gap={inset ? "row" : undefined}
      plate="reading"
      ink={readingInk(box, role)}
      receded={receded}
      paddingInline={insets.inline}
      paddingBlock={insets.block}
      paddingBlockStart={insets.blockStart}
      paddingInlineNarrow={insets.inlineNarrow}
      paddingInlineEndNarrow={insets.inlineEndNarrow}
      className={cn(
        "inline-full",
        overlayPage ? "grid" : undefined,
        weld ? "flex-row" : undefined,
        floor ? PAGE_LAST_ROW_FLOOR : undefined,
        positioned && "relative",
      )}
    >
      {children}
    </Stack>
  );
}
