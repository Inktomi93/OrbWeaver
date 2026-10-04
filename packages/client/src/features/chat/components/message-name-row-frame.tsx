// The message header's frame: one row anatomy for the settled row and the streaming ghost, and the one
// place its backing is decided. A component rather than a render helper because the sticky arm observes
// whether it is pinned.

import { Row } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
import { usePinnedHeader } from "../hooks/use-pinned-header.ts";
import {
  BG_PHOTO_CHROME_PLATE,
  STICKY_ATTRIBUTION_CHROME,
  STICKY_ATTRIBUTION_CHROME_INSIDE,
  STICKY_ATTRIBUTION_INSIDE_PINNED_PAINT,
  STICKY_ATTRIBUTION_PINNED_PAINT,
  STICKY_ATTRIBUTION_REST_PAINT,
} from "../lib/message-row-backing.ts";
import type { RowSkin } from "../lib/message-row-variants.ts";

type HeaderPlacement = RowSkin["headerPlacement"];

/** The header's FRAME — the ONE home for the chrome row's anatomy, shared by the settled row
 *  (`renderRowNameRow`) and the streaming ghost (`renderGhostNameRow`, #116). Both must carry
 *  the same `data-slot`, the same backings and the same sticky mechanics, because #113's pin is keyed off
 *  exactly this element: a ghost with its own hand-spelled name row would be a second home that silently
 *  stops inheriting the next fix to this one.
 *
 *  PLACEMENT IS THE FIRST QUESTION (#288). `inside` makes this row the CONTAINER's own header row — the
 *  first child of `message-bubble`, taking NO backing of its own because the box the prose rides is what
 *  backs it. `outside` is the pre-#288 anatomy and survives only for `tide`. Read the `HeaderPlacement`
 *  note in message-row-variants.ts for the two-plate mechanism the move closes.
 *
 *  Two backings can land on it, and they are ALTERNATIVES, not layers (#168):
 *   · `BG_PHOTO_CHROME_PLATE` — the wallpaper-gated legibility chip (plate + paired ink, #204 derive
 *     law). Applied ONLY to an `outside` header now (#288): it exists to mint a surface for a row that
 *     has none, and an `inside` header has the container's. #167's ruling — the speaker name and its
 *     timestamp are a GUARANTEE over any art in any skin, never a per-skin opt-in — is what survives, and
 *     it is now honoured by the container instead of by a second plate beside it. Self-gated on the
 *     shell's `data-has-bg-image`: no wallpaper, no chip.
 *   · `STICKY_ATTRIBUTION_CHROME` / `…_INSIDE` (#113) — pin + OPAQUE band, any mode, only for a row the
 *     virtualizer measured as taller than the scrollport. It is the row's one RAISED layer (z-order:
 *     message-row-backing.ts). The two spellings differ in which padding they cancel, in chip rounding,
 *     and in HOW the band's breathing below the name is paid — real `pb-row` outside a container, an
 *     out-of-flow `::after` inside one (#2425, because a bottom padding there would re-enter
 *     `exceedsViewport`'s own input). What is identical is what the reader sees — one --spacing-row of
 *     opaque fill under the name in all eight skins — and the layout-neutrality invariant, which the
 *     `::after` keeps by construction. Rounding is the one REMAINING appearance difference, ruled at #288.
 *     The band PAINTS only while the header is pinned (`usePinnedHeader`); its box applies for the whole
 *     sticky verdict, so pinning toggles paint and never layout.
 *
 *  The pinned band SUPERSEDES the wallpaper chip because an opaque fill is a strict superset of a
 *  translucent plate, and both spell the same property: applied together,
 *  `in-data-[has-bg-image]:bg-reading-plate` outranks a plain `bg-reading-band` on specificity (the two
 *  are the same COLOUR since #241 — but not the same ALPHA, which is the whole ruling), so over ART —
 *  the exact mount #168's live receipt came from — the band would stay translucent and keep showing the
 *  prose scrolling under it.
 *
 *  THE ACTION CLUSTER CONTRIBUTES NO HEIGHT (#204 — the owner's "phantom empty scrim bands" and "the
 *  name is separated from the messages", both one mechanism). The hover-reveal cluster is a 34px row of
 *  icon buttons that is `opacity: 0` at rest but stayed IN FLOW at full height — so the painted chip
 *  measured 50px around a 16px name (50 = 34 + 2×py-row): the empty top/bottom thirds were the phantom
 *  bands, and the ~17px of painted-then-empty space below the name was the detachment. The cluster rides
 *  a ZERO-HEIGHT flex wrapper (`h-0` + centered items): it keeps its full WIDTH in flow (the A3 geometry
 *  pin — a name can never be starved sideways), its buttons keep painting/hit-testing at full size, and
 *  reveal stays opacity-only. The inside arm's only reservation is the row's own minimum height (see the
 *  class list): just enough that the centred rail fits between the container's top edge and the body. */
