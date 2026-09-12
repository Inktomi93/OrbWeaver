// WHAT THIS TURN DID — the per-row disclosure of a folded turn's tool calls (TOOLCALLS-INVISIBLE, arm A).
// Mounted through the chat `message-footer` surface anchor (§6c/M8), so rpg grafts onto the transcript
// WITHOUT chat importing anything rpg-shaped and without the row learning what a tool call is.
//
// WHY IT EXISTS: on the `folded` path the model answers in prose AND emits its state writes in ONE
// completion, and D112 keeps that tool traffic server-internal — chat never resolves, executes or persists
// it. Correct, and it meant the majority of what a turn DID was invisible to the person who just played it:
// "it thought for a while and then nothing happened" with no way to see that `update_scene` fired and the
// schema refused its `weather`. The rpg-owned record is what makes that legible.
//
// COLLAPSED BY DEFAULT and APPLICABILITY-GATED, never a mode or a setting ([[no-separate-reduced-modes]]):
// the disclosure is present exactly when THIS row's selected variant has a record, and absent otherwise. A
// non-game chat has no records, so it never renders — no flag, no branch, no "reduced" transcript.
//
// SWIPE-CORRECT FOR FREE: the record is keyed by the producing `variantId` and this reads
// `message.selectedVariantId`, so swiping a row re-targets the selector with NO refetch (the whole window is
// already cached client-side — see `useTurnToolCallsForVariant`).

import type { MessageView } from "@orb/contracts/chat";
import type { RpgToolCallDisclosure, RpgToolCallVerdict, RpgToolCallWithholdReason } from "@orb/contracts/rpg";
import type { BadgeProps } from "@orb/ui/badge";
import { Badge } from "@orb/ui/badge";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { DISCLOSURE_TOUCH_FLOOR_AT_COARSE } from "#components";
import { useTurnToolCallsForVariant } from "../hooks/use-turn-tool-calls.ts";

/** The badge intent per verdict — a mapped Record, so a widened verdict axis fails `tsc` here (§5.5) rather
 *  than silently rendering a lost write as if it had landed. */
const VERDICT_INTENT: Record<RpgToolCallVerdict, NonNullable<BadgeProps["intent"]>> = {
  applied: "success",
  salvaged: "warning",
  dropped: "danger",
  // A lock drop is the reader's OWN doing, so it is a warning rather than a failure — but it is never
  // `success`: part of what the model wrote is not in the state, and the line below names which path.
  overridden: "warning",
};

/** WHY the args are not this reader's to see, said as a sentence rather than as the enum (#1690). A mapped
 *  Record over the tuple, so a second withhold reason fails `tsc` here instead of rendering as nothing. */
const WITHHELD_LABEL: Record<RpgToolCallWithholdReason, string> = {
  unparseable: "Arguments not shown — the model did not send readable ones.",
};

/** The verdict said as an OUTCOME, in the reader's terms — not the enum. "dropped" alone reads like a UI
 *  state; "not recorded" is what actually happened to their game. */
const VERDICT_LABEL: Record<RpgToolCallVerdict, string> = {
  applied: "recorded",
  salvaged: "partly recorded",
  dropped: "not recorded",
  // Says whose decision it was, not what the merge did: the host pinned this field, so the honest sentence
  // is that their edit held — the `issues` line under the badge names the path it held.
  overridden: "your edit kept",
};

export interface TurnToolCallsDisclosureProps {
  readonly message: MessageView;
}

/**
 * The row's disclosure. Returns `null` — rendering NOTHING, not an empty shell — when this variant has no
 * record, which is the applicability gate: most turns in most rooms have none.
 */
