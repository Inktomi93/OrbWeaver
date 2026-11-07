// The message header's frame: one row anatomy for the settled row and the streaming ghost, and the one
// place its backing is decided. A component rather than a render helper because the sticky arm observes
// whether it is pinned.

import type { MessageRole } from "@orb/kit/message-role";
import { Row } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
import { usePinnedHeader } from "../hooks/use-pinned-header.ts";
import type { ActionsReveal } from "../lib/message-actions-reveal.ts";
import { ACTIONS_REVEAL_POSTURE } from "../lib/message-actions-reveal.ts";
import type { HeaderEdges, RowSkin } from "../lib/message-row-variants.ts";
import { ROLE_FILL } from "../lib/message-row-variants.ts";
import type { HeaderShape } from "../lib/row-placement.ts";

/** The header row's inline inset, decided once from its placement and the reach of its pinned bar. `pager` is an outside
 *  header's (tide's), which sits on the inset of the pager under its train so the last action ends where the forward
 *  chevron does and its touch area stays inside the scrollport; it holds the same at rest and pinned. While pinned, a card's
 *  bar reaches the card's side edges and a band reaches across the reading box's inset. */
const FRAME_INSET = {
  none: { paddingInline: undefined, reach: undefined, reachCard: undefined },
  pager: { paddingInline: "field", reach: undefined, reachCard: undefined },
  card: { paddingInline: undefined, reach: undefined, reachCard: "header" },
  column: { paddingInline: undefined, reach: "column", reachCard: undefined },
  page: { paddingInline: undefined, reach: "page", reachCard: undefined },
} as const;
type FrameInset = keyof typeof FRAME_INSET;

function frameInset(edges: HeaderEdges, pinned: boolean): FrameInset {
  if (edges.headerPlacement === "outside") {
    return "pager";
  }
  return pinned ? edges.pinnedHeader.reach : "none";
}

/** The header's FRAME — the ONE home for the chrome row's anatomy, shared by the settled row
 *  (`renderRowNameRow`) and the streaming ghost (`renderGhostNameRow`). Both carry the same `data-slot`, the same
 *  backings and the same sticky mechanics, because the pin is keyed off exactly this element.
 *
 *  PLACEMENT IS THE FIRST QUESTION. `inside` makes this row the container's own header row, the first child of
 *  `message-bubble`, taking no backing of its own because the box the prose rides backs it. `outside` (tide) is a
 *  sibling above a train of pills, and over a wallpaper takes the chrome plate, because nothing else backs it.
 *
 *  Two backings can land on it, and they are ALTERNATIVES, not layers: the wallpaper chrome plate (outside only), and
 *  the pinned band (any skin, only while pinned). The pinned band supersedes the plate because an opaque fill is a
 *  strict superset of a translucent one, and the plate's wallpaper-gated fill would outrank the band over art.
 *
 *  While an inside header sits on the role bubble at rest, or pins on the role's own fill, its name and timestamp
 *  take that fill's paired ink (`data-bubble-ink`, client globals.css): the speaker and gloss inks derive from the
 *  scope's base and are not judged against a bubble fill. A band keeps its base-derived ink.
 *
 *  The action wrapper reserves its full glyph height. The header inset contains the focused ring and
 *  coarse-pointer hit area, including when the rail wraps below the identity. */
export interface NameRowFrameProps {
  readonly identity: ReactNode;
  readonly actions: ReactNode;
  readonly stickyAttribution: boolean;
  readonly actionsReveal: ActionsReveal;
  /** The skin's header placement and the row's own surface its pinned bar paints (`RowSkin`). */
  readonly edges: HeaderEdges;
  /** User identity sits at the trailing edge; its action cluster takes the opposite edge. */
  readonly mirrored: boolean;
  readonly messageRole: MessageRole;
  /** Whether the bar names the speaker and takes a line of its own (`headerShape`). */
  readonly shape: HeaderShape;
  /** A hairline under the bar (`RowSkin.headerRule`). */
  readonly rule: boolean;
}

export function NameRowFrame({
  identity,
  actions,
  stickyAttribution,
  actionsReveal,
  edges,
  mirrored,
  messageRole,
  shape,
  rule,
}: NameRowFrameProps): ReactElement {
  const sticky = stickyAttribution && (shape.ownLine || actions !== null);
  const { ref, pinned } = usePinnedHeader(sticky);
  const outside = edges.headerPlacement === "outside";
  const pinnedHeader = edges.pinnedHeader;
  const inset = frameInset(edges, pinned);
  const overlayClass = shape.ownLine ? undefined : overlayLayout(sticky);
  return (
    <FrameRow
      rowRef={ref}
      placement={edges.headerPlacement}
      sticky={sticky}
      pinned={pinned}
      bubbleInk={pinned ? pinnedHeader.fill === "role" : !outside}
      plate={outside && !pinned ? outsidePlate(sticky) : undefined}
      paint={pinned ? pinnedPaint(pinnedHeader, messageRole) : NO_PAINT}
      flip={mirrored}
      stickyOutside={sticky && outside}
      stickyInside={sticky && !outside}
      inset={inset}
      reachTrain={pinned && pinnedHeader.reach === "train"}
      chip={!shape.identity}
      overlayClass={overlayClass}
      overlayReveal={shape.ownLine ? undefined : ACTIONS_REVEAL_POSTURE[actionsReveal]}
      reserve={!outside && shape.ownLine}
      rule={rule}
    >
      {identity}
      {actions === null ? null : (
        <Row align="center" cap="fitNarrow" height="rail" data-slot="message-actions-slot">
          {actions}
        </Row>
      )}
    </FrameRow>
  );
}

