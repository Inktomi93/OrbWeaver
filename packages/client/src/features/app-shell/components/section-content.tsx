// SectionContent — the CONTENT-region multiplexer that realizes <Activity> pane-keeping (UI-Arch §4a /
// D62 §4.2 rule 2 "rail-switching away and back restores the section exactly"). Today a rail switch
// swaps `sections[activeSection]` wholesale, so the prior section's CONTENT unmounts — its scroll
// position, virtualized-list window, and in-progress form state all die. This component instead renders
// every KEPT section's content simultaneously and marks the inactive ones `<Activity mode="hidden">`:
// React keeps the subtree mounted-but-inert (effects paused, no paint), so switching back is instant
// with state intact. It swaps unmount/remount for hide/show for the CONTENT pane specifically — the
// heavy pane (the chat thread, the character/preset editors). LIST/CONTEXT stay swap-per-section (they
// are lightweight finders/detail, and their per-section selection already survives via the stores).
//
// THE MEMORY CEILING (don't keep every visited section alive forever): only sections in a recency
// window stay mounted (`KEEP_MOUNTED_LIMIT` most-recently-active). A section that falls out of the
// window unmounts fully and re-mounts fresh on next visit — bounding the retained DOM/subscriptions.
// The active section is always in the window; the placeholder (unwired) fallback is NOT kept mounted
// (there is no state to preserve in a static teaching surface).
//
// §4a COMPANION RULE 1 — focus restore (a WCAG keyboard obligation, not polish): a hidden Activity
// subtree cannot hold focus, so keyboard focus dies silently on hide. On hidden→visible we restore
// focus to the CONTENT pane's stable anchor (the `<main>` landmark passed as `focusAnchorRef`) so a
// keyboard user is not stranded. Handled here — the reveal edge is detected against the prior active id.
//
// §4a COMPANION RULE 2 — hide-coupled work runs in `useLayoutEffect`: Activity unmounts effects
// synchronously with the visual hide, so a passive `useEffect` cleanup runs too late to capture pre-hide
// DOM state. The reveal/focus work therefore lives in `useLayoutEffect`.

import type { ReactElement, ReactNode, RefObject } from "react";
// `Activity` is React 19.2's stable pane-keeping export (@types/react index.d.ts:2006, present at
// runtime + tsc-resolved). biome 2.5.1's resolver can't see it as a named import through react's
// `export = React` namespace merge and `noUnresolvedImports` is NOT line-suppressible, so this one file
// carries a scoped `noUnresolvedImports: off` override in biome.json — tsc remains the real gate here.
import { Activity, useLayoutEffect, useRef, useState } from "react";
import type { SectionId } from "#state";
import { RegionAnchor } from "../anchors/region-anchor";

/** How many recently-active sections stay mounted-but-hidden at once (the active one + N-1 prior). Small
 *  on purpose: the heavy panes are the chat thread + editors, and only a handful of sections carry real
 *  CONTENT — keeping the last few covers the common "flip away and back" without unbounded retention. */
const KEEP_MOUNTED_LIMIT = 3;

export interface SectionContentProps {
  /** The section currently owning the CONTENT region (its subtree renders visible; the rest hidden). */
  readonly activeSection: SectionId;
  /** Per-section CONTENT bodies — only WIRED sections (a real ReactNode) are eligible to stay mounted;
   *  the unwired fallback is rendered by the shell placeholder path, not kept here. */
  readonly contentBySection: Partial<Record<SectionId, ReactNode>>;
  /** The active-section fallback (the section-name teaching placeholder) — rendered ONLY when the active
   *  section has no wired body, and never kept mounted (a static surface has no state to preserve). */
  readonly fallback: ReactNode;
  /** The CONTENT pane's stable focus anchor (the `<main>` landmark) — focus lands here on reveal so a
   *  keyboard user is never stranded on a subtree that just went inert (§4a companion rule 1). */
  readonly focusAnchorRef: RefObject<HTMLElement | null>;
}

/** Update the recency window: move `active` to the front, drop anything past the limit. Pure — the caller
 *  advances the window via an in-render state adjustment (not a ref mutation); it only gates which
 *  subtrees stay mounted. */
function pushRecent(window: readonly SectionId[], active: SectionId): SectionId[] {
  return [active, ...window.filter((id) => id !== active)].slice(0, KEEP_MOUNTED_LIMIT);
}

export function SectionContent({
  activeSection,
  contentBySection,
  fallback,
  focusAnchorRef,
}: SectionContentProps): ReactElement {
  const activeBody = contentBySection[activeSection];
  // The recency window of WIRED sections kept mounted-but-hidden. Advanced via React's sanctioned "adjust
  // state during render" pattern (react.dev/reference/react/useState — storing info from previous renders),
  // NOT a mid-render ref mutation: react-hooks/refs rightly bans that as a concurrent-safety hazard (a
  // double-invoked render would double-push). Guarded on a change in the active section, so it settles in
  // one extra render pass BEFORE paint — preserving the strict same-render eviction the memory ceiling
  // (KEEP_MOUNTED_LIMIT) depends on, with no over-mounted frame.
  const hasActiveBody = activeBody !== undefined;
  const [kept, setKept] = useState<readonly SectionId[]>([]);
  const [windowedFor, setWindowedFor] = useState<SectionId | null>(null);
  if (hasActiveBody && activeSection !== windowedFor) {
    setWindowedFor(activeSection);
    setKept((recencyWindow) => pushRecent(recencyWindow, activeSection));
  }

  // §4a companion rules: on a reveal (active section changed to a kept, mounted pane) restore focus to the
  // CONTENT landmark. In `useLayoutEffect` so it runs synchronously with Activity's hide/show, before the
  // browser paints — a passive effect would fire after the inert subtree already dropped its focus.
  const prevActiveRef = useRef<SectionId>(activeSection);
  useLayoutEffect(() => {
    if (prevActiveRef.current !== activeSection) {
      prevActiveRef.current = activeSection;
      focusAnchorRef.current?.focus();
    }
  }, [activeSection, focusAnchorRef]);

  // Render the active pane (wired → its body, else the fallback) PLUS every other kept section hidden.
  // Each kept body wraps in its own <Activity>; the active one is visible, the rest inert.
  return (
    <>
      <Activity mode="visible" name={`section:${activeSection}`}>
        <RegionAnchor region="content">{activeBody ?? fallback}</RegionAnchor>
      </Activity>
      {kept
        .filter((id) => id !== activeSection)
        .map((id) => (
          <Activity key={id} mode="hidden" name={`section:${id}`}>
            <RegionAnchor region="content">{contentBySection[id]}</RegionAnchor>
          </Activity>
        ))}
    </>
  );
}
