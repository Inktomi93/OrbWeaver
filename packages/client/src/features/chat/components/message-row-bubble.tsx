// The single-bubble (non-Tide) render shapes, split out of message-row-parts.tsx to stay under the
// component-size cap. No state of its own — renderSingleBubble is a pure (args) => ReactElement the
// bubble slot calls with already-resolved data.

import type { MessageRole } from "@orb/kit/message-role";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
import type { BubbleDecoration } from "../lib/message-row-variants";

// `cn` is configured for the DTCG TYPE-SCALE groups only (lib/class-merge.ts) — custom SPACING tokens
// stay opaque to tailwind-merge, so it doesn't know px-block/py-row conflict with p-*; a p-0 decoration
// className computed to 0 in React but the DOM still rendered the padding utility's declaration.
// Removing the exact classes at the string level sidesteps the merge entirely.
function withoutBubblePadding(className: string): string {
  return className
    .split(" ")
    .filter((token) => token !== "px-block" && token !== "py-row")
    .join(" ");
}

export function renderSingleBubble(args: {
  readonly role: MessageRole;
  readonly content: ReactNode;
  readonly bubbleClassName: string;
  readonly decoration: BubbleDecoration | null;
  readonly weldedAvatar: ReactElement | null;
}): ReactElement {
  const headerBand = args.decoration?.headerBand;
  if (headerBand !== undefined) {
    return (
      <Stack data-slot="message-bubble" className={withoutBubblePadding(args.bubbleClassName)} style={args.decoration?.style}>
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
        className={cn(args.bubbleClassName, edgeTile !== undefined && "relative overflow-hidden")}
        style={args.decoration?.style}
      >
        {edgeTile === undefined ? null : (
          <Stack
            aria-hidden="true"
            data-slot="message-edge-tile"
            className="absolute inset-y-0 right-0 w-(--immersive-echo-feather) items-end justify-center pe-block"
            style={edgeTile.style}
          >
            {/* The Echo tile's feathered letter — the same decorative `monogram` voice, sized past the
                title step by the tile's own hero dimension (a mark this large has no type-scale step). */}
            <Text as="span" voice="monogram" className="text-primary-foreground leading-none" style={{ fontSize: "var(--spacing-avatar-hero)" }}>
              {edgeTile.initial}
            </Text>
          </Stack>
        )}
        {args.content}
      </Stack>
    );
  }
  return (
    <Row align="start" data-slot="message-bubble" className={withoutBubblePadding(args.bubbleClassName)} style={args.decoration?.style}>
      {args.role === "user" ? null : args.weldedAvatar}
      <Stack gap="row" className="min-w-0 flex-1 px-block py-row">
        {args.content}
      </Stack>
      {args.role === "user" ? args.weldedAvatar : null}
    </Row>
  );
}
