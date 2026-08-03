// SectionContent — the CONTENT-region multiplexer: renders every kept section's content simultaneously
// and marks inactive ones `<Activity mode="hidden">`, so switching the rail back is instant with scroll/
// form state intact instead of unmounting the heavy pane (chat thread, editors). LIST/CONTEXT stay
// swap-per-section since they're lightweight and their selection already survives via the stores.
//
// Only a recency window of sections (KEEP_MOUNTED_LIMIT) stays mounted — bounding retained DOM/subscriptions.
// Focus restore on reveal is a WCAG obligation (a hidden Activity subtree can't hold focus); it runs in
// useLayoutEffect because Activity unmounts effects synchronously with the hide, before a passive effect fires.

import type { ReactElement, ReactNode, RefObject } from "react";
// biome's resolver can't see Activity as a named export through react's namespace merge; this file carries a scoped noUnresolvedImports override — tsc remains the real gate.
import { Activity, useLayoutEffect, useRef, useState } from "react";
import type { SectionId } from "#state";
import { RegionAnchor } from "../anchors/region-anchor.tsx";

/** How many recently-active sections stay mounted-but-hidden at once (the active one + N-1 prior). */
const KEEP_MOUNTED_LIMIT = 3;

export interface SectionContentProps {
  readonly activeSection: SectionId;
  /** Only wired sections are eligible to stay mounted; the unwired fallback is not kept here. */
  readonly contentBySection: Partial<Record<SectionId, ReactNode>>;
  /** The active-section fallback, rendered only when the active section has no wired body — never kept mounted. */
  readonly fallback: ReactNode;
  /** The content pane's stable focus anchor — focus lands here on reveal. */
  readonly focusAnchorRef: RefObject<HTMLElement | null>;
}

/** Move `active` to the front of the recency window, dropping anything past the limit. */
function pushRecent(window: readonly SectionId[], active: SectionId): SectionId[] {
  return [active, ...window.filter((id) => id !== active)].slice(0, KEEP_MOUNTED_LIMIT);
}

export function SectionContent({ activeSection, contentBySection, fallback, focusAnchorRef }: SectionContentProps): ReactElement {
  const activeBody = contentBySection[activeSection];
  // Advanced via React's "adjust state during render" pattern, not a mid-render ref mutation (which react-hooks/refs bans as a concurrent-safety hazard).
  const hasActiveBody = activeBody !== undefined;
  const [kept, setKept] = useState<readonly SectionId[]>([]);
  const [windowedFor, setWindowedFor] = useState<SectionId | null>(null);
  if (hasActiveBody && activeSection !== windowedFor) {
    setWindowedFor(activeSection);
    setKept((recencyWindow) => pushRecent(recencyWindow, activeSection));
  }

  const prevActiveRef = useRef<SectionId>(activeSection);
  useLayoutEffect(() => {
    if (prevActiveRef.current !== activeSection) {
      prevActiveRef.current = activeSection;
      focusAnchorRef.current?.focus();
    }
  }, [activeSection, focusAnchorRef]);

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
