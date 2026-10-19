// An embedder write waits on the server's check of the new embedder, which can take a while, and the control that made
// it says a refusal inline. If that control is gone by the time the refusal arrives (the editor closed, the pane left),
// nothing would say it, so a toast does.

import type { EmbedTargetRefusal } from "@orb/contracts/inference";
import { useEffect, useRef } from "react";
import { EMBED_REFUSAL_TOAST_TITLE, embedRefusalOf, notify } from "#lib";

/** Watch one write: if it fails with an embedder refusal after this surface unmounted, toast `text(refusal)`. The
 *  reason rides as the description, so the toast stays long enough to read: the user has already moved on. */
export function useEmbedRefusalToastAfterUnmount(): (write: Promise<unknown>, text: (refusal: EmbedTargetRefusal) => string) => void {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return (): void => {
      mounted.current = false;
    };
  }, []);
  return (write, text) => {
    // @orb-waive caught-failure-ownership(write): this adds only the unmounted-refusal toast. Both callers (connection-role-slot.tsx, connection-editor.tsx) pass a
    // `mutateAsync` promise whose failure is shown by its inline refusal state or the mutation's errorToast. Ends if a caller passes a write with neither.
    void write.catch((error: unknown) => {
      const refusal = embedRefusalOf(error);
      if (refusal !== null && !mounted.current) {
        notify.error({ title: EMBED_REFUSAL_TOAST_TITLE, description: text(refusal) });
      }
    });
  };
}
