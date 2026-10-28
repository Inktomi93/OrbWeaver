// Per-message game actions, selected by producing variant and mounted through message-footer.
// State writes remain server-owned; this exposes their recorded outcomes without adding game logic to chat.

import type { MessageView } from "@orb/contracts/chat";
import type { RpgToolCallDisclosure, RpgToolCallVerdict, RpgToolCallWithholdReason } from "@orb/contracts/rpg";
import type { BadgeProps } from "@orb/ui/badge";
import { Badge } from "@orb/ui/badge";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { CircleAlert, Dices, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
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
  const incomplete = calls.some((call) => call.verdict === "dropped" || call.verdict === "salvaged");
  const warning = failure !== null || incomplete;
  const summary = failure === null ? `${calls.length}${incomplete ? " — needs attention" : ""}` : VERDICT_LABEL.dropped;
  return (
    <Collapsible data-slot="turn-tool-calls">
      {/* Fine pointers retain the dense footer's text-height box; the native touch floor owns coarse height. */}
      <CollapsibleTrigger
        aria-label={`Game actions on this turn — ${summary}`}
        className="self-start"
        touchFloor="block"
        size="text"
        data-target-floor="sub-floor-ok"
      >
        <Icon icon={warning ? CircleAlert : Dices} size="sm" tone={warning ? "warning" : "muted"} />
        <Text voice="code">{failure === null ? calls.length : VERDICT_LABEL.dropped}</Text>
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

/** Each issue with a stable key: a call can repeat one issue verbatim, so the key counts its earlier twins. */
function keyedIssues(issues: readonly string[]): readonly { readonly key: string; readonly issue: string }[] {
  const seen = new Map<string, number>();
  return issues.map((issue) => {
    const count = seen.get(issue) ?? 0;
    seen.set(issue, count + 1);
    return { key: `${issue}#${String(count)}`, issue };
  });
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
        <Text voice="code">{call.name}</Text>
        <Badge intent={VERDICT_INTENT[call.verdict]}>{VERDICT_LABEL[call.verdict]}</Badge>
      </Row>
      {call.issues.length === 0 ? null : (
        <Stack data-slot="turn-tool-call-issues" gap="tight">
          {keyedIssues(call.issues).map(({ key, issue }) => (
            <Text className="block" key={key} voice="gloss">
              {issue}
            </Text>
          ))}
        </Stack>
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
