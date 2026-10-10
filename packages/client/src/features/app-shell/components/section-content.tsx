// CONTENT retains a bounded window of keyed Activities, preserving warm scroll and form state.
// Cold list-primary bodies remain unmounted; reveal rescues lost focus without stealing surviving controls.

import type { ReactElement, ReactNode, RefObject } from "react";
// biome's resolver can't see Activity as a named export through react's namespace merge; this file carries a scoped noUnresolvedImports override — tsc remains the real gate.
import { Activity, useLayoutEffect, useRef, useState } from "react";
import type { SectionId } from "#state";
import { useSectionRegistry } from "#state";
import { RegionAnchor } from "../anchors/region-anchor.tsx";

/** How many recently-active sections stay mounted-but-hidden at once (the active one + N-1 prior). */
const KEEP_MOUNTED_LIMIT = 3;

export interface SectionContentProps {
  readonly activeSection: SectionId;
  readonly visible: boolean;
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

export function SectionContent({ activeSection, visible, contentBySection, fallback, focusAnchorRef }: SectionContentProps): ReactElement {
  const registry = useSectionRegistry();
  const activeBody = contentBySection[activeSection];
  // Advanced via React's "adjust state during render" pattern, not a mid-render ref mutation (which react-hooks/refs bans as a concurrent-safety hazard).
  const hasActiveBody = activeBody !== undefined;
  const [kept, setKept] = useState<readonly SectionId[]>([]);
  const [windowedFor, setWindowedFor] = useState<SectionId | null>(null);
  if (visible && hasActiveBody && activeSection !== windowedFor) {
    setWindowedFor(activeSection);
    setKept((recencyWindow) => pushRecent(recencyWindow, activeSection));
  }

  const prevActiveRef = useRef({ section: activeSection, visible, body: activeBody });
  const revealPending = useRef(false);
  useLayoutEffect(() => {
    const previous = prevActiveRef.current;
    prevActiveRef.current = { section: activeSection, visible, body: activeBody };
    if (!visible) {
      revealPending.current = false;
      return;
    }
    if (previous.section === activeSection && previous.visible && !revealPending.current) {
      return;
    }
    // A replacing body cancels the old callback, not the still-unsettled reveal intent.
    revealPending.current = true;
    const origin = document.activeElement;
    // Browser focus loss can follow React's layout effects; rescue only the hidden origin, never surviving rail/portal focus.
    const timer = setTimeout(() => {
      revealPending.current = false;
      if (prevActiveRef.current.body !== activeBody) {
        return;
      }
      const active = document.activeElement;
      const lostOrigin = active !== null && active === origin && (active.closest("[inert]") !== null || active.getClientRects().length === 0);
      const anchor = focusAnchorRef.current;
      if (
        (active === null || active === document.body || lostOrigin) &&
        anchor !== null &&
        anchor.closest("[inert]") === null &&
        anchor.getClientRects().length > 0
      ) {
        anchor.focus({ preventScroll: true });
      }
    });
    return (): void => clearTimeout(timer);
  }, [activeSection, activeBody, focusAnchorRef, visible]);

  return (
    <>
      {!hasActiveBody && visible ? (
        <RegionAnchor region="content" inset={registry.get(activeSection).contentInset === "section"}>
          {fallback}
        </RegionAnchor>
      ) : null}
      {kept.map((id) => (
        <Activity key={id} mode={id === activeSection && visible ? "visible" : "hidden"} name={`section:${id}`}>
          <RegionAnchor region="content" inset={registry.get(id).contentInset === "section"}>
            {contentBySection[id]}
          </RegionAnchor>
        </Activity>
      ))}
    </>
  );
}
