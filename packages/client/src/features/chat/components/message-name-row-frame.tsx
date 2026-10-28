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
import type { RowSkin } from "../lib/message-row-variants.ts";
import { ROLE_FILL } from "../lib/message-row-variants.ts";
import type { HeaderShape } from "../lib/row-placement.ts";

type HeaderPlacement = RowSkin["headerPlacement"];

// THE STICKY PIN: the identity header stays within its own row while pinning to the scrollport's
// top as the row's one raised layer (`--z-raised`, scoped to the row's stacking context, never over the shell). It is
// positioned inside the row: only its top inset is cancelled, because a negative bottom margin lets the
// sticky band paint past the row's bottom. Over wallpaper the chrome plate already supplies the outside inset.
// Inside a container only the top inset is cancelled; the bottom inset contains the action rail's focus paint.
// `-top-px` rather than `top-0` because the pin observer reads the pin as a one-pixel top clip.
const STICKY_OUTSIDE = "not-in-data-[has-bg-image]:-mbs-row sticky -inset-bs-px z-(--z-raised) py-row";
const STICKY_INSIDE = "-mbs-row sticky -inset-bs-px z-(--z-raised) py-row";

// While pinned, a card's bar reaches the card's side edges: the bubble's own inset on each side, which client
// globals.css defaults to `--spacing-block` and echo widens to its art pane. A band reaches across the column's inset.
const REACH_CARD = "-ms-(--row-reach-left) ps-(--row-reach-left) -me-(--row-reach-right) pe-(--row-reach-right)";
const REACH_COLUMN = "-mx-section px-section @max-cq-28:-mx-row @max-cq-28:px-row";

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
  readonly placement: HeaderPlacement;
  /** User identity sits at the trailing edge; its action cluster takes the opposite edge. */
  readonly mirrored: boolean;
  /** `RowSkin.pinnedHeader`: the row's own surface, applied only while pinned. */
  readonly pinnedHeader: RowSkin["pinnedHeader"];
  readonly messageRole: MessageRole;
  /** Whether the bar names the speaker and takes a line of its own (`headerShape`). */
  readonly shape: HeaderShape;
}

export function NameRowFrame({
  identity,
  actions,
  stickyAttribution,
  actionsReveal,
  placement,
  mirrored,
  pinnedHeader,
  messageRole,
  shape,
}: NameRowFrameProps): ReactElement {
  const sticky = stickyAttribution && (shape.ownLine || actions !== null);
  const { ref, pinned } = usePinnedHeader(sticky);
  const outside = placement === "outside";
  const reach = pinned ? pinnedHeader.reach : "none";
  const overlayClass = shape.ownLine ? undefined : overlayLayout(sticky);
  return (
    <FrameRow
      rowRef={ref}
      placement={placement}
      sticky={sticky}
      pinned={pinned}
      bubbleInk={pinned ? pinnedHeader.fill === "role" : !outside}
      plate={outside && !pinned ? outsidePlate(sticky) : undefined}
      paint={pinned ? pinnedPaint(pinnedHeader, messageRole) : NO_PAINT}
      flip={mirrored}
      stickyOutside={sticky && outside}
      stickyInside={sticky && !outside}
      reachCard={reach === "card"}
      reachColumn={reach === "column"}
      reachTrain={reach === "train"}
      chip={!shape.identity}
      outside={outside}
      overlayClass={overlayClass}
      overlayReveal={shape.ownLine ? undefined : ACTIONS_REVEAL_POSTURE[actionsReveal]}
      reserve={!outside && shape.ownLine}
    >
      {identity}
      {actions === null ? null : (
        <Row align="center" className="block-0 min-block-(--size-glyph-lg)" data-slot="message-actions-slot">
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
  readonly placement: HeaderPlacement;
  readonly sticky: boolean;
  readonly pinned: boolean;
  readonly bubbleInk: boolean;
  readonly plate: "island" | "chrome" | undefined;
  readonly paint: FramePaint;
  readonly flip: boolean;
  readonly stickyOutside: boolean;
  readonly stickyInside: boolean;
  readonly reachCard: boolean;
  readonly reachColumn: boolean;
  readonly reachTrain: boolean;
  readonly chip: boolean;
  readonly outside: boolean;
  readonly overlayClass: string | undefined;
  readonly overlayReveal: (typeof ACTIONS_REVEAL_POSTURE)[ActionsReveal];
  readonly reserve: boolean;
  readonly children: ReactNode;
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
  reachCard,
  reachColumn,
  reachTrain,
  chip,
  outside,
  overlayClass,
  overlayReveal,
  reserve,
  children,
}: FrameRowProps): ReactElement {
  return (
    <Row
      ref={rowRef}
      justify={chip ? "end" : "between"}
      align="center"
      gap="field"
      data-slot="message-name-row"
      data-placement={placement}
      data-sticky={sticky ? "" : undefined}
      data-pinned={pinned ? "" : undefined}
      data-bubble-ink={bubbleInk ? "" : undefined}
      plate={plate}
      ground={paint.ground}
      cardCorners={paint.cardCorners}
      reveal={overlayReveal}
      className={cn(
        "flex-wrap",
        flip && "flex-row-reverse",
        stickyOutside && STICKY_OUTSIDE,
        stickyInside && STICKY_INSIDE,
        reachCard && REACH_CARD,
        reachColumn && REACH_COLUMN,
        reachTrain && "self-stretch",
        // An actions-only bar stays a trailing chip at rest. Its pinned frame spans the reading width so
        // partially covered text cannot look like a complete line. Off the last row it remains an overlay.
        chip && !pinned && "ms-auto inline-fit",
        // An outside header (tide's) sits on the same inset as the pager under its train, so the last action
        // ends where the forward chevron does and its touch area stays inside the scrollport.
        outside && "px-field",
        overlayClass,
        // The rail is centred on this row, so a content height of
        // `glyph-lg - 2 * row` makes it span exactly the container's top inset, this row and the `gap-row` below it.
        // It is unconditional across ghost, editing and sticky arms. `box-content` keeps the sticky band's `pt-row` additive, so its cancellation stays exact.
        reserve && "box-content min-block-(--size-name-row-min)",
      )}
    >
      {children}
    </Row>
  );
}
