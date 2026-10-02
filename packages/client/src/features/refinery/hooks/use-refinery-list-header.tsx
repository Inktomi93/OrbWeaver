import { Button } from "@orb/ui/button";
import { Icon, Plus } from "@orb/ui/icons";
import type { ReactElement } from "react";
import type { ListPaneHeaderView } from "#lib";
import { useMobileViewport, useSelectedRefinerySessionId } from "#state";
import { StartSessionDoor } from "../components/start-session-door.tsx";
import { useRefineryCensus } from "./use-refinery-sessions.ts";

/**
 * The LIST chrome band (D66 A1/A2): the shared `ListPaneHeader` cluster — title + count + the START
 * DOOR since P1-6. Once a session is selected there was NO way back to "start another one" from anywhere
 * in the feature (and the phone list, which IS the whole screen, never had one at all): the only door
 * lived in CONTENT's teaching state, which a selected session replaces.
 *
 * REBUILT ONTO `ListPaneHeader` (#1206): this band was the ONE hand-rolled `Text voice="kicker"`/
 * `voice="gloss"` pair left after `ListPaneHeader` was minted to retire exactly that duplication
 * (chat/corpus/analytics) — it also missed the #1136 title-size step (16→24px display) every other
 * list-bearing section already carries, and left `LIST_PANE_TITLE_ID` unset, so `panel-chrome.tsx`'s
 * `aria-labelledby` for the LIST `<aside>` resolved to nothing here. The action slot carries the
 * IDENTICAL `StartSessionDoor` this band already had; only the vehicle changed.
 *

 * ── THE `+` IS A DOOR, NOT A SELECTION-CLEARER (owner ruling, 2026-08-17, #157) ──────────────────────
 * It used to call `clearRefinerySelection()` and nothing else, which meant it did NOTHING at cold open
 * (where the selection is already null) — so it shipped `disabled` there, and the real pick-a-character
 * affordance sat in the content pane below a scroll. The owner ruled the inversion IS the defect: "the
 * primary action must not be a visible dead control while the real affordance hides below the fold."
 * (The kept-as-designed review this reverses, and the CT pin that recorded it, are named in
 * `tests/client/features/refinery/surfaces/refinery-list-surface.ct.tsx`.)
 *
 * So the `+` now opens the SAME picker the landing shows and fires the SAME flow (`useOpenRefinery` —
 * one resume-or-mint rule for all three doors), from cold open and with a session open alike. The
 * anchored-Popover-around-a-shared-Command-body shape is `AddMemberPopover`'s, which is also what
 * `CharacterDoor` does one folder over; the OUTER chrome differs (a glyph button in a chrome band, not a
 * secondary button that echoes a choice), which is exactly the part each consumer is supposed to own.
 *
 * ── …AND NOT WHEN CONTENT IS ALREADY SHOWING THAT PICKER (side-eye 2026-08-19 P1-3) ──────────────────
 * "From cold open and with a session open alike" turned out to be one arm too many. With nothing selected
 * the landing MOUNTS the full-library picker in the content pane; the `+` opened a SECOND one over it —
 * two identical 100-row pickers on one plane, which the duplicate-door lens fires on and which makes the
 * glyph a worse copy of a control already on screen. So the `+` earns its keep only where the landing is
 * not: with a session open (the landing is replaced by the pipeline), or on a PHONE with nothing selected,
 * where the one-shell rule makes this list the whole screen and CONTENT is not rendered at all
 * (`resolvePanelMode`'s `listIsScreen` arm) — there the glyph is the only door and hiding it would leave
 * the phone startable only from the empty state. Not `disabled`: that is the #157 defect itself.
 */
export function useRefineryListHeader(): ListPaneHeaderView {
  // ONE census spelling, shared with the phone topbar's screen title (#1676) — and non-suspending, like every
  // other section's band ("the title renders immediately and the count settles in place"). It is the SAME
  // `listSessions` key the roster surface below suspends on, so the band still costs no extra request and the
  // settled render is unchanged.
  const census = useRefineryCensus();
  const selectedId = useSelectedRefinerySessionId();
  const isMobile = useMobileViewport();
  const contentShowsPicker = selectedId === null && !isMobile;
  return {
    action: contentShowsPicker ? undefined : (
      <StartSessionDoor
        trigger={(busy): ReactElement => (
          <Button aria-busy={busy} aria-label="Start a new session" intent="ghost" size="glyph-md" title="Start a new session">
            <Icon icon={Plus} size="sm" />
          </Button>
        )}
      />
    ),
    count: census ?? 0,
    title: "Sessions",
  };
}
