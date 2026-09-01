// The single-bubble (non-Tide) render shapes, split out of message-row-parts.tsx to stay under the
// component-size cap. No state of its own — renderSingleBubble is a pure (args) => ReactElement the
// bubble slot calls with already-resolved data.

import type { MessageRole } from "@orb/kit/message-role";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
import type { BubbleDecoration } from "../lib/message-row-variants.ts";

// The zero-height action slot deliberately paints outside the header's measured box (#204). Extend the
// owning bubble upward by one token block while adding the same space back inside: the border box gains
// the rail, but every child and the bubble's margin box stay at the exact pre-containment coordinates.
const CONTAIN_ACTIONS_PADDED = "-mt-block pt-[calc(var(--spacing-row)+var(--spacing-block))]";
const CONTAIN_ACTIONS_UNPADDED = "-mt-block pt-block";

function actionContainmentClass(header: ReactNode, className: string): string | undefined {
  return header === null ? undefined : className;
}

// The bubble's own padding is REMOVED at the string level, not overridden. It was written when `cn` knew
// the DTCG type-scale groups only (lib/class-merge.ts) and custom SPACING tokens were opaque, so a `p-0`
// decoration className computed to 0 in React while the DOM still rendered the padding utility. #146
// registered the spacing scale, so an appended `p-0` WOULD win now — but the band case does not want a
// zero padding declared on the bubble, it wants the bubble's own inset gone so the band can own the edge.
// Stripping the exact tokens says that; `p-0` would only say it by accident of merge order.
function withoutBubblePadding(className: string): string {
  return className
    .split(" ")
    .filter((token) => token !== "px-block" && token !== "py-row")
    .join(" ");
}

export function renderSingleBubble(args: {
  readonly role: MessageRole;
  /** #288 — the speaker/timestamp/actions header, when this skin renders it INSIDE its container. It
   *  leads the PADDED content in all three shapes below (plain box · whisper's below-the-band stack ·
   *  ripple's welded-portrait row), so it always sits on the container's own reading inset and shares the
   *  `gap="row"` that separates the body's blocks. Null when the skin's `headerPlacement` is `outside`. */
  readonly header: ReactNode;
  readonly content: ReactNode;
  readonly bubbleClassName: string;
  readonly decoration: BubbleDecoration | null;
  readonly weldedAvatar: ReactElement | null;
}): ReactElement {
  const headerBand = args.decoration?.headerBand;
  const bubbleStyle = args.decoration?.style;
  if (headerBand !== undefined) {
    return (
      <Stack
        data-slot="message-bubble"
        className={cn(withoutBubblePadding(args.bubbleClassName), actionContainmentClass(args.header, CONTAIN_ACTIONS_UNPADDED))}
        style={bubbleStyle}
      >
        <Stack
          aria-hidden="true"
          data-slot="message-band"
          className={cn("rounded-t-card", headerBand.initial !== undefined && "items-center justify-start pt-block")}
          style={headerBand.style}
        >
          {headerBand.initial === undefined ? null : (
            // A decorative aria-hidden mark on the band's own fill — the `monogram` voice (§2.3 as amended,
            // S6); the band owns the ink, which is why the voice carries no colour of its own.
            <Text as="span" voice="monogram" className="text-primary-foreground">
              {headerBand.initial}
            </Text>
          )}
        </Stack>
        <Stack gap="row" className="px-block py-row">
          {args.header}
          {args.content}
        </Stack>
      </Stack>
    );
  }
  if (args.weldedAvatar === null) {
    const edgeTile = args.decoration?.edgeTile;
    return (
      <Stack
        gap="row"
        data-slot="message-bubble"
        // `relative overflow-hidden` ONLY when the Echo fallback tile is present — it anchors the
        // absolutely-positioned tile and clips its feather to the bubble's `rounded-card` corners. No
        // other mode/kind reaches this (the plain bubble is byte-identical without a tile).
        className={cn(args.bubbleClassName, actionContainmentClass(args.header, CONTAIN_ACTIONS_PADDED), edgeTile !== undefined && "relative overflow-hidden")}
        style={bubbleStyle}
      >
        {edgeTile === undefined ? null : (
          <Stack
            aria-hidden="true"
            data-slot="message-edge-tile"
            // The tile IS the art pane on the no-image path, so it takes the pane's own fixed width and the
            // same side the portrait would (#212-3) — pixel-identical geometry between the two arms.
            className={cn(
              "absolute inset-y-0 w-(--immersive-echo-art-width) justify-center",
              edgeTile.side === "left" ? "left-0 items-start ps-block" : "right-0 items-end pe-block",
            )}
            style={edgeTile.style}
          >
            {/* The Echo tile's feathered letter — the same decorative `monogram` voice, sized past the
                title step by the tile's own hero dimension (a mark this large has no type-scale step). */}
            <Text as="span" voice="monogram" className="text-primary-foreground leading-none" style={{ fontSize: "var(--spacing-avatar-hero)" }}>
              {edgeTile.initial}
            </Text>
          </Stack>
        )}
        {args.header}
        {args.content}
      </Stack>
    );
  }
  return (
    <Row
      align="start"
      data-slot="message-bubble"
      className={cn(withoutBubblePadding(args.bubbleClassName), actionContainmentClass(args.header, CONTAIN_ACTIONS_UNPADDED))}
      style={bubbleStyle}
    >
      {args.role === "user" ? null : args.weldedAvatar}
      <Stack gap="row" className="min-w-0 flex-1 px-block py-row">
        {args.header}
        {args.content}
      </Stack>
      {args.role === "user" ? args.weldedAvatar : null}
    </Row>
  );
}
