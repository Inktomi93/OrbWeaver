import { DIALOG_SCROLL_CLASS, Dialog, DialogFooter, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import type { ReactElement } from "react";

const STRIPES = "repeating-linear-gradient(#000 0 1px, #fff 1px 2px)";

/** An open dialog shaped like production: a DIALOG_SCROLL_CLASS region ending in the sticky footer, with 1px black/white stripes as the body. */
export function StripedGlassDialogStory(): ReactElement {
  return (
    <Dialog defaultOpen={true}>
      <DialogPopup>
        <DialogTitle>Glass footer</DialogTitle>
        <div className={DIALOG_SCROLL_CLASS}>
          <div style={{ height: 2000, backgroundImage: STRIPES }} />
          <DialogFooter>
            <button type="button">Cancel</button>
          </DialogFooter>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
