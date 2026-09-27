// The gallery's lightbox: one image, named by its place and date, with a Remove behind a confirm. It opens on
// Close, so a stray Enter never starts a removal. The confirm is the retry surface for its own verb, and the
// lightbox closes only once the removal has succeeded (`onRemove` resolves).

import { blobUrl } from "@orb/contracts/assets";
import { Button } from "@orb/ui/button";
import { CrossfadeImage } from "@orb/ui/crossfade-image";
// @orb-waive dialog-via-composite(Dialog): the gallery lightbox owns its root and its destructive confirm; ends if a gallery-dialog composite owns that species.
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Icon, Trash2 } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { ConfirmDialog } from "#components";

/** The one image the lightbox shows. `name` is the grid cell's own name, so both say the same thing. */
interface GalleryLightboxImage {
  readonly hash: string;
  readonly name: string;
}

interface GalleryLightboxProps {
  readonly image: GalleryLightboxImage | null;
  readonly characterName: string;
  readonly onClose: () => void;
  /** Removes the image; resolves once it is gone, and rejects to hold the confirm open with the reason. */
  readonly onRemove: () => Promise<void>;
  /** Where focus goes as the lightbox closes (Base UI's `finalFocus`). */
  readonly finalFocus: () => HTMLElement | true;
  /** Fires once the open or close motion has finished (Base UI's `onOpenChangeComplete`). */
  readonly onSettled: (open: boolean) => void;
}

export function GalleryLightbox({ image, characterName, onClose, onRemove, finalFocus, onSettled }: GalleryLightboxProps): ReactElement {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
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
            <Stack className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <CrossfadeImage src={blobUrl(image.hash)} alt={image.name} aspectRatio={1} fit="contain" className="max-h-96" />
            </Stack>
            <Row justify="between" align="center" gap="row" className="shrink-0">
              <Button intent="destructive" onClick={(): void => setConfirmOpen(true)}>
                <Icon icon={Trash2} size="sm" />
                Remove from gallery
              </Button>
              <DialogClose
                render={
                  <Button intent="ghost" ref={closeRef}>
                    Close
                  </Button>
                }
              />
            </Row>

            <ConfirmDialog
              confirmLabel="Remove"
              description={`This removes the image from ${characterName}'s gallery. The image itself stays in your uploads.`}
              forceRender={true}
              onConfirm={onRemove}
              onOpenChange={setConfirmOpen}
              open={confirmOpen}
              title="Remove this image?"
            />
          </Stack>
        )}
      </DialogPopup>
    </Dialog>
  );
}
