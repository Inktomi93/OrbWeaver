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
// `message.selectedVariantId`, so swiping a row re-targets the lookup with NO refetch (the whole window is
// already indexed client-side — see `useTurnToolCallsByVariant`).

import type { MessageView } from "@orb/contracts/chat";
import type { RpgRecordedToolCall, RpgToolCallVerdict } from "@orb/contracts/rpg";
import type { BadgeProps } from "@orb/ui/badge";
import { Badge } from "@orb/ui/badge";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useTurnToolCallsByVariant } from "../hooks/use-turn-tool-calls.ts";

/** The badge intent per verdict — a mapped Record, so a widened verdict axis fails `tsc` here (§5.5) rather
 *  than silently rendering a lost write as if it had landed. */
const VERDICT_INTENT: Record<RpgToolCallVerdict, NonNullable<BadgeProps["intent"]>> = {
  applied: "success",
  salvaged: "warning",
  dropped: "danger",
};

/** The verdict said as an OUTCOME, in the reader's terms — not the enum. "dropped" alone reads like a UI
 *  state; "not recorded" is what actually happened to their game. */
const VERDICT_LABEL: Record<RpgToolCallVerdict, string> = {
  applied: "recorded",
  salvaged: "partly recorded",
  dropped: "not recorded",
};

export interface TurnToolCallsDisclosureProps {
  readonly message: MessageView;
}

/**
 * The row's disclosure. Returns `null` — rendering NOTHING, not an empty shell — when this variant has no
 * record, which is the applicability gate: most turns in most rooms have none.
 */
export function TurnToolCallsDisclosure({ message }: TurnToolCallsDisclosureProps): ReactElement | null {
  const byVariant = useTurnToolCallsByVariant(message.chatId);
  const calls = byVariant.get(message.selectedVariantId);
  if (calls === undefined || calls.length === 0) {
    return null;
  }
  return (
    <Collapsible data-slot="turn-tool-calls">
      {/* §13.10 N3 — stable identity FIRST ("Game actions on this turn"), the volatile count suffixed, so
          `getByRole("button", {name: /Game actions on this turn/})` stays findable as the count changes.
          N4: names what activating it DOES for the reader, sentence case, no role noun. */}
      <CollapsibleTrigger className="w-full">
        <Text voice="label">{`Game actions on this turn — ${calls.length}`}</Text>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <Stack gap="field">
          {calls.map((call) => (
            <CallLine call={call} key={`${call.name}:${call.args}`} />
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
function CallLine({ call }: { readonly call: RpgRecordedToolCall }): ReactElement {
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
    </Stack>
  );
}
