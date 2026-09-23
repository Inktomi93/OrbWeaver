// B2 — the per-rule FIRE LOG: the host-only "why didn't my rule fire"
// surface. `automation.listFires` is newest-first; each row names its OUTCOME (the fire terminal), WHY that
// terminal happened, and when — so a rule that keeps NOT firing shows a run of `predicate_false`/
// `budget_refused` rather than silence. Host-only by construction — the whole Rules section mounts only for
// a host.
//
// THE ROW RENDERS `detail` (side-eye #621 P1-5). `FireView.detail` is documented at
// `domain/automation/contract/results.ts:31` as carrying the per-arm results / the error / the rendered
// previews, and it was never read: the log showed a badge, the RAW `turnCompleted` wire discriminator, and
// a relative stamp — while the Run-now toast for an action error literally said "see the fire log". That
// closed loop is the whole point of this surface, so the projection lives in `lib/rule-copy.ts`
// (`fireDetailLine`) and is unit-tested there; "Rate-capped" now carries WHICH cap and its number, which
// is why this component takes the rule's `caps`.
//
// The outcome → label/tone dispatch (`fireOutcomeView`) is an EXHAUSTIVE switch over `AUTOMATION_FIRE_OUTCOMES`
// (§5.5 string-union dispatch) homed ONE file over in `lib/rule-copy.ts` beside the other fire copy: a new
// terminal fails `tsc` there until it declares its copy and tone, so the log can never silently render a raw
// enum value. It lives in the copy lib (not here) so B11's room Activity log renders the SAME badge from the
// SAME dispatch (§5.5 one-home — the tell that a second surface must not re-spell the outcome vocabulary).

import type { AutomationRuleId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { timeLib } from "#lib";
import type { RuleFireCaps } from "../lib/rule-copy.ts";
import { fireDetailLine, fireOutcomeView, triggerLabel } from "../lib/rule-copy.ts";

/** The default page the log requests — the recent tail is what answers "did my last few turns fire?"; the
 *  server caps at `AUTOMATION_FIRES_LIST_MAX_LIMIT` regardless. */
const FIRE_LOG_LIMIT = 20;

export interface RuleFireLogProps {
  readonly ruleId: AutomationRuleId;
  /** The rule's own rate caps — what turns a `budget_refused` badge into an answer with a number in it. */
  readonly caps: RuleFireCaps;
}

/** The recent fire log for one rule (host-only, newest first). Suspends on `listFires`; wrap in the section's
 *  own `QueryBoundary`. */
export function RuleFireLog({ ruleId, caps }: RuleFireLogProps): ReactElement {
  const trpc = useTRPC();
  const { data: fires } = useSuspenseQuery(trpc.automation.listFires.queryOptions({ ruleId, limit: FIRE_LOG_LIMIT }));

  if (fires.length === 0) {
    return <Text voice="gloss">No activity yet — this rule hasn't been triggered since it was added.</Text>;
  }

  return (
    <Stack gap="block">
      {fires.map((fire) => {
        const view = fireOutcomeView(fire.outcome);
        const detail = fireDetailLine(fire.outcome, fire.detail, caps);
        return (
          <Stack key={fire.id} gap="tight">
            <Row gap="block" align="center" justify="between">
              <Row className="min-w-0" gap="block" align="center">
                <Badge intent={view.intent} tone="soft" size="sm">
                  {view.label}
                </Badge>
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
