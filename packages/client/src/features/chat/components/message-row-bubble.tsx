// The single-bubble (non-Tide) render shapes, split out of message-row-parts.tsx to stay under the
// component-size cap. No state of its own — renderSingleBubble is a pure (args) => ReactElement the
// bubble slot calls with already-resolved data.

import type { MessageRole } from "@orb/kit/message-role";
import { Row, Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
import type { BubbleDecoration } from "../lib/art-decorations.ts";
import type { ArtView } from "./art-slot.tsx";
import { EchoArtTile, WhisperBand } from "./art-slot.tsx";

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
        <WhisperBand band={headerBand} view={args.artView} />
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
        {art === undefined ? null : <EchoArtTile art={art} view={args.artView} />}
        {args.header}
        {args.content}
        {args.footer}
      </Stack>
    );
  }
  return (
    <Row align="start" data-slot="message-bubble" className={withoutBubblePadding(args.bubbleClassName)} style={bubbleStyle}>
      {args.mirrored ? null : args.weldedAvatar}
      {/* The column stretches the card's height and the foot takes its end, so the swipe group sits in the card's
          bottom corner beside a tall portrait instead of floating under a short reply. */}
      <Stack gap="row" className="min-w-0 flex-1 self-stretch px-block py-row">
        {args.header}
        {args.content}
        {args.footer === null ? null : <Stack className="mt-auto">{args.footer}</Stack>}
      </Stack>
      {args.mirrored ? args.weldedAvatar : null}
    </Row>
  );
}
