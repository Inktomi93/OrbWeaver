// The Presets CONTENT teaching state (UI-Arch §4.2 Presets row "CONTENT — none selected: teaching state";
// §4.3 rule 1 no-dead-ends — the empty state teaches + offers the next step). Rendered when no preset is
// open. A containment CONSUMER (§2.1) — no outer container of its own.

import { EmptyState } from "@orb/ui/empty-state";
import { Icon, SlidersHorizontal } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { LIST_OFF_SCREEN_HINT, usePresetSearchQuery, useSectionListMode } from "#state";
import { filterPresetsByName, presetSearchNeedle } from "../lib/preset-search.ts";

/** What this pane teaches whatever the panes are doing — the instruction, and the boundary with Connections
 *  a preset is most often confused across. The footnote appended beside it while the list is off screen is
 *  `LIST_OFF_SCREEN_HINT` — ONE spelling for all four section welcomes, homed beside the signal (#446). */
const TEACHING =
  "Pick a preset to edit its sampling, reasoning, output and prompt structure, or create a new one. A preset shapes generation; it doesn't pick the model (that's Connections).";

/** …and what it says when the LIST has been filtered to nothing (side-eye 2026-08-22 P3-2). "Pick a preset"
 *  is an act the reader cannot perform over an empty filtered list — the same class of dishonesty #434 fixed
 *  for the off-screen list, one state over. The list pane's own no-match state is excellent and owns the way
 *  OUT ("Clear search" · "New preset"), so this pane states the fact and names that affordance verbatim
 *  (WCAG 2.5.3 — the reader says what is written); it mints no second door. The boundary sentence survives
 *  in both arms: it is what the pane teaches, and a filter does not make it less true. */
const NO_MATCHES =
  "No preset matches your search, so there is nothing to pick right now — Clear search brings your presets back. A preset shapes generation; it doesn't pick the model (that's Connections).";

/** The teaching welcome shown in Presets CONTENT when nothing is selected.
 *
 *  NO GEOGRAPHY IN THE COPY (side-eye F-12, 2026-08-02): "on the left" is false at every narrow width —
 *  the Presets list is a SHEET on mobile (`presetsSection.rail.mobile`), so at 430px the instruction
 *  pointed at a pane that is not on screen.
 *
 *  AND NOT "FROM THE LIST" EITHER (side-eye F-28, 2026-08-03): naming the list still presupposes there IS
 *  one on screen, and below the 64rem band both panes auto-collapse — so the 960px and 418px reads
 *  instructed the user to pick from something they could not see, with no hint that it is one toggle away.
 *  The copy now names the AFFORDANCE that produces the list ("Show list panel" — the shell topbar's own
 *  string, verbatim, so a WCAG 2.5.3 voice-control user says exactly what is written), which is true in
 *  BOTH regimes: the list is either already open or one named control away.
 *
 *  #99 item 5 — THE HINT IS A FOOTNOTE NOW, NOT A STEP. Both rulings above stand and the affordance name
 *  stays verbatim; what was wrong is that the clause sat INSIDE the instruction ("Pick a preset … — use
 *  Show list panel … — or create a new one"), so at a 1280 desktop the pane told the reader to open a list
 *  that was open, 400px to its left. A reader with the list on screen should meet the instruction and
 *  nothing else. It moves to its own trailing sentence, explicitly conditional, where the narrow-regime
 *  reader still finds it and the desktop reader can skip it — which is all F-28 ever needed it to do.
 *
 *  #434 — AND NOW IT ONLY RENDERS WHILE THE LIST IS ACTUALLY OFF SCREEN. This file used to record why the
 *  fully honest version was not done ("`listMode` lives in app-shell's `use-shell-layout`, and
 *  `client-features-no-cross` bars preset from reaching it — that is a shell-signal re-home"). The re-home
 *  landed: `useSectionListMode` (`#state`) publishes the SAME resolved mode the shell's own topbar toggle
 *  reads, through the ONE `resolvePanelMode` algebra, which is the only sanctioned way for a feature to ask
 *  (a recomposition from `usePanelOverride` + the viewport reads is the M10 hand-copied-mirror bug). So the
 *  conditional sentence becomes a CONDITIONALLY RENDERED one: a reader with the list on screen meets the
 *  instruction and nothing else, and a reader without it is told a fact rather than handed an "if".
 *
 *  `!== "collapsed"`, never `=== "docked"`: an `overlay` list is on screen — floating over this pane — so
 *  telling that reader to bring the list back would be the same lie one regime over.
 *
 *  #483 / side-eye 2026-08-22 P3-1 + P3-2 — THREE MORE THINGS THE PANE OWED ITS READER:
 *
 *  1. THE TITLE IS A HEADING. In this state `main "Presets content"` held ZERO headings, so heading
 *     navigation dead-ended in the pane the reader was looking at. (The EDITOR state has been an `h2` since
 *     F-28; only the landing was missed.) `titleAs="h2"` — the level is right because this block IS the
 *     pane's content and the shell's own landmarks are above it.
 *  2. THE MEASURE IS THE FOCAL ONE. The default 24rem measure ran this copy to four ragged centered lines at
 *     42.5ch, half the §2 65–75ch band. `measure="wide"` is 32rem ≈ 60ch.
 *  3. THE BLOCK IS CENTERED IN THE PANE, not top-anchored — the chats landing's own idiom
 *     (`chat-landing-surface.tsx`: `h-full … justify-center`). Measured before: 219px of content
 *     top-anchored in a 752px pane, i.e. 71% void that grows with the pane. What this pane does NOT do is
 *     fill that space with recent presets or its own create door: the rows would be the LIST pane repeated
 *     row-for-row (the doubling P2-7 files one tab over) and the create verbs have ONE home in the list band
 *     (`preset-list-header.tsx`). Centering is the fix for an unbalanced pane; a second copy of another pane
 *     is not. */
export function PresetLibraryWelcome(): ReactElement {
  const listMode = useSectionListMode("presets");
  const trpc = useTRPC();
  // The SAME cache the list pane and the band's census read (a non-suspending `useQuery` — this pane must
  // not suspend on a fact that only changes its wording), through the SAME predicate (`filterPresetsByName`),
  // so the three readers cannot drift into three answers about one list.
  const { data: presets } = useQuery(trpc.preset.list.queryOptions());
  const needle = presetSearchNeedle(usePresetSearchQuery());
  // NEEDLE FIRST, deliberately: an unlanded/failed read leaves `presets` undefined, and "0 rows" would then
  // be a claim about the REQUEST, not about the filter. With no needle there is no filtered-to-nothing state
  // to report, whatever the read is doing.
  const filteredToNothing = needle !== "" && filterPresetsByName(presets ?? [], needle).length === 0;
  const teaching = filteredToNothing ? NO_MATCHES : TEACHING;
  return (
    <Stack align="center" className="h-full min-h-0 justify-center">
      {/* @orb-waive empty-state-has-action(EmptyState): the Presets CONTENT teaching state — a "pick a preset on the left, or create one" nudge shown alongside the library list, which itself carries the create CTA. The next step lives in the sibling list, so this state legitimately has no action of its own. Ends if the preset library list stops carrying its create CTA. */}
      <EmptyState
        description={listMode === "collapsed" ? `${teaching}${LIST_OFF_SCREEN_HINT}` : teaching}
        icon={<Icon icon={SlidersHorizontal} size="lg" />}
        measure="wide"
        title="Tune how the model generates"
        titleAs="h2"
        titleStep="focal"
      />
    </Stack>
  );
}
