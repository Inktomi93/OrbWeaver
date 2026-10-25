// The single-bubble (non-Tide) render shapes, split out of message-row-parts.tsx to stay under the component-size cap.
// No state of its own — renderSingleBubble is a pure (args) => ReactElement the bubble slot calls with already-resolved
// data, on the skin's own box (`MessageBox`).

import { Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import type { BubbleDecoration } from "../lib/art-decorations.ts";
import type { ArtView } from "./art-slot.tsx";
import { EchoArtTile, WhisperBand } from "./art-slot.tsx";
import type { MessageBoxProps } from "./message-box.tsx";
import { MessageBox } from "./message-box.tsx";

/** The skin and row facts every message box of one row shares. */
export type MessageBoxFacts = Pick<MessageBoxProps, "box" | "role" | "phoneCap" | "lastRowFloor" | "editing" | "receded">;

export function renderSingleBubble(args: {
  /** #288 — the speaker/timestamp/actions header, when this skin renders it INSIDE its container. It
   *  leads the PADDED content in all three shapes below (plain box · whisper's below-the-band stack ·
   *  ripple's welded-portrait row), so it always sits on the container's own reading inset and shares the
   *  `gap="row"` that separates the body's blocks. Null when the skin's `headerPlacement` is `outside`. */
  readonly header: ReactNode;
  readonly content: ReactNode;
  /** The swipe foot, the container's last line when the skin seats it inside; null otherwise. */
  readonly footer: ReactNode;
  readonly facts: MessageBoxFacts;
  readonly decoration: BubbleDecoration | null;
  readonly weldedAvatar: ReactElement | null;
  /** The row sits mirrored, so the welded portrait sits on the trailing side. */
  readonly mirrored: boolean;
  /** Opens the decoration's art full size; null where the row has no art to open or no viewer to open it in. */
  readonly artView: ArtView | null;
  /** Reports whether the row's art failed to load, so the row can drop the chip that would repeat its fallback. */
  readonly onArtFailed?: (failed: boolean) => void;
}): ReactElement {
  const headerBand = args.decoration?.headerBand;
  const style = args.decoration?.style;
  if (headerBand !== undefined) {
    return (
      <MessageBox {...args.facts} shape="bare" positioned={false} style={style}>
        <WhisperBand band={headerBand} view={args.artView} onFailedChange={args.onArtFailed} />
        <Stack gap="row" className="px-block py-row">
          {args.header}
          {args.content}
          {args.footer}
        </Stack>
      </MessageBox>
    );
  }
  if (args.weldedAvatar === null) {
    const art = args.decoration?.art;
    return (
      <MessageBox {...args.facts} shape="stack" positioned={art !== undefined} style={style}>
        {art === undefined ? null : <EchoArtTile art={art} view={args.artView} onFailedChange={args.onArtFailed} />}
        {args.header}
        {args.content}
        {args.footer}
      </MessageBox>
    );
  }
  return (
    <MessageBox {...args.facts} shape="weld" positioned={false} style={style}>
      {args.mirrored ? null : args.weldedAvatar}
      {/* The column stretches the card's height and the foot takes its end, so the swipe group sits in the card's
          bottom corner beside a tall portrait instead of floating under a short reply. */}
      <Stack gap="row" className="flex-1 self-stretch px-block py-row min-inline-0">
        {args.header}
        {args.content}
        {args.footer === null ? null : <Stack className="mbs-auto">{args.footer}</Stack>}
      </Stack>
      {args.mirrored ? args.weldedAvatar : null}
    </MessageBox>
  );
}