function overlayLayout(sticky: boolean): string {
  return sticky
    ? "box-content min-block-(--size-name-row-min) col-start-1 row-start-1 self-start"
    : "box-content block-(--size-glyph-lg) col-start-1 row-start-1 self-start";
}

/** An outside header's wallpaper plate at rest: the chrome island, or its bare island once the sticky box carries the inset. */
function outsidePlate(sticky: boolean): "island" | "chrome" {
  return sticky ? "island" : "chrome";
}

interface FramePaint {
  readonly ground: (typeof ROLE_FILL)[MessageRole] | "readingBand" | undefined;
  readonly cardCorners: RowSkin["pinnedHeader"]["corners"];
}

const NO_PAINT: FramePaint = { ground: undefined, cardCorners: undefined };

/** The pinned bar's opaque fill and the card corners it follows. */
function pinnedPaint(pinned: RowSkin["pinnedHeader"], role: MessageRole): FramePaint {
  if (pinned.fill === "none") {
    return NO_PAINT;
  }
  return { ground: pinned.fill === "role" ? ROLE_FILL[role] : "readingBand", cardCorners: pinned.corners };
}

interface FrameRowProps {
  readonly rowRef: ReturnType<typeof usePinnedHeader>["ref"];
  readonly placement: HeaderEdges["headerPlacement"];
  readonly sticky: boolean;
  readonly pinned: boolean;
  readonly bubbleInk: boolean;
  readonly plate: "island" | "chrome" | undefined;
  readonly paint: FramePaint;
  readonly flip: boolean;
  readonly stickyOutside: boolean;
  readonly stickyInside: boolean;
  readonly inset: FrameInset;
  readonly reachTrain: boolean;
  readonly chip: boolean;
  readonly overlayClass: string | undefined;
  readonly overlayReveal: (typeof ACTIONS_REVEAL_POSTURE)[ActionsReveal];
  readonly reserve: boolean;
  readonly rule: boolean;
  readonly children: ReactNode;
}

function stickyPin(outside: boolean, inside: boolean): "headerOutside" | "header" | undefined {
  if (outside) {
    return "headerOutside";
  }
  return inside ? "header" : undefined;
}

/** The frame's element: every layout choice arrives as a flag, every paint as a primitive prop. */
function FrameRow({
  rowRef,
  placement,
  sticky,
  pinned,
  bubbleInk,
  plate,
  paint,
  flip,
  stickyOutside,
  stickyInside,
  inset,
  reachTrain,
  chip,
  overlayClass,
  overlayReveal,
  reserve,
  rule,
  children,
}: FrameRowProps): ReactElement {
  return (
    <Row
      ref={rowRef}
      justify={chip ? "end" : "between"}
      align="center"
      gap="field"
      divider={rule ? "bottom" : undefined}
      data-slot="message-name-row"
      data-placement={placement}
      data-sticky={sticky ? "" : undefined}
      data-pinned={pinned ? "" : undefined}
      data-bubble-ink={bubbleInk ? "" : undefined}
      plate={plate}
      ground={paint.ground}
      cardCorners={paint.cardCorners}
      reveal={overlayReveal}
      paddingBlock={sticky ? "row" : undefined}
      paddingInline={FRAME_INSET[inset].paddingInline}
      reach={FRAME_INSET[inset].reach}
      reachCard={FRAME_INSET[inset].reachCard}
      pinned={stickyPin(stickyOutside, stickyInside)}
      // An actions-only bar stays a trailing chip at rest. Its pinned frame spans the reading width so
      // partially covered text cannot look like a complete line. Off the last row it remains an overlay.
      width={chip && !pinned ? "fit" : undefined}
      reverse={flip}
      wrap={true}
      push={chip && !pinned ? "inlineEnd" : undefined}
      minHeight={reserve ? "nameRow" : undefined}
      className={cn(
        reachTrain && "self-stretch",
        overlayClass,
        // The rail is centred on this row, so a content height of
        // `glyph-lg - 2 * row` makes it span exactly the container's top inset, this row and the `gap-row` below it.
        // It is unconditional across ghost, editing and sticky arms. `box-content` keeps the sticky band's `pt-row` additive, so its cancellation stays exact.
        reserve && "box-content",
      )}
    >
      {children}
    </Row>
  );
}
