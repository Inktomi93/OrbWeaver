// The shared image lightbox: one image, named by its place and date or by its speaker. The gallery passes a
// `removal` and gets a Remove behind a confirm; the transcript's avatar viewer passes none and gets only Close.
// It opens on Close, so a stray Enter never starts a removal. The confirm is the retry surface for its own
// verb, and the lightbox closes only once the removal has succeeded (`onRemove` resolves).

import { blobUrl } from "@orb/contracts/assets";
import { Button } from "@orb/ui/button";
import { CrossfadeImage } from "@orb/ui/crossfade-image";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Icon, Trash2 } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { ReactElement, RefObject } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ConfirmDialog } from "#components";

/** The one image the lightbox shows. `name` is the grid cell's own name, so both say the same thing. */
interface GalleryLightboxImage {
  readonly hash: string;
  readonly name: string;
}

interface GalleryLightboxProps {
  readonly image: GalleryLightboxImage | null;
  /** Present only where the viewer may remove the image from a gallery; absent shows Close alone. */
  readonly removal?: {
    readonly characterName: string;
    /** Removes the image; resolves once it is gone, and rejects to hold the confirm open with the reason. */
    readonly onRemove: () => Promise<void>;
  };
  readonly onClose: () => void;
  /** Where focus goes as the lightbox closes (Base UI's `finalFocus`). */
  readonly finalFocus: () => HTMLElement | true;
  /** Fires once the open or close motion has finished (Base UI's `onOpenChangeComplete`). */
  readonly onSettled: (open: boolean) => void;
}

// Until the dialog has been measured, assume this much height outside the frame (title, actions, padding, gutters).
const FALLBACK_CHROME_PX = 224;

// The image's own size, read once it has loaded; the frame is a square of unknown natural width until then.
function useImageSize(hash: string | null): { readonly aspect: number; readonly naturalWidth: number | null } {
  const [loaded, setLoaded] = useState<{ readonly hash: string; readonly width: number; readonly height: number } | null>(null);
  useEffect(() => {
    if (hash === null) {
      return;
    }
    const probe = new Image();
    probe.onload = (): void => {
      if (probe.naturalWidth > 0 && probe.naturalHeight > 0) {
        setLoaded({ hash, width: probe.naturalWidth, height: probe.naturalHeight });
      }
    };
    probe.src = blobUrl(hash);
    return (): void => {
      probe.onload = null;
    };
  }, [hash]);
  return loaded !== null && loaded.hash === hash ? { aspect: loaded.width / loaded.height, naturalWidth: loaded.width } : { aspect: 1, naturalWidth: null };
}

// The height the dialog spends outside the frame, measured: the popup's height minus the frame's, plus the
// viewport gutters above and below it. The frame takes whatever the viewport leaves after that.
function useChromeHeight(content: HTMLDivElement | null, frame: RefObject<HTMLDivElement | null>): number {
  const [chrome, setChrome] = useState(FALLBACK_CHROME_PX);
  useLayoutEffect(() => {
    const popup = content?.parentElement;
    if (popup === null || popup === undefined) {
      return;
    }
    const measure = (): void => {
      const frameHeight = frame.current?.getBoundingClientRect().height ?? 0;
      const viewport = getComputedStyle(popup.parentElement ?? popup);
      const gutters = Number.parseFloat(viewport.paddingTop) + Number.parseFloat(viewport.paddingBottom);
      const next = Math.round(popup.getBoundingClientRect().height - frameHeight + gutters);
      setChrome((previous) => (next > 0 && next !== previous ? next : previous));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(popup);
    return (): void => observer.disconnect();
  }, [content, frame]);
  return chrome;
}

export function GalleryLightbox({ image, removal, onClose, finalFocus, onSettled }: GalleryLightboxProps): ReactElement {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { aspect, naturalWidth } = useImageSize(image === null ? null : image.hash);
  // State, not a ref: the popup mounts after the lightbox opens, and the measure must run once it exists.
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const chrome = useChromeHeight(content, frameRef);
  // The largest box of the image's aspect that fits the height left after the chrome, and never past the image's own size.
  const frameWidth = `min(${naturalWidth === null ? "100vw" : `${String(naturalWidth)}px`}, calc((100dvh - ${String(chrome)}px) * ${String(aspect)}))`;
  return (
    <Dialog
      open={image !== null}
      onOpenChange={(next): void => {
        if (!next) {
          onClose();
        }
      }}
      onOpenChangeComplete={onSettled}
    >
      <DialogPopup size="xlFit" initialFocus={closeRef} finalFocus={finalFocus}>
        {image === null ? null : (
          <Stack gap="block" className="min-h-0" ref={setContent}>
            {/* Close rides the title row, so the dialog spends one row above the frame instead of two and a short
                phone viewport leaves the image more of its height. */}
            <Row align="center" gap="row" justify="between">
              <DialogTitle className="min-w-0">{image.name}</DialogTitle>
              <DialogClose
                render={
                  <Button className="shrink-0" intent="ghost" ref={closeRef} size="sm">
                    Close
                  </Button>
                }
              />
            </Row>
            {/* The dialog hugs the frame: sized by height when height limits it (no grey bars), by the dialog's own
                width otherwise, and never upscaled past the image. */}
            <Stack align="center" className="relative">
              <Stack ref={frameRef} style={{ aspectRatio: aspect, width: frameWidth, maxWidth: "100%" }}>
                <CrossfadeImage src={blobUrl(image.hash)} alt={image.name} aspectRatio={aspect} fit="contain" className="size-full" />
              </Stack>
            </Stack>
            {removal === undefined ? null : (
              <Row justify="start" align="center" className="shrink-0">
                <Button intent="destructive" onClick={(): void => setConfirmOpen(true)}>
                  <Icon icon={Trash2} size="sm" />
                  Remove from gallery
                </Button>
              </Row>
            )}

            {removal === undefined ? null : (
              <ConfirmDialog
                confirmLabel="Remove"
                description={`This removes the image from ${removal.characterName}'s gallery. The image itself stays in your uploads.`}
                forceRender={true}
                onConfirm={removal.onRemove}
                onOpenChange={setConfirmOpen}
                open={confirmOpen}
                title="Remove this image?"
              />
            )}
          </Stack>
        )}
      </DialogPopup>
    </Dialog>
  );
}