export function TurnToolCallsDisclosure({ message }: TurnToolCallsDisclosureProps): ReactElement | null {
  const { calls, failure } = useTurnToolCallsForVariant(message.chatId, message.selectedVariantId);
  // A record with an EMPTY call list is not "nothing to show" — it is the turn whose state round could not RUN
  // (#1468 item 2), and returning null there would restore the exact silence this disclosure exists to end:
  // the model call that records state failed, and the reader saw a turn that simply did nothing.
  if (calls.length === 0 && failure === null) {
    return null;
  }
  return (
    <Collapsible data-slot="turn-tool-calls">
      {/* §13.10 N3 — stable identity FIRST ("Game actions on this turn"), the volatile count suffixed, so
          `getByRole("button", {name: /Game actions on this turn/})` stays findable as the count changes.
          N4: names what activating it DOES for the reader, sentence case, no role noun. */}
      {/* THE COARSE TOUCH FLOOR IS THE TRIGGER'S OWN (side-eye 2026-08-16 #93). `CollapsibleTrigger` is a
          text-height `inline-flex` line, not a control box, so it carries none of `Button`'s hit-area
          `::after` arms — MEASURED at 430×740 DPR3 `pointer:coarse` this row was 406×16 and its centre did
          not resolve to itself under `elementFromPoint`. The floor is a shared `#components` fragment
          because axis-3 device capability is banned from a feature className. */}
      {/* THE SAME RULING, RENDERED (#1381). The `@orb-waive sub-floor-disclosure` marker below is a SOURCE comment and the
          design-audit walker measures the DOM, so every cold audit of /chats re-filed this row as a P1
          tap-target at fine pointer — twice in one day. `data-target-floor="sub-floor-ok"` is that ruling
          as a fact the walker can read: it EXCLUDES the candidate at fine pointer with a named reason and
          counts it in the population row (never a silent skip), and it changes nothing at coarse, where
          the fragment above takes the real 44px floor and a genuine regression must still fire.
          The marker stays the JSX comment IMMEDIATELY before the element — the central waiver engine binds a
          JSX comment carrier to its one adjacent significant sibling, so no other element may sit between them. */}
      {/* @orb-waive sub-floor-disclosure("text"): recorded ruling (pointer-variants.ts DISCLOSURE_TOUCH_FLOOR_AT_COARSE): coarse takes the 44px floor via the fragment; FINE stays a 16px line in a dense transcript footer — a control box here is the density cost that ruling priced and declined */}
      <CollapsibleTrigger className={`w-full ${DISCLOSURE_TOUCH_FLOOR_AT_COARSE}`} size="text" data-target-floor="sub-floor-ok">
        {/* The count is the volatile half and stays SUFFIXED (N3). A failed round has no count to give — its
            suffix is the same word a dropped call's badge uses, so one turn's outcome reads the same whether
            the loss was one call's or the whole round's. */}
        <Text voice="label">{`Game actions on this turn — ${failure === null ? calls.length : VERDICT_LABEL.dropped}`}</Text>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <Stack gap="field">
          {/* WHY nothing was recorded, as visible TEXT and FIRST — the same posture the per-call reason takes
              (never a tooltip). The server has already decided how much of it this viewer may read: the host
              gets the vehicle's own error, everyone else the bare summary. */}
          {failure === null ? null : (
            <Text className="block" data-slot="turn-tool-calls-failure" voice="gloss">
              {failure}
            </Text>
          )}
          {calls.map((call) => (
            <CallLine call={call} key={`${call.name}:${call.args}:${call.verdict}`} />
          ))}
        </Stack>
      </CollapsiblePanel>
    </Collapsible>
  );
}

/** One call: what it was, whether it landed, and — when it did not — WHY, as visible text.
 *
 *  The reason is TEXT, never a tooltip: `SCENE-DROPPED` cost a live session hours precisely because the
 *  failing field was not visible anywhere, and a hover affordance is unreachable on touch and invisible to a
 *  reader skimming the transcript. Same posture as `InertCard`'s reason-and-remedy. */
function CallLine({ call }: { readonly call: RpgToolCallDisclosure }): ReactElement {
  // `?? null` rather than a bare `=== null`: this is a WIRE value, and a payload from a server that predates
  // the withhold field must read as "nothing withheld", never as an empty gloss line.
  const withheld = call.withheld ?? null;
  return (
    <Stack data-slot="turn-tool-call" gap="row">
      <Row align="center" gap="field" justify="between">
        <Text voice="datum">{call.name}</Text>
        <Badge intent={VERDICT_INTENT[call.verdict]}>{VERDICT_LABEL[call.verdict]}</Badge>
      </Row>
      {call.issues.length === 0 ? null : (
        <Text className="block" voice="gloss">
          {call.issues.join(" · ")}
        </Text>
      )}
      {/* #1690 — SAID, not silently empty. The server withholds args it could not belt for this viewer, and a
          reader who is told nothing about that reads the absence as "the model sent nothing". */}
      {withheld === null ? null : (
        <Text className="block" data-slot="turn-tool-call-withheld" voice="gloss">
          {WITHHELD_LABEL[withheld]}
        </Text>
      )}
    </Stack>
  );
}
