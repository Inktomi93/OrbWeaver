import type { MessageRole } from "@orb/kit/message-role";
import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { variantProps } from "#lib";
import { messageBubbleVariants } from "./variants.ts";

export type MessageBubbleProps = ComponentProps<"div"> &
  Omit<VariantProps<typeof messageBubbleVariants>, "messageRole"> & {
    /** The role the bubble is filled as: that role's fill and its paired ink. Not `role`, which a DOM element takes as its ARIA role. */
    readonly messageRole: MessageRole;
    /** The owner-CSS hook. The transcript row names `message-bubble`, which also takes the box out of the density tier
     *  map. A bubble drawn elsewhere keeps `card-root`, so `tiers.css` resolves its inset and radius from the surface. */
    readonly ownSlot?: string;
  };

/**
 * A message bubble: a box filled as one role. It stamps the neutral D336 scope, because the role's own fill and ink are
 * not a tone's roles, and the attributes `tiers.css` keys the box's inset and radius on.
 */
export function MessageBubble({
  messageRole,
  shape,
  padding,
  receded,
  artDecoration,
  ownSlot = "card-root",
  className,
  ...rest
}: MessageBubbleProps): ReactElement {
  return (
    <div
      {...rest}
      {...variantProps(messageBubbleVariants, { messageRole, shape, padding, receded, artDecoration }, className, "neutral")}
      data-padding={padding === "none" ? "none" : undefined}
      data-shape={shape === "bubble" ? "bubble" : undefined}
      data-slot={ownSlot}
    />
  );
}
