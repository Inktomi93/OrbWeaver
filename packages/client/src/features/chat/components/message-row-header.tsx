// THE MESSAGE ROW'S HEADER — speaker name · timestamp · action cluster — and the ONE decision about where
// that header lives. Split out of message-row-parts.tsx when #288 pushed that file past the 450-line
// component cap; the split is by CONCEPT, not by line count: everything here answers "who is speaking and
// what can I do about it", and the settled row, the streaming ghost and the skin table all reach it
// through this one module. No state of its own — every export is a pure (args) => ReactNode.
//
// THE ANATOMY QUESTION THIS MODULE OWNS (#288, owner-raised three times on 2026-08-19). A row reads as TWO
// objects whenever its body carries a backing and its header carries a DIFFERENT one — true of the filled
// skins in every room, and of the no-fill skins over a wallpaper (body plate + header chip). Seven of the
// eight skins therefore render this header INSIDE their container, where the box the prose already rides
// backs it; `tide` alone keeps the pre-#288 sibling-above anatomy, because a train of per-paragraph pills
// has no single container to be inside. The axis is declared per skin (`RowSkin.headerPlacement`,
// message-row-variants.ts) and routed by `placeRowHeader` below.

import type { MessageView } from "@orb/contracts/chat";
import type { MessageRole } from "@orb/kit/message-role";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement, ReactNode } from "react";
import type { RowAttribution } from "../lib/attribution.ts";
import type { RowSkin } from "../lib/message-row-variants.ts";
import { MessageActionsRow } from "./message-actions-row.tsx";
import { MessageTimestamp } from "./message-metadata-row.tsx";
import { NameRowFrame } from "./message-name-row-frame.tsx";

/** Read off the skin table rather than re-declared: the table owns the axis (`no-inline-types`). */
type HeaderPlacement = RowSkin["headerPlacement"];

/** #288 — THE HEADER'S ONE NODE, ROUTED TO ITS ONE HOME. `inside` (seven of the eight skins) hands it to
 *  the container, which renders it as its own header row; `outside` (tide) keeps the sibling above the box.
 *  Returning the PAIR from one call is what makes "exactly one header" structural instead of an agreement
 *  between two ternaries, and both the settled row and the streaming ghost route through it — so a turn
 *  cannot change anatomy at commit. */
export function placeRowHeader(node: ReactNode, placement: HeaderPlacement): { readonly above: ReactNode; readonly inside: ReactNode } {
  return placement === "inside" ? { above: null, inside: node } : { above: node, inside: null };
}

function renderAttributionName(attribution: RowAttribution): ReactElement | null {
  if (attribution.name === null) {
    return null;
  }
  // The speaker's name IS the name of this row's one datum — the `label` voice (UI-Density-Law.md §2.3).
  if (attribution.tokens === null) {
    return (
      <Text as="span" voice="label">
        {attribution.name}
      </Text>
    );
  }
  return (
    <ThemeScope tokens={attribution.tokens} className="contents">
      <Text as="span" voice="label" className="text-speaker">
        {attribution.name}
      </Text>
    </ThemeScope>
  );
}

// The header's leading cluster (D66 N3): the speaker name (when a roster is threaded) + the quiet inline
// timestamp beside it. Renders nothing when there is neither a name nor a shown timestamp.
//
// `mirrored` (#288) is the ST user-side order — `datetime · name`, packed to the trailing edge
// (the retired skin-parity-2026-08-18 review:219, rated MINOR against ours, taken in the header-anatomy pass). It is
// spelled as PAINT (`flex-row-reverse`), never as a reordered JSX pair: the DOM order stays name-then-
// timestamp, so every assistive reading order still announces the SPEAKER first — the row's one datum —
// on both sides of the transcript. A skin whose header sits outside its container is never mirrored: the
// order only reads as a mirror when the cluster is packed against a container edge.
function renderRowIdentity(args: {
  readonly attribution: RowAttribution;
  readonly message: MessageView;
  readonly showTimestamp: boolean;
  readonly mirrored: boolean;
}): ReactNode {
  const { attribution, message, showTimestamp, mirrored } = args;
  if (attribution.name === null && !showTimestamp) {
    return null;
  }
  return (
    <Row gap="field" align="center" className={mirrored ? "flex-row-reverse" : undefined}>
      {attribution.name === null ? null : (
        // BASELINE, like the ghost's copy of this cluster (`renderGhostNameRow`) and like the appearance
        // contract's own declaration for this row (`appearance-invariant-manifest.ts`
        // #dark-name-time-short-bubble: tailwind-core `items-center` -> `items-baseline` on
        // `[data-slot="message-attribution"]`). The settled row was the arm that never took it, and the
        // name is the one datum whose size moves independently (`--reading-name-scale`, globals.css:795),
        // so centring it puts a scaled name off the line its own row sits on.
        <Row gap="field" align="baseline" data-slot="message-attribution">
          {renderAttributionName(attribution)}
        </Row>
      )}
      <MessageTimestamp message={message} show={showTimestamp} />
    </Row>
  );
}

