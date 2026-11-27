// The Global settings section (Settings → Admin → Global settings): the server-wide settings rows with each stored
// value and its last-written time, read-only. `settings.listGlobalSettings` is adminProcedure and hands over a bounded,
// preview-cut list; this section is convenience over that floor and owns its read and its suspense boundary.

import { Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { MutedLine, QueryBoundary, useFirstBootRows } from "#components";
import { QueryErrorState, SkeletonRows, useSuspenseQuery, useTRPC } from "#data";
import { testId, timeLib } from "#lib";
import { ADMIN_GLOBAL_SETTINGS_SUBCATEGORY } from "../lib/admin-global-settings-nav.ts";
import { ADMIN_GLOBAL_SETTINGS_EMPTY, ADMIN_GLOBAL_SETTINGS_NOTE, adminGlobalSettingsPartialNote } from "../lib/user-admin-names.ts";

const ELLIPSIS = "…";

/** The Global settings section body — mounted at the admin pane's sections anchor. */
export function AdminGlobalSettingsSection({ anchorId }: { readonly anchorId: string }): ReactElement {
  const firstBootRows = useFirstBootRows({ wide: 2, narrow: 1 });
  return (
    // RESERVED (#1098) — an admin section that settles into the stored-rows list; the whole admin pane stacks below it.
    <QueryBoundary
      resetKeys={[]}
      fallback={<SkeletonRows count={3} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="the global settings: they're available to administrators only" onRetry={retry} />}
      reserveRows={firstBootRows}
      reserveKey="config.admin.global-settings"
    >
      <AdminGlobalSettingsBody anchorId={anchorId} />
    </QueryBoundary>
  );
}

function AdminGlobalSettingsBody({ anchorId }: { readonly anchorId: string }): ReactElement {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.settings.listGlobalSettings.queryOptions());
  return (
    <Section container={true} divider={true} heading={ADMIN_GLOBAL_SETTINGS_SUBCATEGORY.label} id={anchorId}>
      <Stack gap="row" data-testid={testId("adminGlobalSettingsSection")}>
        <Text cap="prose" voice="label" ink="muted">
          {ADMIN_GLOBAL_SETTINGS_NOTE}
        </Text>
        {data.rows.length === 0 ? (
          <MutedLine data-testid={testId("adminGlobalSettingsEmpty")}>{ADMIN_GLOBAL_SETTINGS_EMPTY}</MutedLine>
        ) : (
          <Stack gap="field">
            {data.rows.map((row) => (
              <ListRow
                key={row.key}
                title={row.key}
                subtitle={`Updated ${timeLib.formatRelative(row.updatedAt)} · ${row.valuePreview}${row.valueTruncated ? ELLIPSIS : ""}`}
              />
            ))}
          </Stack>
        )}
        {data.total > data.rows.length ? (
          <MutedLine data-testid={testId("adminGlobalSettingsPartial")}>{adminGlobalSettingsPartialNote(data.rows.length, data.total)}</MutedLine>
        ) : null}
      </Stack>
    </Section>
  );
}
