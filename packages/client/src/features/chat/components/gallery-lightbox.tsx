// The shared image lightbox: one image, named by its place and date or by its speaker. The gallery passes a
// `removal` and gets a Remove behind a confirm; the transcript's avatar viewer passes none and gets only Close.
// It opens on Close, so a stray Enter never starts a removal. The confirm is the retry surface for its own
// verb, and the lightbox closes only once the removal has succeeded (`onRemove` resolves).

import { blobUrl } from "@orb/contracts/assets";
import { Button } from "@orb/ui/button";
import { CrossfadeImage } from "@orb/ui/crossfade-image";
// @orb-waive dialog-via-composite(Dialog): the gallery lightbox owns its root and its destructive confirm; ends if a gallery-dialog composite owns that species.
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Icon, Trash2 } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
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

// The image's own width over height, read once it has loaded; the frame is square until then.
function useImageAspect(hash: string | null): number {
  const [loaded, setLoaded] = useState<{ readonly hash: string; readonly aspect: number } | null>(null);
  useEffect(() => {
    if (hash === null) {
      return;
    }
    const probe = new Image();
    probe.onload = (): void => {
      if (probe.naturalWidth > 0 && probe.naturalHeight > 0) {
        setLoaded({ hash, aspect: probe.naturalWidth / probe.naturalHeight });
      }
    };
    probe.src = blobUrl(hash);
    return (): void => {
      probe.onload = null;
    };
  }, [hash]);
  return loaded !== null && loaded.hash === hash ? loaded.aspect : 1;
}

export function GalleryLightbox({ image, removal, onClose, finalFocus, onSettled }: GalleryLightboxProps): ReactElement {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const aspect = useImageAspect(image === null ? null : image.hash);
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
      <DialogPopup size="lg" initialFocus={closeRef} finalFocus={finalFocus}>
        {image === null ? null : (
          <Stack gap="block" className="min-h-0">
            <DialogTitle>{image.name}</DialogTitle>
            {/* The frame follows the image's own aspect: as wide as the dialog, as tall as the viewport leaves it. */}
            <Stack align="center" justify="center" className="relative min-h-0 flex-1">
              <CrossfadeImage src={blobUrl(image.hash)} alt={image.name} aspectRatio={aspect} fit="contain" className="max-h-full" />
            </Stack>
            <Row justify={removal === undefined ? "end" : "between"} align="center" gap="row" className="shrink-0">
              {removal === undefined ? null : (
                <Button intent="destructive" onClick={(): void => setConfirmOpen(true)}>
                  <Icon icon={Trash2} size="sm" />
                  Remove from gallery
                </Button>
              )}
              <DialogClose
                render={
                  <Button intent="ghost" ref={closeRef}>
                    Close
                  </Button>
                }
              />
            </Row>

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
