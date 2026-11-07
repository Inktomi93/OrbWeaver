// The skin's message box as `@orb/ui` props, the one home for every bubble shape: the settled row, its train pills and
// the streaming ghost. `MESSAGE_BUBBLE_SLOT` is the owner-CSS hook, which also takes a bubble card out of the
// density tier map.

import type { MessageRole } from "@orb/kit/message-role";
import { Stack } from "@orb/ui/layout";
import { READING_INSET } from "@orb/ui/lib";
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
      flow={weld ? "weld" : "stack"}
      receded={receded}
      artDecoration={artDecoration}
      share={phoneCap}
      corners={cornersFor(corners, role)}
      className={cn(inset ? "gap-row" : undefined, spansColumn ? "inline-full" : undefined, positioned && "relative", positioned && ECHO_CARD_FLOOR)}
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

function readingFlowOf(weld: boolean, overlayPage: boolean): "weld" | "page" | undefined {
  if (weld) {
    return "weld";
  }
  return overlayPage ? "page" : undefined;
}

// The skins with no fill at rest: a full-width column that takes the reading plate over a wallpaper.
function ReadingBox({ box, role, shape, lastRowFloor, receded, positioned, children }: ReadingBoxProps): ReactElement {
  const page = box === "page";
  const inset = shape === "stack";
  const floor = page && lastRowFloor;
  const overlayPage = page && !lastRowFloor;
  const weld = shape === "weld";
  const boxInset = inset ? READING_INSET[box].inset : undefined;
  return (
    <Stack
      data-slot={MESSAGE_BUBBLE_SLOT}
      align={weld ? "start" : undefined}
      gap={inset ? "row" : undefined}
      plate="reading"
      ink={readingInk(box, role)}
      receded={receded}
      paddingInline={boxInset?.paddingInline}
      paddingBlock={boxInset?.paddingBlock}
      paddingBlockStart={boxInset?.paddingBlockStart}
      paddingInlineNarrow={boxInset?.paddingInlineNarrow}
      paddingInlineEndNarrow={boxInset?.paddingInlineEndNarrow}
      width="full"
      readingFlow={readingFlowOf(weld, overlayPage)}
      minHeight={floor ? "pageLastRow" : undefined}
      className={positioned ? "relative" : undefined}
    >
      {children}
    </Stack>
  );
}
