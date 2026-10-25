// The skin's message box as `@orb/ui` props, the one home for every bubble shape: the settled row, its train pills and
// the streaming ghost. `data-slot="message-bubble"` is the owner-CSS hook, which also takes a bubble card out of the
// density tier map.

import type { MessageRole } from "@orb/kit/message-role";
import { Card } from "@orb/ui/card";
import { Stack } from "@orb/ui/layout";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { cn } from "#lib";
import type { RowSkin } from "../lib/message-row-variants.ts";
import { ROLE_FILL } from "../lib/message-row-variants.ts";

// A bubble at a phone width takes at most four fifths of its column (owner ruling, after Moonlit Echoes' phone layout).
const BUBBLE_PHONE_CAP = "@max-cq-28:max-inline-4/5";
// The plate column is inset a section from its gutter, and a stock 10px on a phone (SillyTavern flat).
const PLATE_INSET = "px-section py-row @max-cq-28:px-row";
// The page is inset the gutter, with no block-end inset: the next page runs on.
const PAGE_INSET = "px-gutter pbs-row";
const PAGE_LAST_ROW_FLOOR = "min-block-(--immersive-document-last-row-min-height)";

/** The box's arrangement: `stack` lays the content out at the row gap on the box's own inset; `bare` (whisper's band
 *  above its inset stack) and `weld` (ripple's portrait beside its inset stack) hand the inset to their own content. */
const BOX_SHAPES = ["stack", "bare", "weld"] as const;
type BoxShape = (typeof BOX_SHAPES)[number];

export interface MessageBoxProps {
  readonly box: RowSkin["box"];
  readonly role: MessageRole;
  readonly shape: BoxShape;
  readonly phoneCap: boolean;
  /** The transcript's last row of a skin with a floor (`RowSkin.lastRowFloor`). */
  readonly lastRowFloor: boolean;
  /** EDIT mode: the box stops hugging and fills the column the row holds open (`MessageRow`'s reservation). */
  readonly editing: boolean;
  /** Hide-from-AI: the row stays visible and recedes, because the toggle holds it out of assembly only. */
  readonly receded: boolean;
  /** Echo's art tile is positioned against the box. */
  readonly positioned: boolean;
  readonly style: CSSProperties | undefined;
  readonly children: ReactNode;
}

export function MessageBox(props: MessageBoxProps): ReactElement {
  return props.box === "bubble" ? <BubbleCard {...props} /> : <ReadingBox {...props} />;
}

// The filled skins: the role's bubble card, which floats without a shadow at every elevation.
function BubbleCard({ role, shape, phoneCap, editing, receded, positioned, style, children }: MessageBoxProps): ReactElement {
  const weld = shape === "weld";
  const inset = shape === "stack";
  return (
    <Card
      data-slot="message-bubble"
      ownSlot="message-bubble"
      shape="bubble"
      tone={ROLE_FILL[role]}
      shadow="none"
      padding={inset ? undefined : "none"}
      receded={receded}
      style={style}
      className={cn(
        "flex",
        weld ? "flex-row items-start" : "flex-col",
        inset ? "gap-row" : undefined,
        phoneCap && BUBBLE_PHONE_CAP,
        editing && "inline-full",
        positioned && "relative",
      )}
    >
      {children}
    </Card>
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
function ReadingBox({ box, role, shape, lastRowFloor, receded, positioned, style, children }: MessageBoxProps): ReactElement {
  const page = box === "page";
  const inset = shape === "stack";
  const plateInset = inset && !page;
  const pageInset = inset && page;
  const floor = page && lastRowFloor;
  const weld = shape === "weld";
  return (
    <Stack
      data-slot="message-bubble"
      gap={inset ? "row" : undefined}
      plate="reading"
      ink={readingInk(box, role)}
      receded={receded}
      style={style}
      className={cn(
        "inline-full",
        weld ? "flex-row items-start" : undefined,
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
