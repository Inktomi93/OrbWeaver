import type { ReactElement } from "react";
import { Dialog, DialogPopup } from "#primitives/dialog";
import type { MediaSource, MessageMediaProps } from "../message-media/index.ts";
import { MessageMedia } from "../message-media/index.ts";

export interface LightboxProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly src: MediaSource;
  readonly media: "image" | "video";
  readonly alt: string;
  /** Intrinsic size, forwarded verbatim to `MessageMedia` (#654) — DERIVED from its prop rather than
   *  re-spelled, so the two can never drift. A caller that has dims for the inline image has them for the
   *  zoom too: without this the zoomed copy pops in from 0×0 inside a modal, which is where a reflow is
   *  most visible. Optional, because a source with genuinely unknown dimensions still has to render. */
  readonly dims?: MessageMediaProps["dims"];
  /** Whether an external source may load in the zoom view (mirrors MessageMedia's gate). */
  readonly allowExternal?: boolean;
}

/**
 * `<Lightbox>` — a zoom viewer hand-built over `@orb/ui/dialog` + `MessageMedia` (D54 — no lib). The
 * Dialog supplies the focus trap, Esc, and `bg-backdrop` backdrop; the media renders THROUGH
 * `MessageMedia` so its gates compose (an external image opened in the lightbox is still gated —
 * `allowExternal` flows through). Images/video only.
 *
 * Spec: ui-package-design §6.1 — the sealed viewer over Dialog + MessageMedia.
 */
export function Lightbox({ open, onOpenChange, src, media, alt, dims, allowExternal }: LightboxProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-cq-lg bg-transparent p-block shadow-none">
        <MessageMedia src={src} media={media} alt={alt} {...(dims === undefined ? {} : { dims })} {...(allowExternal === undefined ? {} : { allowExternal })} />
      </DialogPopup>
    </Dialog>
  );
}
