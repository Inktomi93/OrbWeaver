// The closed rule row's state lines: the unreadable and auto-disabled notices, then when the rule last ran.
// Each notice is a badge plus a sentence, so the verdict is a word and never colour alone.

import { AUTOMATION_CONSECUTIVE_ERROR_CEILING } from "@orb/contracts/automation";
import { Badge } from "@orb/ui/badge";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { lastRunLine } from "../lib/rule-copy.ts";
import { RULE_UNREADABLE_BADGE, ruleUnreadableLine } from "../lib/rule-refusal-copy.ts";

type Rule = inferOutput<Trpc["automation"]["listRules"]>[number];

const AUTO_DISABLED_BADGE = "Turned off";
const AUTO_DISABLED_LINE = `Turned off after ${AUTOMATION_CONSECUTIVE_ERROR_CEILING} errors in a row. Check Recent activity and fix the rule before you switch it back on.`;

function StateNotice({ badge, slot, line }: { readonly badge: string; readonly slot: string; readonly line: string }): ReactElement {
  return (
    <Row align="start" className="min-w-0 flex-wrap" gap="block">
      <Badge intent="danger" size="sm" tone="soft">
        {badge}
      </Badge>
      <Text className="min-w-0 flex-1" data-slot={slot} voice="gloss">
        {line}
      </Text>
    </Row>
  );
}

/** Not a live region: the row renders these on arrival, and N broken rules would announce N times on mount. */
export function RuleRowState({ rule }: { readonly rule: Rule }): ReactElement {
  const errored = rule.lastError !== null;
  return (
    <>
      {rule.actionsCorrupt ? <StateNotice badge={RULE_UNREADABLE_BADGE} slot="rule-actions-unreadable" line={ruleUnreadableLine(rule.lastError)} /> : null}
      {/* The dispatch switched it off, not the host. Saying so stops a host flipping it back on unfixed. */}
      {rule.autoDisabled ? <StateNotice badge={AUTO_DISABLED_BADGE} slot="rule-auto-disabled" line={AUTO_DISABLED_LINE} /> : null}
      <Text data-slot="rule-last-run" voice="gloss">
        {lastRunLine(rule.lastFiredAt, errored)}
        {errored ? " Its last run errored." : ""}
      </Text>
    </>
  );
}