/** The settled row's header: the identity cluster leading, the action cluster trailing. */
export function renderRowNameRow(args: {
  readonly attribution: RowAttribution;
  readonly message: MessageView;
  readonly showTimestamp: boolean;
  readonly stickyAttribution: boolean;
  readonly actions: ReactNode;
  readonly placement: HeaderPlacement;
  readonly role: MessageRole;
}): ReactElement {
  // Mirroring is the OWN-SIDE read: it only exists when the header is packed inside a container edge.
  const mirrored = args.placement === "inside" && args.role === "user";
  return (
    <NameRowFrame
      identity={renderRowIdentity({ attribution: args.attribution, message: args.message, showTimestamp: args.showTimestamp, mirrored })}
      actions={args.actions}
      stickyAttribution={args.stickyAttribution}
      placement={args.placement}
      mirrored={mirrored}
    />
  );
}

/** THE LIVE TURN'S HEADER (#116) — the same anatomy as the settled row's, minus the two clusters a
 *  pre-commit turn has no data for: there is no `MessageView` yet, so no timestamp, and the action cluster
 *  (edit/swipe/kebab) only exists for canon. What is left is exactly the fact the ghost was missing: WHO is
 *  speaking, for the whole minutes-long generation, in a group room where arbitration picks the speaker.
 *
 *  Riding the shared frame is what buys #113's sticky pin for the live turn for free — once the growing
 *  ghost exceeds the scrollport the surface passes `stickyAttribution` and the name pins to the top of the
 *  scrollport with the stream flowing under it, layout-neutral (the band's `pt-row` is cancelled by
 *  `-mt-row`, and the inside row's minimum height stands in every arm, rail or no rail).
 *
 *  ARIA: plain text inside the ghost ROW's own live region, and nothing more. Post-#1499 the transcript
 *  CONTAINER is explicitly `aria-live="off"` (its implicit `role="log"` politeness announced every
 *  historical row a scroll-back remounted) and the live region moved to the append point — the last row,
 *  which is the ghost while a turn streams (`@orb/ui/message-list`'s `announce.ts` owns that rule). The name
 *  is deliberately NOT given a second accessible home (no `role="article"`/`aria-label` on the ghost, the
 *  way the settled row has one): the row's region is not `aria-atomic`, so the name enters the announcement
 *  stream exactly ONCE, when the row appears, and every later delta announces only the delta. */
export function renderGhostNameRow(args: {
  readonly attribution: RowAttribution | undefined;
  readonly stickyAttribution: boolean;
  /** #288 — the SAME placement the settled row will use for this chatStyle. A live turn whose header sat
   *  above the bubble and jumped inside it at commit would be a visible one-frame reflow on every reply. */
  readonly placement: HeaderPlacement;
}): ReactElement | null {
  const attribution = args.attribution;
  if (attribution === undefined || attribution.name === null) {
    return null;
  }
  return (
    <NameRowFrame
      identity={
        <Row gap="field" align="baseline" data-slot="message-attribution">
          {renderAttributionName(attribution)}
        </Row>
      }
      actions={null}
      stickyAttribution={args.stickyAttribution}
      placement={args.placement}
      // The ghost is always the assistant side; there is no own-message mirror to take.
      mirrored={false}
    />
  );
}

export function renderRowActions(args: {
  readonly editing: boolean;
  readonly selecting: boolean;
  readonly message: MessageView;
  readonly messageActions: "expanded" | "hover" | undefined;
  /** WIREBTN — gates the kebab's host-only "View wire trace…" item (see `MessageActionsRow`). */
  readonly viewerIsHost: boolean | undefined;
  /** Show the generation credit, already gated by the `showModelIcon` appearance toggle upstream. */
  readonly generationCredit: boolean;
  /** B7 — the room's present characters names (the picker's segment-target parse; see `MessageActionsRowProps`). */
  readonly characterNames?: readonly string[] | undefined;
}): ReactNode {
  if (args.editing || args.selecting) {
    return null;
  }
  return (
    <MessageActionsRow
      message={args.message}
      messageActions={args.messageActions}
      viewerIsHost={args.viewerIsHost}
      generationCredit={args.generationCredit}
      characterNames={args.characterNames}
    />
  );
}
