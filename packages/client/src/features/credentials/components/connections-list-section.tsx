// The CONNECTIONS section (Settings → Connections) — the user's connection rows: label · provider · model ·
// the tasks it may serve, with "Use for everything" (§5.3a's one-click survivor), the background switch and
// a confirmed remove. Owns its own `QueryBoundary` (config-revamp-design.md §6.8 — one contributed section
// per read).

import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Plus, Trash2 } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog, QueryBoundary } from "#components";
import type { Invalidation, Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { configAnchorId } from "#state";
import { useRemoveConnection, useUpdateConnection, useUseForEverything } from "../hooks/use-connections-mutations.ts";
import { connectionSummary } from "../lib/connections-model.ts";
import { CONNECTIONS_LIST_SUBCATEGORY } from "../lib/connections-nav.ts";
import { AddConnectionDialog } from "./add-connection-dialog.tsx";

type ConnectionListItem = inferOutput<Trpc["connection"]["list"]>[number];

export function ConnectionsListSection(): ReactElement {
  return (
    // RESERVED (#1098) — a config section that settles into one row per connection.
    <QueryBoundary
      fallback={<SkeletonRows count={3} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your connections" onRetry={retry} />}
      reserveKey="config.connections.list"
    >
      <ConnectionsBody />
    </QueryBoundary>
  );
}

function ConnectionsBody(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: connections } = useSuspenseQuery(trpc.connection.list.queryOptions());
  const [addOpen, setAddOpen] = useState(false);

  return (
    <Section divider={true} heading={CONNECTIONS_LIST_SUBCATEGORY.label} id={configAnchorId("connections", CONNECTIONS_LIST_SUBCATEGORY.id)}>
      <Row gap="field" align="center" justify="between" className="flex-wrap">
        <Text voice="gloss">One provider and one model per connection. Every turn you trigger — in any room — runs on your own connections.</Text>
        {/* ONE "Add connection" PER VIEWPORT: the empty state owns the verb while the list is empty. */}
        {connections.length === 0 ? null : (
          <Button intent="primary" size="sm" onClick={(): void => setAddOpen(true)}>
            <Icon icon={Plus} size="sm" />
            Add connection
          </Button>
        )}
      </Row>

      {connections.length === 0 ? (
        <EmptyState
          icon={<Icon icon={Plus} size="lg" />}
          title="No connections yet"
          description="Add a provider key or your own server so your roles can reach a model."
          action={
            <Button intent="primary" size="sm" onClick={(): void => setAddOpen(true)}>
              <Icon icon={Plus} size="sm" />
              Add connection
            </Button>
          }
        />
      ) : (
        <Stack gap="field">
          {connections.map((connection) => (
            <ConnectionRow key={connection.id} connection={connection} trpc={trpc} invalidation={invalidation} />
          ))}
        </Stack>
      )}

      <AddConnectionDialog open={addOpen} onOpenChange={setAddOpen} trpc={trpc} invalidation={invalidation} />
    </Section>
  );
}

function ConnectionRow({
  connection,
  trpc,
  invalidation,
}: {
  readonly connection: ConnectionListItem;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}): ReactElement {
  const deps = { trpc, invalidation };
  const remove = useRemoveConnection(deps);
  const update = useUpdateConnection(deps);
  const applyEverywhere = useUseForEverything(deps);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const subtitle = [connection.providerLabel, connection.baseUrl, connection.modelListed ? null : "typed model id — sent as-is"]
    .filter((part) => part !== null)
    .join(" · ");

  return (
    <ListRow
      title={connectionSummary(connection)}
      subtitle={subtitle}
      leading={
        <Row gap="field" align="center">
          {connection.tasks.map((task) => (
            <Badge key={task} intent="neutral" size="sm">
              {task}
            </Badge>
          ))}
        </Row>
      }
      actions={
        <Row gap="field" align="center">
          <Row gap="field" align="center">
            <Switch
              aria-label={`Allow background work on ${connection.label}`}
              checked={connection.allowBackground}
              disabled={update.isPending}
              onCheckedChange={(checked): void => update.mutate({ connectionId: connection.id, patch: { allowBackground: checked } })}
            />
            <Text voice="gloss">background</Text>
          </Row>
          <Button
            intent="secondary"
            size="sm"
            disabled={applyEverywhere.isPending}
            onClick={(): void => applyEverywhere.mutate({ connectionId: connection.id })}
          >
            Use for everything it can serve
          </Button>
          <Button intent="ghost" size="sm" aria-label={`Remove the ${connection.label} connection`} onClick={(): void => setDeleteOpen(true)}>
            <Icon icon={Trash2} size="sm" />
          </Button>
          <ConfirmDialog
            confirmLabel="Remove"
            description="Every role using this connection goes unset until you pick another. Past messages keep their attribution. This can't be undone."
            onConfirm={(): void => remove.mutate({ connectionId: connection.id })}
            onOpenChange={setDeleteOpen}
            open={deleteOpen}
            title={`Remove "${connection.label}"?`}
          />
        </Row>
      }
    />
  );
}
