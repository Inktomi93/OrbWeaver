// The MODEL ROLES section (Settings → Connections): one `ConnectionRoleSlot` per routable task for the signed-in
// user ("binding" is a schema word and never reaches copy, §5.3a), over the persisted `listBindings` read.
// Owns its own `QueryBoundary`; the row and why it carries three channels is `components/connection-role-slot.tsx`.

import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ConnectionRoleSlot, QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { ROLE_ROWS_ORDERED } from "#lib";
import { configAnchorId } from "#state";
import { CONNECTIONS_ROLES_SUBCATEGORY } from "../lib/connections-nav.ts";

// The pane is as wide as the settings body; a sentence capped at the prose measure never runs across it.
const PROSE_MEASURE = "max-w-(--reading-measure-prose)";

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
      {/* The F20 sentence rides the SECTION BODY, not just the nav teach text: the body is where a user
          forms the expectation that a room might override this, and it is the width-independent one. */}
      <Text voice="gloss" className={PROSE_MEASURE}>
        Pick which connection each role uses. An unset role does nothing — there is no default model. Rooms never override this: a turn always runs on the
        connection of whoever triggered it.
      </Text>
      <Stack gap="block">
        {ROLE_ROWS_ORDERED.map((row) => (
          <ConnectionRoleSlot
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
