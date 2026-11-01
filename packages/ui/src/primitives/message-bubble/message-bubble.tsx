import type { MessageRole } from "@orb/kit/message-role";
import type { ComponentProps, CSSProperties, ReactElement } from "react";
import { use } from "react";
import type { VariantProps } from "tailwind-variants";
import type { BubbleScope } from "#lib";
import { AmbientScopeContext, variantProps } from "#lib";
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
 * A picked fill's box as a whole surface. Inside it the role's fill var is the opaque pixel, so a band that repaints it does
 * not double a translucent pick; the box alone paints the authored value.
 */
function boxStyle(scope: BubbleScope | undefined): CSSProperties | undefined {
  return scope === undefined
    ? undefined
    : { ...(scope.vars as CSSProperties), backgroundColor: scope.fill.paint, ...(scope.colorScheme === undefined ? {} : { colorScheme: scope.colorScheme }) };
}

/**
 * A message bubble: a box filled as one role. It stamps the neutral D336 scope, because the role's own fill and ink are
 * not a tone's roles, and the attributes `tiers.css` keys the box's inset and radius on. A picked fill's palette is restated
 * here and nowhere wider: only this box paints the fill (D202).
 */
export function MessageBubble({
  messageRole,
  shape,
  padding,
  receded,
  artDecoration,
  share,
  corners,
  ownSlot = "card-root",
  className,
  style,
  ...rest
}: MessageBubbleProps): ReactElement {
  const ambient = use(AmbientScopeContext);
  const scope = ambient.scopes?.[messageRole];
  const box = (
    <div
      {...rest}
      {...variantProps(messageBubbleVariants, { messageRole, shape, padding, receded, artDecoration, share, corners }, className, "neutral")}
      style={{ ...boxStyle(scope), ...style }}
      data-padding={padding === "none" ? "none" : undefined}
      data-shape={shape === "bubble" ? "bubble" : undefined}
      data-slot={ownSlot}
    />
  );
  return <AmbientScopeContext value={scope === undefined ? ambient : { ...ambient, inside: scope.fill.pixel }}>{box}</AmbientScopeContext>;
}
