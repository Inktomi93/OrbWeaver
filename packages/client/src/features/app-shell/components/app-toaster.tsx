// The APP's toast outlet — `@orb/ui`'s `Toaster`, aimed at whichever surface currently exists (#193).
//
// TWO PLACEMENTS, ONE SURFACE. This is not a mobile mode beside a desktop mode: the app has exactly one
// notice stack, and where it lands follows APPLICABILITY — is there a shell band to reflow?
//   • a shell is mounted  ⇒ `band`: the stack portals into `NoticeBand` and pushes the content column
//     down, so it can never cover the h1, the transcript, or the composer at any width;
//   • no shell            ⇒ `overlay`: the login screen and the app-level crash fallback have no band,
//     and a notice there must still be able to speak, so it takes the fixed top-right float.
// The band node arrives from `#state`, which is why this component exists at all — the outlet is mounted
// at the composition root, outside the error boundary and above the router, so it cannot see the shell
// by nesting (see `state/notice-band-store.ts`).

import { Toaster } from "@orb/ui/toast";
import type { ReactElement } from "react";
import { useNoticeBand } from "#state";

export function AppToaster(): ReactElement {
  const band = useNoticeBand();
  if (band === null) {
    return <Toaster placement="overlay" />;
  }
  return <Toaster container={band} placement="band" />;
}
