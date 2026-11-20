// What a message box takes as props, split per box so only the filled card can be handed art, and the row facts every box of one row shares.

import type { MessageRole } from "@orb/kit/message-role";
import type { StackProps } from "@orb/ui/layout";
import type { ReactNode } from "react";
import type { BubbleDecoration } from "./art-decorations.ts";
import type { RowSkin } from "./message-row-variants.ts";

/** The box's arrangement: `stack` lays the content out at the row gap on the box's own inset; `bare` (whisper's band
 *  above its inset stack) and `weld` (ripple's portrait beside its inset stack) hand the inset to their own content. */
const BOX_SHAPES = ["stack", "bare", "weld"] as const;
type BoxShape = (typeof BOX_SHAPES)[number];

interface MessageBoxShared {
  readonly role: MessageRole;
  readonly shape: BoxShape;
  readonly phoneCap: boolean;
  /** `RowSkin.corners`. */
  readonly corners: RowSkin["corners"];
  /** The transcript's last row of a skin with a floor (`RowSkin.lastRowFloor`). */
  readonly lastRowFloor: boolean;
  /** An actions-only bar overlays the page's first line instead of taking a line of its own (`HeaderShape.ownLine`). */
  readonly headerOverlaid: boolean;
  /** EDIT mode: the box stops hugging and fills the column the row holds open (`MessageRow`'s reservation). */
  readonly editing: boolean;
  /** Hide-from-AI: the row stays visible and recedes, because the toggle holds it out of assembly only. */
  readonly receded: boolean;
  /** Echo's art tile is positioned against the box. */
  readonly positioned: boolean;
  readonly children: ReactNode;
}

/** The filled card, the one box that paints a portrait or a tick beside its text. */
export interface BubbleBoxProps extends MessageBoxShared {
  readonly box: "bubble";
  readonly artDecoration?: StackProps["artDecoration"];
}

/** The reading boxes (`plate`, `page`) paint no art, so they take no `artDecoration`. */
export interface ReadingBoxProps extends MessageBoxShared {
  readonly box: Exclude<RowSkin["box"], "bubble">;
}

export type MessageBoxProps = BubbleBoxProps | ReadingBoxProps;

type RowBoxFacts<Props> = Omit<Props, "shape" | "positioned" | "children">;

/** The skin and row facts every message box of one row shares. */
export type MessageBoxFacts = RowBoxFacts<BubbleBoxProps> | RowBoxFacts<ReadingBoxProps>;

/** A row's box facts: the skin's box, with the decoration's treatment only where the box can paint it. */
export function messageBoxFacts(
  skin: RowSkin,
  decoration: BubbleDecoration | null,
  row: Pick<MessageBoxShared, "role" | "lastRowFloor" | "headerOverlaid" | "editing" | "receded">,
): MessageBoxFacts {
  const shared = { ...row, phoneCap: skin.phoneCap, corners: skin.corners };
  return skin.box === "bubble" ? { ...shared, box: skin.box, artDecoration: decoration?.treatment } : { ...shared, box: skin.box };
}
