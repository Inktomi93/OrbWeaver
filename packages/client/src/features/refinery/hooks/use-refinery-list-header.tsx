import { Button } from "@orb/ui/button";
import { Icon, Plus } from "@orb/ui/icons";
import type { ReactElement } from "react";
import type { ListPaneHeaderView } from "#lib";
import { useMobileViewport, useSelectedRefinerySessionId } from "#state";
import { StartSessionDoor } from "../components/start-session-door.tsx";
import { useRefineryCensus } from "./use-refinery-sessions.ts";

/**
 * The LIST chrome band (D66 A1/A2): the shared `ListPaneHeader` cluster — title + count + the START
 * DOOR. Once a session is selected, CONTENT's teaching state (the other start door) is replaced, so the
 * band carries the way back to "start another one".
 *
 * `ListPaneHeader` gives the band the list-bearing sections' title step and sets `LIST_PANE_TITLE_ID`, which
 * `panel-chrome.tsx`'s `aria-labelledby` for the LIST `<aside>` resolves.

 * ── THE `+` IS A DOOR, NOT A SELECTION-CLEARER (owner ruling) ───────────────────────────────────────
 * A selection-clearer does NOTHING at cold open, where the selection is already null. The owner: "the
 * primary action must not be a visible dead control while the real affordance hides below the fold."
 *
 * So the `+` opens the SAME picker the landing shows and fires the SAME flow (`useOpenRefinery` —
 * one resume-or-mint rule for all three doors), from cold open and with a session open alike. The
 * anchored-Popover-around-a-shared-Command-body shape is `AddMemberPopover`'s, which is also what
 * `CharacterDoor` does one folder over; the OUTER chrome differs (a glyph button in a chrome band, not a
 * secondary button that echoes a choice), which is exactly the part each consumer is supposed to own.
 *
 * ── …AND NOT WHEN CONTENT IS ALREADY SHOWING THAT PICKER ──────────────────────────────────────────────
 * With nothing selected the landing MOUNTS the full-library picker in the content pane, and a `+` there
 * would open a SECOND identical picker over it. So the `+` earns its keep only where the landing is
 * not: with a session open (the landing is replaced by the pipeline), or on a PHONE with nothing selected,
 * where the one-shell rule makes this list the whole screen and CONTENT is not rendered at all
 * (`resolvePanelMode`'s `listIsScreen` arm) — there the glyph is the only door and hiding it would leave
 * the phone startable only from the empty state. Not `disabled`: a visible dead control is the defect the
 * owner ruled out.
 */
export function useRefineryListHeader(): ListPaneHeaderView {
  // ONE census spelling, shared with the phone topbar's screen title — and non-suspending, like every
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
          <Button aria-busy={busy} aria-label="Start a new session" intent="ghost" size="glyph-md">
            <Icon icon={Plus} size="sm" />
          </Button>
        )}
      />
    ),
    count: census ?? 0,
    title: "Sessions",
  };
}
