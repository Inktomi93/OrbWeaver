// B2 — the per-rule FIRE LOG (interaction-direction-spec §7 B2): the host-only "why didn't my rule fire"
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
// The outcome → label/tone map is an EXHAUSTIVE Record over `AUTOMATION_FIRE_OUTCOMES` (§5.5 string-union
// dispatch): a new terminal fails `tsc` here until it declares its copy and tone, so the log can never
// silently render a raw enum value.

import type { AutomationFireOutcome } from "@orb/contracts/automation";
import type { AutomationRuleId } from "@orb/kit/ids";
import type { BadgeProps } from "@orb/ui/badge";
import { Badge } from "@orb/ui/badge";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { timeLib } from "#lib";
import type { RuleFireCaps } from "../lib/rule-copy.ts";
import { fireDetailLine, triggerLabel } from "../lib/rule-copy.ts";

/** The default page the log requests — the recent tail is what answers "did my last few turns fire?"; the
 *  server caps at `AUTOMATION_FIRES_LIST_MAX_LIMIT` regardless. */
const FIRE_LOG_LIMIT = 20;

interface FireOutcomeView {
  readonly label: string;
  readonly intent: BadgeProps["intent"];
}

/** One fire outcome's host-facing copy + badge tone, dispatched EXHAUSTIVELY (§5.5 — a new
 *  `AutomationFireOutcome` fails `tsc` at the `never` default). `fired` is the only success; the refusals are
 *  neutral facts (the rule is healthy, its condition simply did not hold), and the error terminals are the
 *  ones a host must notice. `test_run` marks a dry run so a Test press does not read as a real fire. A switch
 *  (not an object literal) is what keeps the snake_case wire terminals off the `useNamingConvention` lint. */
function fireOutcomeView(outcome: AutomationFireOutcome): FireOutcomeView {
  switch (outcome) {
    case "fired":
      return { label: "Fired", intent: "success" };
    case "predicate_false":
      return { label: "Condition not met", intent: "neutral" };
    case "predicate_error":
      return { label: "Condition errored", intent: "danger" };
    case "budget_refused":
      return { label: "Rate-capped", intent: "warning" };
    case "depth_refused":
      return { label: "Cascade-capped", intent: "warning" };
    case "action_error":
      return { label: "Action errored", intent: "danger" };
    case "authority_refused":
      return { label: "No authority", intent: "danger" };
    case "test_run":
      return { label: "Test run", intent: "info" };
    default: {
      const exhaustive: never = outcome;
      throw new Error(`unhandled automation fire outcome: ${JSON.stringify(exhaustive)}`);
    }
  }
}

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
