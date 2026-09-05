// The Refinery rail section — FULL as of R3 (the founding DECLARED-PLANNED member graduates; the
// `{planned}` marker and this build are the same edit, which is the G1 self-cleaning guarantee working
// as designed). LIST = the sessions list (flat, delta 3 arm A) with its `selection` seam — declaring
// the pair opts the section INTO the mobile one-shell rule (delta 1 arm A: the list is the phone's
// screen when nothing is open). CONTEXT = the cross-run ledger, `defineContextTabs<RefineryContextState>`
// over Runs · Setup · Versions (delta 2 arm A) — the anti-echo law holds: no tab
// restates CONTENT's payload; every row carries its action.

import { FlaskConical } from "@orb/ui/icons";
import type { ReactElement } from "react";
import type { ContextTabDef, RefineryContextState } from "#lib";
import { defineContextTabs } from "#lib";
import type { SectionDefinition } from "#state";
import { refinerySectionSelection, useSelectedRefinerySessionId } from "#state";
import { RefineryListAnchor } from "../anchors/refinery-list-anchor.tsx";
import { RunsTabBody, SetupTabBody, VersionsTabBody } from "../components/refinery-context-tabs.tsx";
import { useRefineryCensus, useRefinerySession, useRefinerySessions } from "../hooks/use-refinery-sessions.ts";
import { RefineryContentSurface } from "../surfaces/refinery-content-surface.tsx";
import { RefineryListHeader, RefineryListSurface } from "../surfaces/refinery-list-surface.tsx";

/** The Runs · Setup · Versions tab DEFS (delta 2 arm A) — the array lives with
 *  the section (a component module exports only components); the BODIES are the components. */
const refineryContextTabs: readonly ContextTabDef<RefineryContextState>[] = [
  {
    id: "runs",
    label: "Runs",
    defaultTab: () => true,
    body: (state): ReactElement => <RunsTabBody state={state} />,
  },
  {
    id: "setup",
    label: "Setup",
    body: (state): ReactElement => <SetupTabBody state={state} />,
  },
  {
    id: "versions",
    label: "Versions",
    body: (state): ReactElement => <VersionsTabBody state={state} />,
  },
];

/** The section's context-state projection hook — a module-level named `use*` fn (the mint's contract):
 *  null until a session is open AND its row landed (the tabs need `characterId` for the Versions walk). */
function useRefineryContextState(): RefineryContextState | null {
  const sessionId = useSelectedRefinerySessionId();
  const session = useRefinerySession(sessionId);
  return sessionId === null || session.data === undefined ? null : { sessionId, characterId: session.data.characterId };
}

/** The section's NAME — the rail entry AND (with the census beside it, #1676) the phone topbar's screen
 *  title. Deliberately NOT the LIST band's title: that band names what the pane holds ("Sessions"), which is
 *  a different statement from what this SCREEN is called. */
const REFINERY_SECTION_LABEL = "Refinery";

/** The open session's title for the mobile topbar (null heals to the section label — never a blank bar).
 *  Falls back to the CHARACTER NAME, not "Untitled session" (side-eye 2026-08-09 P2): `session.name` is
 *  null on every session today, so the placeholder was the ONLY thing the bar ever showed — while CONTENT's
 *  header read the character. The name rides the list summary server-side (the P1-4 fix), so this is the
 *  exact fact the list row shows, read from the same already-fetched `listSessions` cache (no new query,
 *  no suspense — the list surface owns the fetch).
 *
 *  WITH NO SESSION OPEN IT NAMES THE SECTION *AND ITS SIZE* (#1676, the #1670 class). On a phone the LIST pane
 *  IS the screen and the ONE-NAME rule (shell.css) sheds the LIST band's title — and the census travels INSIDE
 *  that title (`components/list-pane-header.tsx`), so how many sessions you have was printed nowhere at all.
 *  The count goes back with the noun that survives, off the same one `useRefineryCensus` the band reads. */
function useRefinerySelectionTitle(): string | null {
  const sessionId = useSelectedRefinerySessionId();
  const sessions = useRefinerySessions();
  // Unconditional, above the early return: this is a hook, and the shell calls THIS hook unconditionally for
  // exactly the same reason (`section-registry.ts`, `NO_SELECTION_TITLE`). Same cached `listSessions` read.
  const census = useRefineryCensus();
  if (sessionId !== null) {
    const row = sessions.data?.find((s) => s.id === sessionId);
    return row === undefined ? null : (row.name ?? row.characterName);
  }
  // A ZERO CENSUS IS SUPPRESSED, in the band's own spelling (`ListPaneHeader`: "a zero census is noise, not
  // information") — with no sessions the bar says `Refinery` and the landing teaches. `undefined` is the
  // unread roster, likewise not a size claim.
  if (census === undefined || census === 0) {
    return null;
  }
  // The SECTION's name, not the band's: this row replaces the shell's section-label fallback, and the band
  // one panel over is naming the pane's CONTENTS ("Sessions") rather than the screen.
  return `${REFINERY_SECTION_LABEL} · ${String(census)}`;
}

export const refinerySection: SectionDefinition = {
  id: "refinery",
  rail: { label: REFINERY_SECTION_LABEL, icon: FlaskConical, group: "authoring", mobile: "sheet" },
  // D62's content-first hub: both side panels default collapsed; the persisted override wins thereafter.
  panelDefaults: { list: "collapsed", context: "collapsed" },
  placeholder: {
    title: "Refinery",
    description: "Score → rewrite → analyze a character card without drifting from your original.",
  },
  list: (): ReactElement => (
    <RefineryListAnchor>
      <RefineryListSurface />
    </RefineryListAnchor>
  ),
  listHeader: (): ReactElement => <RefineryListHeader />,
  selection: refinerySectionSelection,
  useSelectionTitle: useRefinerySelectionTitle,
  content: (): ReactElement => <RefineryContentSurface />,
  context: defineContextTabs<RefineryContextState>({
    useContextState: useRefineryContextState,
    tabs: refineryContextTabs,
    empty: {
      title: "Refinery",
      description: "Open a session to see its run ledger, setup and the card's versions here.",
    },
  }),
};
