// The skin's message box as `@orb/ui` props, the one home for every bubble shape: the settled row, its train pills and
// the streaming ghost. `MESSAGE_BUBBLE_SLOT` is the owner-CSS hook, which also takes a bubble card out of the
// density tier map.

import type { MessageRole } from "@orb/kit/message-role";
import type { StackProps } from "@orb/ui/layout";
import { Stack } from "@orb/ui/layout";
import { MessageBubble } from "@orb/ui/message-bubble";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
import type { RowSkin } from "../lib/message-row-variants.ts";

const MESSAGE_BUBBLE_SLOT = "message-bubble";

// The corner variant for a skin's corner set; a speech card's long corner follows the speaker's side.
function cornersFor(set: RowSkin["corners"], role: MessageRole): "card" | "speechAssistant" | "speechUser" | "pill" {
  if (set === "speech") {
    return role === "user" ? "speechUser" : "speechAssistant";
  }
  return set;
}

// The plate column is inset a section from its gutter; on a phone its trailing edge takes a block, which leaves flat the
// 32px more reading width than Moonlit that the small avatar chip buys.
const PLATE_INSET = "px-section py-row @max-cq-28:pe-block";
// The page is inset the gutter, with no block-end inset: the next page runs on. On a phone it keeps a tight inset, as
// stock SillyTavern's document does, so the page keeps its reading width.
const PAGE_INSET = "px-gutter pbs-row @max-cq-28:px-tight";
const PAGE_LAST_ROW_FLOOR = "min-block-(--immersive-document-last-row-min-height)";
const ECHO_CARD_FLOOR = "min-block-(--immersive-echo-min-height)";

/** The box's arrangement: `stack` lays the content out at the row gap on the box's own inset; `bare` (whisper's band
 *  above its inset stack) and `weld` (ripple's portrait beside its inset stack) hand the inset to their own content. */
const BOX_SHAPES = ["stack", "bare", "weld"] as const;
type BoxShape = (typeof BOX_SHAPES)[number];

export interface MessageBoxProps {
  readonly box: RowSkin["box"];
  readonly role: MessageRole;
  readonly shape: BoxShape;
  readonly phoneCap: boolean;
  /** `RowSkin.corners`. */
  readonly corners: RowSkin["corners"];
  /** The transcript's last row of a skin with a floor (`RowSkin.lastRowFloor`). */
  readonly lastRowFloor: boolean;
  /** EDIT mode: the box stops hugging and fills the column the row holds open (`MessageRow`'s reservation). */
  readonly editing: boolean;
  /** Hide-from-AI: the row stays visible and recedes, because the toggle holds it out of assembly only. */
  readonly receded: boolean;
  /** Echo's art tile is positioned against the box. */
  readonly positioned: boolean;
  readonly artDecoration?: StackProps["artDecoration"];
  readonly children: ReactNode;
}

export function MessageBox(props: MessageBoxProps): ReactElement {
  return props.box === "bubble" ? <BubbleCard {...props} /> : <ReadingBox {...props} />;
}

// The filled skins: the role's bubble card, which floats without a shadow at every elevation.
function BubbleCard({ role, shape, phoneCap, corners, editing, receded, positioned, artDecoration, children }: MessageBoxProps): ReactElement {
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

// The skins with no fill at rest: a full-width column that takes the reading plate over a wallpaper.
function ReadingBox({ box, role, shape, lastRowFloor, receded, positioned, artDecoration, children }: MessageBoxProps): ReactElement {
  const page = box === "page";
  const inset = shape === "stack";
  const plateInset = inset && !page;
  const pageInset = inset && page;
  const floor = page && lastRowFloor;
  const overlayPage = page && !lastRowFloor;
  const weld = shape === "weld";
  return (
    <Stack
      data-slot={MESSAGE_BUBBLE_SLOT}
      align={weld ? "start" : undefined}
      gap={inset ? "row" : undefined}
      plate="reading"
      ink={readingInk(box, role)}
      receded={receded}
      artDecoration={artDecoration}
      className={cn(
        "inline-full",
        overlayPage ? "grid" : undefined,
        weld ? "flex-row" : undefined,
        plateInset ? PLATE_INSET : undefined,
        pageInset ? PAGE_INSET : undefined,
        floor ? PAGE_LAST_ROW_FLOOR : undefined,
        positioned && "relative",
      )}
    >
      {children}
    </Stack>
  );
}
