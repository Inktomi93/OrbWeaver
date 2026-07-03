import type { ReactElement } from "react";
import { Dialog, DialogPopup } from "#primitives/dialog";
import { MessageMedia } from "../message-media";

type LightboxSource =
  | { readonly kind: "asset"; readonly url: string }
  | { readonly kind: "external"; readonly url: string };

export interface LightboxProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly src: LightboxSource;
  readonly media: "image" | "video";
  readonly alt: string;
  /** Whether an external source may load in the zoom view (mirrors MessageMedia's gate). */
  readonly allowExternal?: boolean;
}

/**
 * `<Lightbox>` — a zoom viewer hand-built over `@orb/ui/dialog` + `MessageMedia` (D54 — no lib). The
 * Dialog supplies the focus trap, Esc, and `bg-scrim` backdrop; the media renders THROUGH
 * `MessageMedia` so its gates compose (an external image opened in the lightbox is still gated —
 * `allowExternal` flows through). Images/video only.
 *
 * Spec: ui-package-design §6.1 — the sealed viewer over Dialog + MessageMedia.
 */
export function Lightbox({
  open,
  onOpenChange,
  src,
  media,
  alt,
  allowExternal,
}: LightboxProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-cq-lg bg-transparent p-block shadow-none">
        <MessageMedia
          src={src}
          media={media}
          alt={alt}
          {...(allowExternal === undefined ? {} : { allowExternal })}
        />
      </DialogPopup>
    </Dialog>
  );
}
