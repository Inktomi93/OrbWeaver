// B11 — the room ACTIVITY log: a READ-ONLY, host-only readout of what
// THIS room did out-of-band while you were away. It reads `automation.listChatActivity` — the chat's fire
// log ACROSS all its rules, newest first — which is the SAME durable `automation_fires` store the per-rule
// `RuleFireLog` consumes (ONE-HOME; B11 invents no second store). Every automation dispatch is a row here:
// an auto-fire, a host Run-now, a NOTICE (the notify arm), a PLUGIN-tool run (the run_tool arm), and a
// human-CONFIRMED suggestion card (a `fired` row stamped with its confirmer in `detail.confirmedByUserId`).
//
// The row renders the SAME badge/trigger/detail as the per-rule log, from the SHARED `fireOutcomeView` +
// `fireDetailLine` in `lib/rule-copy.ts` (§5.5 one-home). `caps` is `null`: the room log spans every rule, so
// it holds no single rule's rate caps — `fireDetailLine(null)` renders the generic budget line rather than a
// wrong number. THE SEAM FOR B6: when the reactions plane lands, its "reactions-while-away digest" pairs into
// this same readout (spec §7 B11 "Rides the B6 wave") — a second source merged BELOW, not a second surface.

import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { testId, timeLib } from "#lib";
import { fireDetailLine, fireOutcomeView, triggerLabel } from "../lib/rule-copy.ts";

/** The recent tail the tab requests — a room spans several rules, so a slightly deeper page than the
 *  per-rule log's; the server caps at `AUTOMATION_FIRES_LIST_MAX_LIMIT` regardless. */
const ROOM_ACTIVITY_LIMIT = 30;

/** Was this fire a human-CONFIRMED suggestion? A confirmed card records who authorized it in
 *  `detail.confirmedByUserId` (confirm-suggestion.ts) — its PRESENCE is what distinguishes a confirmed card
 *  from an automatic fire, which is the datum B11 calls the "confirmer stamp". */
function wasConfirmed(detail: Record<string, unknown> | null): boolean {
  return typeof detail?.["confirmedByUserId"] === "string";
}

export interface RoomActivityLogProps {
  readonly chatId: ChatId;
}

/** The room Activity readout for one chat (host-only, newest first). Suspends on `listChatActivity`; the
 *  contributing tab wraps it in the CONTEXT panel's own `QueryBoundary`. */
export function RoomActivityLog({ chatId }: RoomActivityLogProps): ReactElement {
  const trpc = useTRPC();
  const { data: fires } = useSuspenseQuery(trpc.automation.listChatActivity.queryOptions({ chatId, limit: ROOM_ACTIVITY_LIMIT }));

  if (fires.length === 0) {
    return <Text voice="gloss">Nothing yet — when a rule fires, posts a notice, runs a tool, or you confirm a card, it shows up here.</Text>;
  }

  return (
    <Stack gap="block" data-testid={testId("roomActivityLog")}>
      {fires.map((fire) => {
        const view = fireOutcomeView(fire.outcome);
        // `caps: null` — the room log spans every rule, so no single rule's caps apply (see the header).
        const detail = fireDetailLine(fire.outcome, fire.detail, null);
        return (
          <Stack key={fire.id} gap="tight" data-slot="activity-row">
            <Row gap="block" align="center" justify="between">
              <Row className="min-w-0" gap="block" align="center">
                <Badge intent={view.intent} tone="soft" size="sm">
                  {view.label}
                </Badge>
                {wasConfirmed(fire.detail) ? (
                  <Badge intent="info" tone="soft" size="sm">
                    Confirmed
                  </Badge>
                ) : null}
                <Text voice="gloss">{triggerLabel(fire.triggerType)}</Text>
              </Row>
              <Text className="shrink-0" voice="gloss">
                {timeLib.formatRelativeCompact(fire.firedAt)}
              </Text>
            </Row>
            {detail === null ? null : <Text voice="gloss">{detail}</Text>}
          </Stack>
        );
      })}
    </Stack>
  );
}
