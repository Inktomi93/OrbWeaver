// §4 #16 — THE NEEDLE'S METER: the room-facing half of the needle preset (row
// 16 + §8's F6 exception). The preset's analysis pass scores the scene's tension into ONE chat variable; this
// renders that score as a dial beside the transcript.
//
// IT READS THE VARS PLANE, WHICH IS WHY IT IS MEMBER-VISIBLE AT ALL. `chat.getRuntimeVariables` is
// member-gated by design (the runtime fold is what `{{setvar}}` and every `set_variable` arm already write,
// and members see it) — and that is exactly why the RULING lets only a clamped NUMERIC SCORE cross into it.
// Arcs, twists and guidance live in `automation_rule_state`, which has no member read surface at all. This
// component therefore knows one key and one number, and could not render a guidance line if it tried.
//
// NON-SUSPENDING BY CONSTRUCTION. It mounts as a `thread-flank` contribution, and the room renders that
// anchor with no Suspense boundary of its own — a `useSuspenseQuery` here would suspend the WHOLE room on a
// widget nine rooms out of ten do not show (the `ComposerSlot` argument in `chat-room-surface.tsx`, same
// file, same reason). Undefined data reads as "no score yet", which is the same arm as an absent variable.
//
// SILENT UNTIL THERE IS A SCORE: no variable (the preset was never added, or its first pass has not landed
// yet), a non-numeric value (the vars plane is shared — a member's `{{setvar}}` can put words in any key), or
// a cold cache all render NOTHING. There is no empty state, deliberately: a room with no needle must not
// grow automation chrome, and the seam's collapse law makes a null body cost nothing (the flank column is
// `empty:hidden`, the same property the above-composer control band ships).

import { ANALYSIS_SCORE_MAX, NEEDLE_TENSION_VAR_KEY } from "@orb/contracts/automation";
import type { ChatId } from "@orb/kit/ids";
import { Card } from "@orb/ui/card";
import { Meter } from "@orb/ui/meter";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";

/** The dial's floor — the score's own scale starts at rest, not at a percentage. */
const NEEDLE_MIN = 0;
/** What the dial is CALLED, in the room's own words: the accessible name AND the visible label. */
const NEEDLE_LABEL = "Story tension";

/** The stored value as a score, or `null` when the key is absent or is not a whole number on the dial's
 *  scale. CLAMPED rather than trusted: the applier writes a clamped integer, but the same variable is
 *  writable by hand and by any other rule, and a dial whose needle points off the end of its own arc is a
 *  broken gauge rather than an honest reading. */
function readScore(variables: Readonly<Record<string, string>> | undefined): number | null {
  const raw = variables?.[NEEDLE_TENSION_VAR_KEY];
  if (raw === undefined) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.min(ANALYSIS_SCORE_MAX, Math.max(NEEDLE_MIN, parsed));
}

export interface NeedleMeterProps {
  readonly chatId: ChatId;
}

/** The tension dial for one room. Renders nothing until the room actually carries a score. */
export function NeedleMeter({ chatId }: NeedleMeterProps): ReactElement | null {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.chat.getRuntimeVariables.queryOptions({ chatId }));
  const score = readScore(data);
  if (score === null) {
    return null;
  }
  return (
    <Card>
      <Meter kind="arc" label={NEEDLE_LABEL} max={ANALYSIS_SCORE_MAX} showValue={true} value={score} />
    </Card>
  );
}
