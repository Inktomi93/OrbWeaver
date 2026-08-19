// The shell's NOTICE BAND — the ruled escape from toast-over-content occlusion (#193).
//
// It is one empty div, and that is the whole idea: a row of `.shell-main`'s flex column, between the
// topbar and `<main>`, that the app's toast stack is portalled into (`AppToaster`). Because the stack
// then lives in NORMAL FLOW, raising a notice REFLOWS the content column instead of painting over it —
// occlusion is impossible by construction rather than by inset arithmetic, which is what the retired
// residual in `@orb/ui`'s `toast/variants.ts` proved could not be made to work on a phone (topbar,
// transcript, composer, tab bar, and no toast-height gap that is none of them).
//
// It renders NOTHING of its own — no heading, no landmark, no border. The toast Viewport it hosts is
// already a named `role="region"` live region ("Alerts"), and wrapping that in a second labelled box
// would put two landmarks around one stack. `shell.css` collapses the band entirely while it holds no
// toast (`:not(:has(…))`), so an empty band costs zero pixels and zero layout.
//
// The node is published in an EFFECT, so the very first commit has no band and any toast raised in that
// window takes the overlay fallback. That is correct rather than tolerated: before the shell has mounted
// there is genuinely nothing to reflow.

import type { ReactElement } from "react";
import { useEffect, useRef } from "react";
import { publishNoticeBand } from "#state";

export function NoticeBand(): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    publishNoticeBand(ref.current);
    return (): void => {
      publishNoticeBand(null);
    };
  }, []);
  return <div className="shell-notice-band" data-slot="notice-band" ref={ref} />;
}
