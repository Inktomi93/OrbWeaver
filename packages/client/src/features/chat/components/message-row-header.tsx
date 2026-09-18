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
import type { ChatId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
import type { RowAttribution } from "../lib/attribution.ts";
import { BG_PHOTO_CHROME_PLATE, STICKY_ATTRIBUTION_CHROME, STICKY_ATTRIBUTION_CHROME_INSIDE } from "../lib/message-row-backing.ts";
import type { RowSkin } from "../lib/message-row-variants.ts";
import { MessageActionsRow } from "./message-actions-row.tsx";
import { MessageTimestamp } from "./message-metadata-row.tsx";

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
// (skin-parity-2026-08-18.md:219, rated MINOR against ours, taken in the header-anatomy pass). It is
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
        <Row gap="field" align="center" data-slot="message-attribution">
          {renderAttributionName(attribution)}
        </Row>
      )}
      <MessageTimestamp message={message} show={showTimestamp} />
    </Row>
  );
}

/** The header's FRAME — the ONE home for the chrome row's anatomy, shared by the settled row
 *  ({@link renderRowNameRow}) and the streaming ghost ({@link renderGhostNameRow}, #116). Both must carry
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
 *     message-row-backing.ts). The two spellings differ in the `-my-row` gate and in chip rounding —
 *     see the constants; the layout-neutrality invariant is identical.
 *
 *  The sticky band SUPERSEDES the wallpaper chip because an opaque fill is a strict superset of a
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
 *  reveal stays opacity-only. The non-sticky inside arm moves only the rail down by one token block and
 *  reserves the following section gap, containing its paint without overlapping prose or moving the
 *  bubble outside its content-column owner. */
function nameRowFrame(args: {
  readonly identity: ReactNode;
  readonly actions: ReactNode;
  readonly stickyAttribution: boolean;
  readonly placement: HeaderPlacement;
  /** ST's user side packs the whole header against the container's trailing edge (#288); every other
   *  arm keeps identity-leading / actions-trailing. */
  readonly mirrored: boolean;
}): ReactElement {
  return (
    <Row
      justify={args.mirrored ? "end" : "between"}
      align="center"
      gap="field"
      data-slot="message-name-row"
      data-placement={args.placement}
      data-sticky={args.stickyAttribution ? "" : undefined}
      className={cn(
        headerBacking(args.placement, args.stickyAttribution),
        args.placement === "inside" && !args.stickyAttribution && "mb-section",
        // At rest an inside header paints on the role bubble, so every datum must inherit that bubble's
        // paired foreground. Speaker/gloss inks derive from the scope's BASE and are invalid on an
        // independently-picked bubble fill. A sticky row paints its own reading band and keeps that
        // band's base-derived ink instead.
        args.placement === "inside" &&
          !args.stickyAttribution &&
          "[&_[data-slot=message-attribution]_*]:text-inherit [&_[data-slot=message-metadata-timestamp]]:text-inherit",
      )}
    >
      {args.identity}
      {args.actions === null ? null : (
        <Row
          align="center"
          className={cn("h-0", args.placement === "inside" && !args.stickyAttribution && "relative top-block")}
          data-slot="message-actions-slot"
        >
          {args.actions}
        </Row>
      )}
    </Row>
  );
}

/** The one backing decision, as a total function of the two axes (#288). `inside` at rest takes NOTHING:
 *  the container's fill/plate is the surface, and adding a second one is the defect. */
function headerBacking(placement: HeaderPlacement, stickyAttribution: boolean): string {
  if (placement === "outside") {
    return stickyAttribution ? STICKY_ATTRIBUTION_CHROME : BG_PHOTO_CHROME_PLATE;
  }
  return stickyAttribution ? STICKY_ATTRIBUTION_CHROME_INSIDE : "";
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
  return nameRowFrame({
    identity: renderRowIdentity({ attribution: args.attribution, message: args.message, showTimestamp: args.showTimestamp, mirrored }),
    actions: args.actions,
    stickyAttribution: args.stickyAttribution,
    placement: args.placement,
    mirrored,
  });
}

/** THE LIVE TURN'S HEADER (#116) — the same anatomy as the settled row's, minus the two clusters a
 *  pre-commit turn has no data for: there is no `MessageView` yet, so no timestamp, and the action cluster
 *  (edit/swipe/kebab) only exists for canon. What is left is exactly the fact the ghost was missing: WHO is
 *  speaking, for the whole minutes-long generation, in a group room where arbitration picks the speaker.
 *
 *  Riding the shared frame is what buys #113's sticky pin for the live turn for free — once the growing
 *  ghost exceeds the scrollport the surface passes `stickyAttribution` and the name pins to the top of the
 *  scrollport with the stream flowing under it, layout-neutral (`-my-row` cancels `py-row`).
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
  return nameRowFrame({
    identity: (
      <Row gap="field" align="baseline" data-slot="message-attribution">
        {renderAttributionName(attribution)}
      </Row>
    ),
    actions: null,
    stickyAttribution: args.stickyAttribution,
    placement: args.placement,
    // The ghost is always the assistant side; there is no own-message mirror to take.
    mirrored: false,
  });
}

export function renderRowActions(args: {
  readonly editing: boolean;
  readonly selecting: boolean;
  readonly message: MessageView;
  readonly onChatForked: ((chatId: ChatId) => void) | undefined;
  readonly messageActions: "expanded" | "hover" | undefined;
  /** WIREBTN — gates the kebab's host-only "View wire trace…" item (see `MessageActionsRow`). */
  readonly viewerIsHost: boolean | undefined;
  /** #167 — the raw model identifier this reply is credited to, already gated by the `showModelIcon`
   *  appearance toggle upstream; null ⇒ no credit. The cluster derives its DISPLAY name. */
  readonly modelCredit: string | null;
  /** B7 — the room's present characters names (the picker's segment-target parse; see `MessageActionsRowProps`). */
  readonly characterNames?: readonly string[] | undefined;
}): ReactNode {
  if (args.editing || args.selecting) {
    return null;
  }
  return (
    <MessageActionsRow
      message={args.message}
      onChatForked={args.onChatForked}
      messageActions={args.messageActions}
      viewerIsHost={args.viewerIsHost}
      modelCredit={args.modelCredit}
      characterNames={args.characterNames}
    />
  );
}
