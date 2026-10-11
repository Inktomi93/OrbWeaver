// The single-bubble (non-Tide) render shapes, split out of message-row-parts.tsx to stay under the
// component-size cap. No state of its own — renderSingleBubble is a pure (args) => ReactElement the
// bubble slot calls with already-resolved data.

import type { MessageRole } from "@orb/kit/message-role";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
import type { BubbleDecoration } from "../lib/message-row-variants.ts";

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

/** A speaker's art as the tap target that opens it full size: `open` receives the button so focus can return to it. */
export interface ArtView {
  readonly label: string;
  readonly open: (opener: HTMLElement) => void;
}

// Fills the art it sits in, so the whole tile is the control. The ghost-fill hover is dropped: a tint over the
// art itself would read as a smudge, and the press scale already answers a tap. It is not a tab stop: the
// speaker's chip beside it opens the same image, so keyboard readers get one stop per row.
function artViewButton(view: ArtView, rounding = ""): ReactElement {
  return (
    <Button
      aria-label={view.label}
      className={cn("absolute inset-0 cursor-pointer hover:bg-transparent active:bg-transparent", rounding) ?? ""}
      intent="ghost"
      tabIndex={-1}
      onClick={(event): void => view.open(event.currentTarget)}
      size="media"
    />
  );
}

// aria-hidden only while the art is decorative: a hidden subtree must not hold a focusable control.
function whisperBand(headerBand: NonNullable<BubbleDecoration["headerBand"]>, view: ArtView | null): ReactElement {
  return (
    <Stack
      aria-hidden={view === null ? "true" : undefined}
      data-slot="message-band"
      className={cn("relative rounded-t-card", view !== null && "hover:opacity-80", headerBand.className)}
      style={headerBand.style}
    >
      {fallbackLetter(headerBand.fallback)}
      {view === null ? null : artViewButton(view)}
    </Stack>
  );
}

// The initial a speaker's fallback art carries, in the avatar fallback's own ink; the art is decorative, so it is hidden.
function fallbackLetter(initials: string | undefined): ReactElement | null {
  return initials === undefined ? null : (
    <Stack
      align="center"
      aria-hidden="true"
      className="absolute inset-0 font-medium text-primary-foreground text-title leading-title uppercase"
      justify="center"
    >
      {initials}
    </Stack>
  );
}

// The pane's width, a portrait's height (Moonlit's fixed mobile height on a phone), never past the card's own
// foot; cover-cropped from its centre. Inert unless it is the tap target for the full-size view.
// The feathered mask sits on the inner tile only, so the button over it is an unmasked layer and its focus ring shows.
function echoArtTile(art: NonNullable<BubbleDecoration["art"]>, view: ArtView | null): ReactElement {
  const rounding = art.side === "left" ? "rounded-tl-card" : "rounded-tr-card";
  const { width, ...paint } = art.style;
  return (
    <Stack
      aria-hidden={view === null ? "true" : undefined}
      className={cn(
        "absolute top-0 aspect-(--aspect-portrait) max-h-full @max-md:aspect-auto @max-md:h-(--immersive-echo-art-height-phone)",
        view === null ? "pointer-events-none" : "group/art",
        art.side === "left" ? "left-0" : "right-0",
      )}
      style={{ width }}
    >
      <Stack
        data-slot="message-echo-art"
        className={cn("absolute inset-0 bg-center bg-cover bg-no-repeat", view !== null && "group-hover/art:opacity-80", rounding)}
        style={paint}
      />
      {fallbackLetter(art.fallback)}
      {view === null ? null : artViewButton(view, rounding)}
    </Stack>
  );
}

export function renderSingleBubble(args: {
  readonly role: MessageRole;
  /** #288 — the speaker/timestamp/actions header, when this skin renders it INSIDE its container. It
   *  leads the PADDED content in all three shapes below (plain box · whisper's below-the-band stack ·
   *  ripple's welded-portrait row), so it always sits on the container's own reading inset and shares the
   *  `gap="row"` that separates the body's blocks. Null when the skin's `headerPlacement` is `outside`. */
  readonly header: ReactNode;
  readonly content: ReactNode;
  /** The swipe foot, the container's last line when the skin seats it inside; null otherwise. */
  readonly footer: ReactNode;
  readonly bubbleClassName: string;
  readonly decoration: BubbleDecoration | null;
  readonly weldedAvatar: ReactElement | null;
  /** The row sits mirrored, so the welded portrait sits on the trailing side. */
  readonly mirrored: boolean;
  /** Opens the decoration's art full size; null where the row has no art to open or no viewer to open it in. */
  readonly artView: ArtView | null;
}): ReactElement {
  const headerBand = args.decoration?.headerBand;
  const bubbleStyle = args.decoration?.style;
  if (headerBand !== undefined) {
    return (
      <Stack data-slot="message-bubble" className={withoutBubblePadding(args.bubbleClassName)} style={bubbleStyle}>
        {whisperBand(headerBand, args.artView)}
        <Stack gap="row" className="px-block py-row">
          {args.header}
          {args.content}
          {args.footer}
        </Stack>
      </Stack>
    );
  }
  if (args.weldedAvatar === null) {
    const art = args.decoration?.art;
    return (
      <Stack gap="row" data-slot="message-bubble" className={cn(args.bubbleClassName, art !== undefined && "relative")} style={bubbleStyle}>
        {art === undefined ? null : echoArtTile(art, args.artView)}
        {args.header}
        {args.content}
        {args.footer}
      </Stack>
    );
  }
  return (
    <Row align="start" data-slot="message-bubble" className={withoutBubblePadding(args.bubbleClassName)} style={bubbleStyle}>
      {args.mirrored ? null : args.weldedAvatar}
      <Stack gap="row" className="min-w-0 flex-1 px-block py-row">
        {args.header}
        {args.content}
        {args.footer}
      </Stack>
      {args.mirrored ? args.weldedAvatar : null}
    </Row>
  );
}
