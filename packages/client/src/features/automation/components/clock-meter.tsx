// §4 #7 — THE CLOCK'S METER: the room-facing half of the
// `clockFires` preset. The preset's R1 counts a fill up one step per beat and publishes the threshold it
// fills TO; this renders that pair as a `SegmentedClock` beside the transcript, so a "clock fires when full"
// room shows its countdown filling in place instead of only the arm's result when it lands.
//
// IT READS THE VARS PLANE, member-visible by the same design as the needle. `chat.getRuntimeVariables` is
// member-gated (the runtime fold `{{setvar}}` and every `set_variable` arm write into), and BOTH the fill
// (`CLOCK_VAR_KEY`) and the max (`CLOCK_MAX_VAR_KEY`) are ordinary published variables — the preset's R1 emits
// them as two free `set_variable` arms. The max is a VARIABLE and not the rule's threshold knob for a reason
// the meter could not work around: the knob lands as a LITERAL inside R2's CEL predicate
// (`int(vars.clock) >= N`), which no member read exposes and which the client may not re-derive (a predicate
// is server logic). Publishing N into the plane the widget already reads is the correct home for it.
//
// NON-SUSPENDING BY CONSTRUCTION, exactly like the needle: it mounts as a `thread-flank` contribution and the
// room renders that anchor with no Suspense boundary of its own, so a `useSuspenseQuery` here would suspend
// the WHOLE room on a widget most rooms never show. Undefined data reads as "no clock", the same arm as an
// absent variable.
//
// SILENT UNTIL THE ROOM CARRIES A CLOCK: no `clockMax` (the preset was never added, or its first beat has not
// landed), a non-numeric or sub-two max (the vars plane is shared — a member's `{{setvar}}` can put anything
// in any key), or a cold cache all render NOTHING, and the flank stack's `empty:hidden` makes "mounted but
// silent" and "not mounted" render identically. The FILL alone is not enough to draw a ring — a clock with no
// known size is a broken gauge — so the MAX is what gates the render; a present max with an absent/zero fill
// draws an honest empty ring (the state right after a fire, which deletes only the fill).

import { CLOCK_MAX_VAR_KEY, CLOCK_VAR_KEY } from "@orb/contracts/automation";
import type { ChatId } from "@orb/kit/ids";
import { Card } from "@orb/ui/card";
import { Row } from "@orb/ui/layout";
import { SegmentedClock } from "@orb/ui/meter";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";

/** A `SegmentedClock` needs at least two wedges; a max below it is not a clock the ring can draw. */
const MIN_CLOCK_SEGMENTS = 2;
/** The fill floor — a clock counts up from empty, never below it. */
const CLOCK_MIN = 0;
/** What the widget is CALLED, in the room's own words: the accessible name stem AND the visible label. */
const CLOCK_LABEL = "Clock";

/** One variable read as a whole non-negative count, or `null` when the key is absent or is not a finite
 *  integer. The vars plane is hand-writable and shared across rules, so every read is validated, never
 *  trusted. */
function readCount(variables: Readonly<Record<string, string>> | undefined, key: string): number | null {
  const raw = variables?.[key];
  if (raw === undefined) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface ClockMeterProps {
  readonly chatId: ChatId;
}

/** The fill clock for one room. Renders nothing until the room actually carries a clock (a valid published
 *  max); a valid max with an absent or zero fill draws an honest empty ring. */
export function ClockMeter({ chatId }: ClockMeterProps): ReactElement | null {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.chat.getRuntimeVariables.queryOptions({ chatId }));
  const max = readCount(data, CLOCK_MAX_VAR_KEY);
  if (max === null || max < MIN_CLOCK_SEGMENTS) {
    return null;
  }
  const filled = Math.min(max, Math.max(CLOCK_MIN, readCount(data, CLOCK_VAR_KEY) ?? CLOCK_MIN));
  return (
    <Card>
      <Row gap="block" align="center">
        <SegmentedClock segments={max} filled={filled} size="sm" label={`${CLOCK_LABEL}: ${filled} of ${max}`} />
        <Text voice="label">{CLOCK_LABEL}</Text>
        <Text voice="gloss">{`${filled} / ${max}`}</Text>
      </Row>
    </Card>
  );
}
