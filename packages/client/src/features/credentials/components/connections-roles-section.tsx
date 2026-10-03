// The MODEL ROLES section (Settings → Connections): one `ConnectionRoleSlot` per routable task for the signed-in
// user ("binding" is a schema word and never reaches copy, §5.3a), over the persisted `listBindings` read.
// Owns its own `QueryBoundary`; the row and why it carries three channels is `components/connection-role-slot.tsx`.

import { Button } from "@orb/ui/button";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { ConnectionRoleSlot, QueryBoundary } from "#components";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { CONNECTIONS_LIST_ADDRESS, ROLE_ROWS_ORDERED } from "#lib";
import { configAnchorId, configSettingControlId, openConfigTo } from "#state";
import { useRequestConnectionEditor } from "../lib/connection-editor-request-store.ts";
import { CONNECTIONS_ROLES_SUBCATEGORY, ROLE_SETTING_IDS } from "../lib/connections-nav.ts";
import { UtilityPresetSelect } from "./utility-preset-select.tsx";

// The pane is as wide as the settings body; a sentence capped at the prose measure never runs across it.
const PROSE_MEASURE = "max-w-(--reading-measure-prose)";

// A role with a declared Model roles leaf stamps its picker as that leaf's deep-link focus target.
function settingControlId(settingId: string | undefined): string | undefined {
  return settingId === undefined ? undefined : configSettingControlId("connections", settingId);
}

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

type ConnectionListItem = inferOutput<Trpc["connection"]["list"]>[number];
type BindingView = inferOutput<Trpc["connection"]["listBindings"]>[number];

/** The Rerank picker offers one row per connection, and the built-in rerankers share one row; another of them is
 *  that row's model, so the hint is a door to the row the role is on. Shown only while the role is on a built-in row. */
function BuiltinRerankerHint({
  connections,
  bindings,
  builtinProviderIds,
}: {
  readonly connections: readonly ConnectionListItem[];
  readonly bindings: readonly BindingView[];
  readonly builtinProviderIds: ReadonlySet<string>;
}): ReactElement | null {
  const requestConnectionEditor = useRequestConnectionEditor();
  const boundId = bindings.find((view) => view.task === "rerank")?.binding?.connectionId ?? null;
  const row = connections.find((connection) => connection.id === boundId && builtinProviderIds.has(connection.providerId));
  if (row === undefined) {
    return null;
  }
  return (
    <Row align="center" className="flex-wrap" gap="field">
      <Text voice="gloss" className={PROSE_MEASURE}>
        {`To use a lighter or older built-in reranker, open ${row.label} under Connections and pick another model.`}
      </Text>
      <Button
        intent="ghost"
        onClick={(): void => {
          openConfigTo(CONNECTIONS_LIST_ADDRESS.group, CONNECTIONS_LIST_ADDRESS.sub);
          requestConnectionEditor(row.id);
        }}
        size="sm"
        type="button"
      >
        {`Open ${row.label}`}
      </Button>
    </Row>
  );
}

function ModelRolesBody(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: connections } = useSuspenseQuery(trpc.connection.list.queryOptions());
  const { data: bindings } = useSuspenseQuery(trpc.connection.listBindings.queryOptions());
  const { data: available } = useSuspenseQuery(trpc.connection.providersAvailable.queryOptions());
  const builtinProviderIds = new Set(available.filter((entry) => entry.provider.catalog === "builtin").map((entry) => entry.provider.id));

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
          <Stack key={row.task} gap="field">
            <ConnectionRoleSlot
              row={row}
              connections={connections}
              view={bindings.find((view) => view.task === row.task) ?? null}
              controlId={settingControlId(ROLE_SETTING_IDS[row.task])}
              trpc={trpc}
              invalidation={invalidation}
            />
            {/* Chat's preset is the active preset (the Presets pane); only Utility picks its own (D299). */}
            {row.task === "summarize" ? <UtilityPresetSelect /> : null}
            {row.task === "rerank" ? <BuiltinRerankerHint bindings={bindings} builtinProviderIds={builtinProviderIds} connections={connections} /> : null}
          </Stack>
        ))}
      </Stack>
    </Section>
  );
}
