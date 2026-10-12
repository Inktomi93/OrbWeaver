// `useOpenRefinery` — THE client seam for entering a refinery session on a card (#157, owner-ruled
// 2026-08-17: "one start-session-with-character flow, three doors").
//
// THE THREE DOORS, all of which fire exactly this: the sessions roster header's `+` (live at cold open —
// the reversal that issue is about), the landing's picker (`features/refinery/components/teaching-state`),
// and the CHARACTER section's "Open in Refinery" action. One flow means the resume-or-mint rule, the
// navigation and the selection write happen in ONE place; three doors reaching three implementations is
// how #79 (duplicate sessions) happened the first time.
//
// IT LIVES IN `#data`, NOT `features/refinery`, for the reason `use-start-chat.ts`'s header states
// verbatim about its own move: a feature may never import another feature, and the CHARACTER section is
// now a launcher. `data/` may reach `state/`, so the post-open navigation is the same intent-named module
// action the rest of the app calls. `refinery.startSession`'s mutation came WITH it — the launcher and its
// creation verb are one concept, and leaving the mutation in the feature would have made this module the
// second home of "start a refinery session".
//
// THE RESUME DECISION AWAITS ITS INPUT (cache-first read), it does not gate a control on it. The roster is
// the whole input to resume-vs-mint (#79), and the previous shape defended that by DISABLING the landing's
// pick button until `listSessions` landed — which is a dead-looking control in the exact first frames a
// cold-open user is looking at, i.e. the defect #157 is about, one control over. Awaiting the read at
// CLICK time makes the guarantee stronger (it holds for every door, including ones that never render a
// pending state) and costs nothing when the read is already in cache, which it is on the refinery section
// and after any roster paint. A read that FAILS still opens the mint arm: a roster that cannot be fetched
// must not lock the user out of starting anything.

import type { RefinerySessionStatus } from "@orb/contracts/refinery";
import type { CharacterId, RefinerySessionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { useQueryClient } from "@tanstack/react-query";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import { selectRefinerySession, setActiveSection } from "#state";
import { createEntityMutation } from "./create-entity-mutation.ts";
import { peekQueryData } from "./peek-query.ts";
import type { Trpc } from "./trpc.ts";
import { useTRPC } from "./trpc.ts";
import { useInvalidation } from "./use-invalidation.ts";

type SessionList = inferOutput<Trpc["refinery"]["listSessions"]>;
type SessionSummaryView = SessionList[number];

/** The session producer. `startSession` emits `refineryChanged` with the new session's id; the seam's row
 *  refetches the roster on every device, so the write carries no writer-local `invalidates`. */
const useStartRefinerySessionMutation = createEntityMutation<inferInput<Trpc["refinery"]["startSession"]>, inferOutput<Trpc["refinery"]["startSession"]>>({
  options: (trpc) => trpc.refinery.startSession.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't start a refinery session for that card.",
});

/** Which session statuses a pick may RESUME into (#79). A mapped Record over the wire union, not an
 *  `=== "active"`: a fourth `REFINERY_SESSION_STATUSES` member fails tsc HERE, so whether the door reopens
 *  it is a decision someone makes rather than a default this file picks silently. `completed` is a finished
 *  session (an apply took the snapshot) and `abandoned` is a discarded one — picking the card again means
 *  starting over, so both mint. The VERDICT does not gate any of this: a scored, accepted-verdict session
 *  that is still `active` is exactly the work #79 is about losing. */
const RESUMABLE_STATUS: Record<RefinerySessionStatus, boolean> = {
  active: true,
  completed: false,
  abandoned: false,
};

/** The session a pick resumes for `characterId` — the most recently UPDATED resumable one — or null when
 *  the card has none and the pick mints. Newest is read off `updatedAt` explicitly rather than off the
 *  roster's position: `listSessions` does return newest-updated first, but "which session the user was last
 *  in" is the fact this decision turns on, and taking it from the row itself keeps that true if the
 *  roster's order is ever re-ruled. */
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

export interface UseOpenRefineryResult {
  /** Resume this card's newest open session, or mint one, then land in it with the Refinery section
   *  active. Resolves to the session that was opened. */
  readonly openRefinery: (characterId: CharacterId) => Promise<RefinerySessionId>;
  /** True for the one round-trip between the pick and the pipeline — launchers render their pending state
   *  off this rather than letting the click look dead. */
  readonly isPending: boolean;
}

export function useOpenRefinery(): UseOpenRefineryResult {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const queryClient = useQueryClient();
  const start = useStartRefinerySessionMutation({ trpc, invalidation });

  return {
    isPending: start.isPending,
    openRefinery: async (characterId): Promise<RefinerySessionId> => {
      // The roster decides resume-vs-mint, so the decision waits for it (header). A failed read falls
      // through to the mint arm rather than refusing to open anything.
      const options = trpc.refinery.listSessions.queryOptions();
      // @orb-waive caught-failure-ownership(queryClient.query): a failed roster explicitly takes the mint arm rather than locking this door (header); createEntityMutation's errorToast owns a failed startSession. Ends if roster failure stops permitting mint or the mutation loses its failure owner.
      const roster = await (peekQueryData(queryClient, options.queryKey) ?? queryClient.query(options).catch((): SessionList => []));
      const resumable = resumableSessionIdOf(roster, characterId);
      const sessionId = resumable ?? castId<RefinerySessionId>((await start.mutateAsync({ characterId })).id);
      selectRefinerySession(sessionId);
      setActiveSection("refinery");
      return sessionId;
    },
  };
}
