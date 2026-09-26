// A rule's CONNECTIONS (inference program §5.3a, item 0025): one role slot per task the rule's arms spend, with the
// rule as the binding actor. Unset is not "nothing": the resolver folds the rule's binding first and then the
// author's own role, so an unset slot reads as running on the author's connection.

import type { RoutableTask } from "@orb/contracts/inference";
import type { AutomationRuleId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ConnectionRoleSlot, QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { ROLE_ROWS_ORDERED } from "#lib";

export interface RuleConnectionsProps {
  readonly ruleId: AutomationRuleId;
  readonly ruleName: string;
  readonly tasks: readonly RoutableTask[];
}

export function RuleConnections(props: RuleConnectionsProps): ReactElement {
  return (
    <QueryBoundary
      fallback={<SkeletonRows count={props.tasks.length} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label={`the connections for ${props.ruleName}`} onRetry={retry} />}
    >
      <RuleConnectionsBody {...props} />
    </QueryBoundary>
  );
}

function RuleConnectionsBody({ ruleId, tasks }: RuleConnectionsProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const actor = { kind: "automation-rule", ruleId } as const;
  const { data: connections } = useSuspenseQuery(trpc.connection.list.queryOptions());
  const { data: bindings } = useSuspenseQuery(trpc.connection.listBindings.queryOptions({ actor }));
  return (
    <Stack data-slot="rule-connections" gap="block">
      {ROLE_ROWS_ORDERED.filter((row) => tasks.includes(row.task)).map((row) => (
        <ConnectionRoleSlot
          key={row.task}
          actor={actor}
          connections={connections}
          description={RULE_SLOT_DESCRIPTIONS[row.task]}
          invalidation={invalidation}
          row={row}
          trpc={trpc}
          unsetLabel={`Same as my ${row.label} role`}
          view={bindings.find((view) => view.task === row.task) ?? null}
        />
      ))}
    </Stack>
  );
}

/** What a slot means for a rule: which of its arms spend through it, and what the author's own role covers.
 *  Only the tasks `AUTOMATION_ARM_BINDING_TASK` names can reach a rule's editor; the rest keep the row's copy. */
const RULE_SLOT_DESCRIPTIONS: Partial<Record<RoutableTask, string>> = {
  chat: "Turns this rule starts or suggests run on it. Left on your own role, they run on your Chat connection.",
  generateImage: "Pictures this rule makes are drawn with it. Left on your own role, they use your Image generation connection.",
};
