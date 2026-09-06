// The Operations admin SECTION (SET-SEAMS stage 4) — the two deployment ops knobs: background corpus
// indexing and the server log level (applied live by the config-cache reload seam, no restart).
//
// A self-owned settings-SECTION CONTRIBUTION at the `admin` anchor (the System pane decomposed, §10 Q2).
// §6's table offers "split or keep one user-admin section" for this pair; it stays ONE, in user-admin:
// splitting would mint a second nav row for a single switch, and NEITHER knob has a client reader to home
// with (both are read server-side — `corpusAutoindex` by the indexer, `logLevel` by the logger rebind), so
// reader-owns is silent here and the fallback is the feature that owns the deployment-config surfaces.
//
// Both controls write IMMEDIATELY (a toggle/enum pick IS the override), so there is no draft and the shared
// row renders Reset alone.

import type { AppSettings, LogLevel } from "@orb/contracts/settings";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { useReportSaveStatus } from "#forms";
import { configAnchorId } from "#state";
import { useUpdateAppOverrides } from "../hooks/use-admin-mutations.ts";
import { envFloor, isOverridden, saveStateOf } from "../lib/app-override-model.ts";
import { LOG_LEVEL_ITEMS } from "../lib/log-level-items.ts";
import { OPERATIONS_SUBCATEGORY } from "../lib/system-config-nav.ts";
import { AdminOverrideResetRow, AdminOverrideSelect, AdminOverrideSwitch } from "./admin-override-field.tsx";

/** The section's own suspense/error boundary — it reads for itself, so it must recover for itself. */
export function OperationsSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    // RESERVED (#1098) — an admin settings section that settles into an override knob stack.
    <QueryBoundary
      fallback={<SkeletonRows count={3} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="operations — administrators only" onRetry={retry} />}
      reserveKey="config.admin.operations"
    >
      <OperationsBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function OperationsBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getAppSettingsWithOverrides.queryOptions());
  const save = useUpdateAppOverrides({ trpc, invalidation });

  const resolved = data.resolved;
  const overrides = data.overrides;
  useReportSaveStatus(sectionId, saveStateOf(save.isPending, save.error !== null));

  const autoindexOverridden = isOverridden(overrides.corpusAutoindex);
  const logLevelOverridden = isOverridden(overrides.logLevel);

  const write = (partial: AppSettings): void => {
    save.mutateAsync({ partial }).catch(() => undefined); // the sticky save.error slot surfaces the failure
  };

  return (
    <Section className="@container" divider={true} heading={OPERATIONS_SUBCATEGORY.label} id={configAnchorId("admin", OPERATIONS_SUBCATEGORY.id)}>
      <Stack gap="field">
        <Text voice="gloss">Deployment operations. Both apply live — no restart.</Text>
        <AdminOverrideSwitch
          label="Background corpus indexing"
          hint="Keep the library's embedding index up to date in the background as content changes."
          value={resolved.corpusAutoindex}
          overridden={autoindexOverridden}
          floorLabel={envFloor(autoindexOverridden, resolved.corpusAutoindex ? "on" : "off")}
          onSet={(next): void => write({ corpusAutoindex: next })}
        />
        <AdminOverrideSelect
          label="Log level"
          hint="Server log verbosity. Applied live — no restart needed."
          value={resolved.logLevel}
          items={LOG_LEVEL_ITEMS}
          overridden={logLevelOverridden}
          floorLabel={envFloor(logLevelOverridden, resolved.logLevel)}
          onSet={(next): void => write({ logLevel: next as LogLevel })}
        />
        <AdminOverrideResetRow
          anyOverridden={autoindexOverridden || logLevelOverridden}
          saving={save.isPending}
          errored={save.error !== null}
          onReset={(): void => write({ corpusAutoindex: null, logLevel: null })}
        />
      </Stack>
    </Section>
  );
}
