// The refinery LANDING — what CONTENT renders while nothing is selected: the promise line, the picker
// (the landing's JOB — #157), and the teaching row beneath it.
//
// ── THE PICK RESUMES, IT DOES NOT ALWAYS MINT (#79), AND THAT RULE NO LONGER LIVES HERE ──────────────
// Picking a character used to call `startSession` unconditionally, so ordinary re-entry — land here, pick
// the card you were just working on — minted a fresh blank session every time (measured 2026-08-14: 3
// duplicate sessions on one card in five minutes, 6 on another). Both side panels default COLLAPSED
// (`refinerySection.panelDefaults`), so the list where the scored work sits is off screen: the user gets
// a blank pipeline and reads their session as lost. Sessions are cheap to mint and expensive to lose — the
// anchored-draft model's whole point — so a pick RESUMES the newest OPEN session for that card and mints
// only when the card has none.
//
// That rule, and the list read it turns on, moved to `data/use-open-refinery.ts` on 2026-08-17 when the
// owner ruled ONE start-session-with-character flow behind THREE doors (this picker, the list header's
// `+`, and the CHARACTER section's "Open in Refinery"). The third door is a different FEATURE, which may
// never import this one — the `use-start-chat.ts` seam is the precedent, verbatim. What this pane keeps is
// the composition; what it lost is a decision it was the only caller of.
//
// RESUME-NEWEST IS DETERMINISTIC — no chooser dialog. The list stays the door to an OLDER session on the
// same card. Note what this costs, stated rather than hidden: every door lands on the same resume-or-mint
// rule, so a card with an open session has NO door to a second concurrent one until that session finishes
// (`applyFields` / `applyAsCopy` set `completed`). That is the ruled trade: the duplicate-list defect is
// the live one.
//
// This pane lives beside the content surface rather than inside it because the surface is at its
// `component-size` cap; the split is also the honest one — the landing joins a different read set than the
// session pipeline does and shares none of its state.

import type { CharacterId, RefinerySessionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useOpenRefinery } from "#data";
import { selectRefinerySession } from "#state";
import { useRefinerySessions } from "../hooks/use-refinery-sessions.ts";
import { TeachingState } from "./teaching-state.tsx";

/** The open (active) sessions, newest-updated first, as doors back in. Re-entering the section lands here
 *  with the LIST collapsed by default, so without these the work in progress was invisible and the user
 *  read it as lost. Nothing renders when no session is open. */
function ResumeSessions(): ReactElement | null {
  const sessions = useRefinerySessions();
  const active = (sessions.data ?? []).filter((session) => session.status === "active");
  if (active.length === 0) {
    return null;
  }
  return (
    <Card className="w-full max-w-(--reading-measure)">
      <Stack gap="row" padding="block">
        <Text voice="kicker">Continue a session</Text>
        <Stack gap="tight">
          {active.map((session) => (
            <Button
              className="justify-start"
              intent="secondary"
              key={session.id}
              onClick={(): void => selectRefinerySession(castId<RefinerySessionId>(session.id))}
              size="sm"
            >
              <Text as="span" className="min-w-0 truncate" ink="inherit" voice="label">
                {session.name ?? session.characterName}
              </Text>
              <Text as="span" ink="inherit" voice="gloss">
                round {session.iterationCount}
              </Text>
            </Button>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

export function RefineryStartPane(): ReactElement {
  const { openRefinery, isPending } = useOpenRefinery();
  return (
    <TeachingState
      resume={<ResumeSessions />}
      onStart={(characterId: CharacterId): void => {
        // The flow owns the whole outcome — resume or mint, then the selection write. Errors are already
        // toasted by the mutation's own `errorToast`, and a failed open leaves the user on this pane with
        // the picker still in front of them, which is the honest place to be.
        // @orb-waive caught-failure-ownership(openRefinery): useOpenRefinery's own errorToast
        // surfaces the failure; a failed open just leaves the person on this pane. Ends if useOpenRefinery
        // drops its errorToast.
        void openRefinery(characterId).catch(() => undefined);
      }}
      starting={isPending}
    />
  );
}
