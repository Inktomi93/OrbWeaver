// The MODEL ROLES section (Settings → Connections) — one compact row per routable task ("binding" is a schema
// word and never reaches copy, §5.3a): a Select of the user's compatible connections → `connection.setBinding`,
// beside what a turn resolves TODAY against the PERSISTED read (`listBindings` carries the resolved view +
// the unavailable cause). A background task on a row with `allowBackground` off is refused INLINE with the
// reason — the slot is the first enforcement point; resolve's `canFund` re-checks. Owns its own `QueryBoundary`.

import { Badge } from "@orb/ui/badge";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import type { Invalidation, Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { configAnchorId } from "#state";
import { useSetBinding } from "../hooks/use-connections-mutations.ts";
import type { RoleRow } from "../lib/connections-model.ts";
import { bindRefusal, connectionSummary, persistedRoleLabel, ROLE_ROWS_ORDERED } from "../lib/connections-model.ts";
import { CONNECTIONS_ROLES_SUBCATEGORY } from "../lib/connections-nav.ts";

type ConnectionListItem = inferOutput<Trpc["connection"]["list"]>[number];
type BindingView = inferOutput<Trpc["connection"]["listBindings"]>[number];

const UNSET_VALUE = "";

export function ConnectionsRolesSection(): ReactElement {
  return (
    // RESERVED (#1098) — a config section that settles into one row per model role — the tallest block on this pane.
    <QueryBoundary
      fallback={<SkeletonRows count={4} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your model roles" onRetry={retry} />}
      reserveKey="config.connections.roles"
    >
      <ModelRolesBody />
    </QueryBoundary>
  );
}

function ModelRolesBody(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: connections } = useSuspenseQuery(trpc.connection.list.queryOptions());
  const { data: bindings } = useSuspenseQuery(trpc.connection.listBindings.queryOptions());

  return (
    <Section divider={true} heading={CONNECTIONS_ROLES_SUBCATEGORY.label} id={configAnchorId("connections", CONNECTIONS_ROLES_SUBCATEGORY.id)}>
      <Text voice="gloss">Pick which connection each role uses. An unset role does nothing — there is no default model.</Text>
      <Stack gap="block">
        {ROLE_ROWS_ORDERED.map((row) => (
          <RoleSlotRow
            key={row.task}
            row={row}
            connections={connections}
            view={bindings.find((view) => view.task === row.task) ?? null}
            trpc={trpc}
            invalidation={invalidation}
          />
        ))}
      </Stack>
    </Section>
  );
}

interface RoleSlotRowProps {
  readonly row: RoleRow;
  readonly connections: readonly ConnectionListItem[];
  readonly view: BindingView | null;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

function RoleSlotRow({ row, connections, view, trpc, invalidation }: RoleSlotRowProps): ReactElement {
  const setBinding = useSetBinding({ trpc, invalidation });
  const compatible = connections.filter((connection) => connection.tasks.includes(row.task));
  const items = [
    { label: row.optional ? "None" : "Not set", value: UNSET_VALUE },
    ...compatible.map((connection) => {
      const refusal = bindRefusal(connection, row.task);
      return { label: connectionSummary(connection), value: connection.id as string, ...(refusal === null ? {} : { disabled: true, description: refusal }) };
    }),
  ];
  const current = view?.binding?.connectionId ?? UNSET_VALUE;

  return (
    <Row gap="field" align="start" justify="between" className="flex-wrap">
      <Stack gap="tight">
        <Row gap="field" align="center">
          <Text voice="label">{row.label}</Text>
          {view !== null && view.resolved === null && view.binding !== null && view.binding.connectionId !== null ? (
            <Badge intent="warning" size="sm">
              {view.unavailableCause ?? "unavailable"}
            </Badge>
          ) : null}
        </Row>
        <Text voice="gloss">{row.description}</Text>
        {/* What a turn resolves TODAY — the persisted read, never the picker's draft. */}
        <Text voice="gloss">A turn uses {view === null ? "nothing — no connection is set" : persistedRoleLabel(view)}.</Text>
      </Stack>
      <Select
        aria-label={`${row.label} connection`}
        items={items}
        value={current}
        disabled={setBinding.isPending}
        onValueChange={(value): void => {
          const connectionId = value === UNSET_VALUE ? null : compatible.find((connection) => connection.id === value)?.id;
          if (connectionId === undefined) {
            return;
          }
          setBinding.mutate({ task: row.task, connectionId });
        }}
        placeholder="Not set"
      />
    </Row>
  );
}
