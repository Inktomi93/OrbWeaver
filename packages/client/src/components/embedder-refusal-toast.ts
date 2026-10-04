// An embedder write waits on the server's check of the new embedder, which can take a while, and the control that made
// it says a refusal inline. If that control is gone by the time the refusal arrives (the editor closed, the pane left),
// nothing would say it, so a toast does.

import type { EmbedTargetRefusal } from "@orb/contracts/inference";
import { useEffect, useRef } from "react";
import { embedRefusalOf, notify } from "#lib";

/** Watch one write: if it fails with an embedder refusal after this surface unmounted, toast `text(refusal)`. */
export function useEmbedRefusalToastAfterUnmount(): (write: Promise<unknown>, text: (refusal: EmbedTargetRefusal) => string) => void {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return (): void => {
      mounted.current = false;
    };
  }, []);
  return (write, text) => {
    // @orb-waive caught-failure-ownership(write): the caller owns the write's failure through its own handlers and the
    // mutation's error toast; this only adds the toast no unmounted control can say. Ends if a caller stops handling it.
    void write.catch((error: unknown) => {
      const refusal = embedRefusalOf(error);
      if (refusal !== null && !mounted.current) {
        notify.error(text(refusal));
      }
    });
  };
}