export interface NameRowFrameProps {
  readonly identity: ReactNode;
  readonly actions: ReactNode;
  readonly stickyAttribution: boolean;
  readonly placement: HeaderPlacement;
  /** ST's user side packs the whole header against the container's trailing edge (#288); every other
   *  arm keeps identity-leading / actions-trailing. */
  readonly mirrored: boolean;
}

export function NameRowFrame(args: NameRowFrameProps): ReactElement {
  const { ref, pinned } = usePinnedHeader(args.stickyAttribution);
  return (
    <Row
      ref={ref}
      justify={args.mirrored ? "end" : "between"}
      align="center"
      gap="field"
      data-slot="message-name-row"
      data-placement={args.placement}
      data-sticky={args.stickyAttribution ? "" : undefined}
      data-pinned={pinned ? "" : undefined}
      className={cn(
        headerBacking(args.placement, args.stickyAttribution, pinned),
        // THE ACTION RAIL'S ONLY RESERVATION. The rail is centred on this row, so a content height of
        // `control-md - 2 * row` makes it span exactly the container's top inset, this row and the
        // `gap-row` below it: contained in the bubble, clear of the prose, and no empty band between
        // name and body. It is unconditional (ghost, editing and sticky arms alike) because the sticky
        // verdict is computed from the measured row height: any box the verdict changed would re-enter
        // its own input and oscillate. `box-content` keeps the sticky band's `pt-row` additive, so its
        // `-mt-row` cancellation stays exact.
        args.placement === "inside" && "box-content min-h-[calc(var(--spacing-control-md)_-_2_*_var(--spacing-row))]",
        // At rest an inside header paints on the role bubble, so every datum must inherit that bubble's
        // paired foreground. Speaker/gloss inks derive from the scope's BASE and are invalid on an
        // independently-picked bubble fill. A pinned row paints its own reading band and keeps that
        // band's base-derived ink instead.
        args.placement === "inside" && !pinned && "[&_[data-slot=message-attribution]_*]:text-inherit [&_[data-slot=message-metadata-timestamp]]:text-inherit",
      )}
    >
      {args.identity}
      {args.actions === null ? null : (
        <Row align="center" className="h-0" data-slot="message-actions-slot">
          {args.actions}
        </Row>
      )}
    </Row>
  );
}

/** The one backing decision, as a total function of the two axes (#288). `inside` at rest takes NOTHING:
 *  the container's fill/plate is the surface, and adding a second one is the defect. */
function headerBacking(placement: HeaderPlacement, stickyAttribution: boolean, pinned: boolean): string {
  if (placement === "outside") {
    if (!stickyAttribution) {
      return BG_PHOTO_CHROME_PLATE;
    }
    return cn(STICKY_ATTRIBUTION_CHROME, pinned ? STICKY_ATTRIBUTION_PINNED_PAINT : STICKY_ATTRIBUTION_REST_PAINT) ?? "";
  }
  if (!stickyAttribution) {
    return "";
  }
  return cn(STICKY_ATTRIBUTION_CHROME_INSIDE, pinned && STICKY_ATTRIBUTION_INSIDE_PINNED_PAINT) ?? "";
}
