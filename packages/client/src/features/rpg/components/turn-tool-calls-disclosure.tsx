// Per-message game actions, selected by producing variant and mounted through message-footer.
// State writes remain server-owned; this exposes their recorded outcomes without adding game logic to chat.

import type { MessageView } from "@orb/contracts/chat";
import type { RpgToolCallDisclosure, RpgToolCallVerdict, RpgToolCallWithholdReason } from "@orb/contracts/rpg";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { CircleAlert, Dices, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { StatusVocabulary } from "#components";
import { StatusChip } from "#components";
import { useTurnToolCallsForVariant } from "../hooks/use-turn-tool-calls.ts";
import { RPG_TOOL_CALL_VERDICT_LABELS, turnToolCallsCount, turnToolCallsName } from "../lib/rpg-names.ts";

/** WHY the args are not this reader's to see, said as a sentence rather than as the enum (#1690). A mapped
 *  Record over the tuple, so a second withhold reason fails `tsc` here instead of rendering as nothing. */
const WITHHELD_LABEL: Record<RpgToolCallWithholdReason, string> = {
  unparseable: "Arguments not shown: the model did not send readable ones.",
};

const VERDICT_STATUS: StatusVocabulary<RpgToolCallVerdict> = {
  applied: { label: RPG_TOOL_CALL_VERDICT_LABELS.applied, tone: "success" },
  salvaged: { label: RPG_TOOL_CALL_VERDICT_LABELS.salvaged, tone: "warning" },
  dropped: { label: RPG_TOOL_CALL_VERDICT_LABELS.dropped, tone: "destructive" },
  // A lock drop is the reader's OWN doing, so it is a warning rather than a failure — but it is never
  // `success`: part of what the model wrote is not in the state, and the line below names which path.
  overridden: { label: RPG_TOOL_CALL_VERDICT_LABELS.overridden, tone: "warning" },
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
  const summary = failure === null ? turnToolCallsCount(calls.length, incomplete) : RPG_TOOL_CALL_VERDICT_LABELS.dropped;
  return (
    <Collapsible data-slot="turn-tool-calls">
      {/* Fine pointers retain the dense footer's text-height box; the native touch floor owns coarse height. */}
      <CollapsibleTrigger aria-label={turnToolCallsName(summary)} self="start" touchFloor="block" size="text" data-target-floor="sub-floor-ok">
        <Icon icon={warning ? CircleAlert : Dices} size="sm" {...(warning ? ({ tone: "warning" } as const) : ({ ink: "muted" } as const))} />
        <Text voice="code">{failure === null ? calls.length : RPG_TOOL_CALL_VERDICT_LABELS.dropped}</Text>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <Stack gap="field">
          {/* WHY nothing was recorded, as visible TEXT and FIRST — the same posture the per-call reason takes
              (never a tooltip). The server has already decided how much of it this viewer may read: the host
              gets the vehicle's own error, everyone else the bare summary. */}
          {failure === null ? null : (
            <Text flow="block" data-slot="turn-tool-calls-failure" voice="gloss">
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
        <StatusChip status={call.verdict} vocabulary={VERDICT_STATUS} />
      </Row>
      {call.issues.length === 0 ? null : (
        <Stack data-slot="turn-tool-call-issues" gap="tight">
          {keyedIssues(call.issues).map(({ key, issue }) => (
            <Text flow="block" key={key} voice="gloss">
              {issue}
            </Text>
          ))}
        </Stack>
      )}
      {/* #1690 — SAID, not silently empty. The server withholds args it could not belt for this viewer, and a
          reader who is told nothing about that reads the absence as "the model sent nothing". */}
      {withheld === null ? null : (
        <Text flow="block" data-slot="turn-tool-call-withheld" voice="gloss">
          {WITHHELD_LABEL[withheld]}
        </Text>
      )}
    </Stack>
  );
}
