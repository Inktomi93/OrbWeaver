// The refinery LANDING — what CONTENT renders while nothing is selected: the teaching state, its character
// door, and the resume-or-mint decision a pick resolves.
//
// ── THE PICK RESUMES, IT DOES NOT ALWAYS MINT (#79) ──────────────────────────────────────────────────
// Picking a character here used to call `startSession` unconditionally, so ordinary re-entry — land here,
// pick the card you were just working on — minted a fresh blank session every time (measured 2026-08-14:
// 3 duplicate sessions on one card in five minutes, 6 on another). Both side panels default COLLAPSED
// (`refinerySection.panelDefaults`), so the roster where the scored work sits is off screen: the user gets
// a blank pipeline and reads their session as lost. Sessions are cheap to mint and expensive to lose — the
// anchored-draft model's whole point — so a pick RESUMES the newest OPEN session for that card and mints
// only when the card has none.
//
// RESUME-NEWEST IS DETERMINISTIC — no chooser dialog. The roster stays the door to an OLDER session on the
// same card. Note what this costs, stated rather than hidden: the list header's "Start a new session" (`+`)
// only clears the selection back to this pane, so it lands on the same resume-or-mint rule — a card with an
// open session has NO landing door to a second concurrent one until that session finishes (`applyFields` /
// `applyAsCopy` set `completed`). That is the ruled trade: the duplicate-roster defect is the live one.
//
// This pane lives beside the content surface rather than inside it because the surface is at its
// `component-size` cap; the split is also the honest one — the landing joins a different read set than the
// session pipeline does and shares none of its state.

import type { RefinerySessionStatus } from "@orb/contracts/refinery";
import type { CharacterId, RefinerySessionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { selectRefinerySession } from "#state";
import { useStartRefinerySession } from "../hooks/use-refinery-mutations.ts";
import { useRefinerySessions } from "../hooks/use-refinery-sessions.ts";
import { TeachingState } from "./teaching-state.tsx";

type SessionSummaryView = inferOutput<Trpc["refinery"]["listSessions"]>[number];

/** Which session statuses the landing pick may RESUME into (#79). A mapped Record over the wire union, not
 *  an `=== "active"`: a fourth `REFINERY_SESSION_STATUSES` member fails tsc HERE, so whether the landing
 *  door reopens it is a decision someone makes rather than a default this file picks silently. `completed`
 *  is a finished session (an apply took the snapshot) and `abandoned` is a discarded one — picking the card
 *  again means starting over, so both mint. The VERDICT does not gate any of this: a scored, accepted-verdict
 *  session that is still `active` is exactly the work #79 is about losing. */
const RESUMABLE_STATUS: Record<RefinerySessionStatus, boolean> = {
  active: true,
  completed: false,
  abandoned: false,
};

/** The session a landing pick resumes for `characterId` — the most recently UPDATED resumable one — or null
 *  when the card has none and the pick mints. Newest is read off `updatedAt` explicitly rather than off the
 *  roster's position: `listSessions` does return newest-updated first, but "which session the user was last
 *  in" is the fact this decision turns on, and taking it from the row itself keeps that true if the roster's
 *  order is ever re-ruled. */
function resumableSessionIdOf(roster: readonly SessionSummaryView[], characterId: CharacterId): RefinerySessionId | null {
  let newest: SessionSummaryView | null = null;
  for (const row of roster) {
    if (row.characterId !== characterId || !RESUMABLE_STATUS[row.status]) {
      continue;
    }
    if (newest === null || row.updatedAt > newest.updatedAt) {
      newest = row;
    }
  }
  return newest === null ? null : castId<RefinerySessionId>(newest.id);
}

export function RefineryStartPane(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const start = useStartRefinerySession({ trpc, invalidation });
  // The SAME roster the list pane and the mobile topbar title read (`listSessions`, one query key, already
  // in flight from section mount via `useRefinerySelectionTitle`) — the resume check costs no new request.
  const sessions = useRefinerySessions();
  return (
    <TeachingState
      onStart={(characterId: CharacterId): void => {
        // Resume through `selectRefinerySession` — the SAME door the minted arm below lands on, so both
        // outcomes of one pick leave the drill store in one state. (Not `selectRefinerySessionFromList`:
        // that variant additionally releases an open LIST slide-over, which is a roster-row click's
        // concern; this pick happens in the CONTENT pane, where no slide-over can be covering it.)
        const resumable = sessions.data === undefined ? null : resumableSessionIdOf(sessions.data, characterId);
        if (resumable !== null) {
          selectRefinerySession(resumable);
          return;
        }
        start.mutate({ characterId }, { onSuccess: (session): void => selectRefinerySession(castId<RefinerySessionId>(session.id)) });
      }}
      // INERT UNTIL THE ROSTER LANDS. `sessions.data` is the whole input to the resume decision, so a pick
      // resolved against an unlanded cache would mint the duplicate #79 is about — the door opens once the
      // read has an answer. It is a read that is already in flight when this pane first paints, so the
      // closed window is the pane's own first frames. A FAILED read leaves `isPending` false, which
      // deliberately re-opens the door on the mint arm: a roster that cannot be fetched must not lock the
      // user out of starting anything.
      starting={start.isPending || sessions.isPending}
    />
  );
}
