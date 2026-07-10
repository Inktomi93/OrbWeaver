// The single-bubble body render SHAPES (non-Tide), split out of message-row-parts.tsx to keep both files
// under the 450-line component-size cap (UI-Architecture-and-Layout.md §2.1; gate `component-size`) — the
// no-avatar first-class fallback TILE renderers (Whisper's hue band + Echo's edge tile, owner ruling
// 2026-07-09) are the coherent seam that tipped it over. Like message-row-parts.tsx, this file holds no
// state: `renderSingleBubble` is a pure `(args) => ReactElement` the bubble slot (`renderRowBubble`, still
// in message-row-parts.tsx) calls with already-resolved data. `renderRowBubble` owns the Tide train branch
// + the attribution ThemeScope wrap; THIS file owns only the one-bubble shape it delegates to.

import type { MessageRole } from "@orb/kit/message-role";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
import type { BubbleDecoration } from "../lib/message-row-variants";

/** Strips the uniform `px-block`/`py-row` padding utilities `skin.inner()` bakes into every bubble's
 *  className — used ONLY for Ripple's weld / Whisper's band (below), which need the OUTER container
 *  unpadded (the portrait/band sits flush at its edge) while the text column carries its own padding
 *  instead. A plain token-exact filter, not a `cn()`/tailwind-merge override: `cn` here is `#lib`'s raw
 *  re-export of `tailwind-variants`' own merge (NOT the `tv`-configured factory, which is the only
 *  instance carrying the project's custom classGroups), so it doesn't know `px-block`/`py-row` conflict
 *  with `p-*` — the SAME class of footgun `#lib`'s own file header documents for `text-*` (verified
 *  in-browser: an appended `p-0` decoration className computed to 0 in React but the DOM still rendered
 *  `8px 12px`, the padding utilities' declaration simply winning the cascade). Removing the exact classes
 *  at the string level sidesteps the merge entirely. */
function withoutBubblePadding(className: string): string {
  return className
    .split(" ")
    .filter((token) => token !== "px-block" && token !== "py-row")
    .join(" ");
}

/** The single-bubble (non-Tide) render: the plain padded `<Stack>` (every mode/kind with neither a
 *  welded avatar nor a header band), Whisper's header-band weld (below), or Ripple's welded-portrait weld
 *  — the portrait sits INSIDE the same Row as the bubble's own bg/rounded-card (`bubbleClassName`,
 *  padding stripped via {@link withoutBubblePadding}) so there is no gap and no separate visible edge
 *  between portrait and text — the row's own painted background is what "wraps" both, not either child's
 *  individual box. The text column carries the padding the bubble normally applies uniformly. Its own
 *  function (not inlined in `renderRowBubble`) to avoid a nested ternary (biome `noNestedTernary`). */
export function renderSingleBubble(args: {
  readonly role: MessageRole;
  readonly content: ReactNode;
  readonly bubbleClassName: string;
  readonly decoration: BubbleDecoration | null;
  readonly weldedAvatar: ReactElement | null;
}): ReactElement {
  const headerBand = args.decoration?.headerBand;
  if (headerBand !== undefined) {
    // Whisper's weld: the SAME unpadded-outer-container shape as Ripple's below, but the welded child is
    // a full-bleed BAND stacked ABOVE the text (not a side avatar) — `rounded-t-card` matches only the
    // band's own top corners to the bubble's `rounded-card` radius (the two share one token, so the
    // curve lines up exactly with no clipping/overflow trick needed). The band is `aria-hidden` (pure
    // decoration, the character's name/identity is already carried by the sibling avatar chip + the
    // name row above the bubble).
    return (
      <Stack
        data-slot="message-bubble"
        className={withoutBubblePadding(args.bubbleClassName)}
        style={args.decoration?.style}
      >
        {/* The band is `aria-hidden` decoration (the identity is already carried by the sibling chip +
            the name row). On the no-image FALLBACK path (owner ruling 2026-07-09) it paints the entity's
            hue field + the initial — top-anchored (`justify-start`) so the glyph sits in the band's
            visible zone, above where the feather dissolves it into the bubble. With an image, no initial. */}
        <Stack
          aria-hidden="true"
          data-slot="message-band"
          className={cn(
            "rounded-t-card",
            headerBand.initial !== undefined && "items-center justify-start pt-block",
          )}
          style={headerBand.style}
        >
          {headerBand.initial === undefined ? null : (
            <Text as="span" size="title" weight="semibold" className="text-primary-foreground">
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
        {/* Echo's no-image FALLBACK edge tile (owner ruling 2026-07-09 — a first-class avatar): a hue
            field pinned to the bled edge, `--immersive-echo-feather` wide (the SAME stop the bubble
            reserves as `padding-right`), feathering into the bubble bg exactly like the portrait would.
            `items-end` puts the initial at the fully-visible outer edge (never under the feather).
            Rendered BEFORE the text so the text paints on top; `aria-hidden` (decoration only). */}
        {edgeTile === undefined ? null : (
          <Stack
            aria-hidden="true"
            data-slot="message-edge-tile"
            className="absolute inset-y-0 right-0 w-(--immersive-echo-feather) items-end justify-center pe-block"
            style={edgeTile.style}
          >
            {/* Owner ruling 2026-07-09 (side-eye receipt): the fallback initial must read as a scannable
                "who's talking" mark, not a 16px easter egg in a huge tile. Sized off the hero-avatar
                glyph token (`--spacing-avatar-hero` = 64px, ~4× the old title size) since no font-size
                token that large exists — it IS an avatar-scale initial. Tone stays the avatar-chip pairing
                (`text-primary-foreground`, AA 6.2–8.3:1 against ALL 5 hue fields — variants.ts), and
                `items-end` keeps it in the tile's fully-visible (un-feathered) hue zone where that pairing
                holds. `leading-1` tightens the box so the big glyph centers cleanly. */}
            <Text
              as="span"
              weight="bold"
              className="text-primary-foreground"
              style={{ fontSize: "var(--spacing-avatar-hero)", lineHeight: "1" }}
            >
              {edgeTile.initial}
            </Text>
          </Stack>
        )}
        {args.content}
      </Stack>
    );
  }
  return (
    <Row
      align="start"
      data-slot="message-bubble"
      className={withoutBubblePadding(args.bubbleClassName)}
      style={args.decoration?.style}
    >
      {args.role === "user" ? null : args.weldedAvatar}
      <Stack gap="row" className="min-w-0 flex-1 px-block py-row">
        {args.content}
      </Stack>
      {args.role === "user" ? args.weldedAvatar : null}
    </Row>
  );
}
