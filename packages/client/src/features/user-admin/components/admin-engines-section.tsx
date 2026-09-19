// The Engines section body (Settings → Admin → Engines; PD-3) — the model-serving monitor + restart. TWO
// tiers arrive on the one read: the supervised vLLM engines, and the in-process local-light model slots
// (`local-light:embed`, …) whose rows report the boot warm-up download and whose Restart re-attempts it.
// Its OWN plain `useQuery` (not the pane's suspense batch): engine status is a live ops read with no
// bus event, so it polls — fast (5s) while any engine is transitioning (a restart/warmup is watchable),
// backed off (30s) once everything is steady (the neo ServerEnginesCard cadence; the supervisor probes
// on its own loop regardless). Restart is confirm-free (it's recoverable — the supervisor respawns) but
// per-engine disabled while ITS restart is in flight; the supervisor's human status line renders after.

import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, QueryInlineStates, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { testId, timeLib } from "#lib";
import { configAnchorId } from "#state";
import { useRestartEngine } from "../hooks/use-admin-mutations.ts";
import { ADMIN_ENGINES_SUBCATEGORY } from "../lib/admin-engines-nav.ts";
import { engineBadgeIntent, restartEngineName } from "../lib/admin-model.ts";
import { EngineLaunchConfig } from "./engine-launch-config.tsx";

const POLL_ACTIVE_MS = 5000;
const POLL_STEADY_MS = 30_000;
// Steady = settled, no restart/warmup in flight → the slow poll. sleeping/sleeping-held are steady (a
// healthy engine deliberately idle, weights on CPU) — not a transient the fast poll should chase. `ready` is
// the local-light tier's settled arm; its `queued`/`downloading` deliberately are NOT, so a multi-GB model
// fetch animates on the 5s cadence instead of updating twice a minute.
const STEADY_STATUSES = new Set(["adopted", "owned", "sleeping", "sleeping-held", "ready"]);

/** The engine status list + per-engine restart. */
export function AdminEnginesSection(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const engines = useQuery({
    ...trpc.admin.vllmEngines.queryOptions(),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data === undefined) {
        return POLL_ACTIVE_MS;
      }
      const anyInFlight = Object.values(data).some((r) => !STEADY_STATUSES.has(r.status));
      return anyInFlight ? POLL_ACTIVE_MS : POLL_STEADY_MS;
    },
  });
  const restart = useRestartEngine({ trpc, invalidation });

  const entries = Object.entries(engines.data ?? {});

  return (
    <Section className="@container" divider={true} heading={ADMIN_ENGINES_SUBCATEGORY.label} id={configAnchorId("admin", ADMIN_ENGINES_SUBCATEGORY.id)}>
      <Stack gap="row" data-testid={testId("adminEnginesSection")}>
        <QueryInlineStates
          status={engines}
          isEmpty={entries.length === 0}
          pending="Loading engine status…"
          error="Couldn't load the engine status — administrators only."
          empty="No engine status yet — the supervisor reports after its first probe."
        />

        <Stack gap="field">
          {entries.map(([engine, record]) => (
            <ListRow
              key={engine}
              title={engine}
              // The lifecycle line plus the env-only DEPLOYMENT facts (port + store path), read-only — the
              // #14 ruling: these are displayed, never edited. The subtitle truncates within its column and
              // its native title= surfaces the full (often long) store path on hover.
              // `port 0` is the IN-PROCESS local-light tier — nothing listens, so the port segment is dropped
              // rather than rendered as a port that does not exist; its store path (the weights cache) stays.
              subtitle={`${record.detail === "" ? record.status : record.detail} · updated ${timeLib.formatRelative(record.updatedAt)}${record.port === 0 ? "" : ` · port ${record.port}`} · ${record.storePath}`}
              actions={
                <Row align="center" gap="row">
                  <Badge intent={engineBadgeIntent(record.status)}>{record.status}</Badge>
                  <Button
                    intent="ghost"
                    size="sm"
                    disabled={restart.isPending && restart.pendingVariables?.engine === engine}
                    aria-label={restartEngineName(engine)}
                    onClick={(): void => restart.mutate({ engine })}
                  >
                    Restart
                  </Button>
                </Row>
              }
            />
          ))}
        </Stack>

        {restart.error === null ? null : (
          <Text voice="label" className="text-destructive">
            Couldn't restart the engine — check the server logs.
          </Text>
        )}

        {/* The launch editor SUSPENDS on getAppSettings (the retired pane surface's one boundary used to
            cover it, and blocked the whole pane on it). Its own boundary now: the engine STATUS list — the
            live ops read an admin opens this section for — paints without waiting on the config read. */}
        {/* RESERVED (#1098) — the launch editor settles into a full argv form under the live status list,
            so its read landing pushed the rest of the admin pane down. */}
        <QueryBoundary
          fallback={<SkeletonRows count={4} />}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="the engine launch config" onRetry={retry} />}
          reserveKey="config.admin.engineLaunch"
        >
          <EngineLaunchConfig />
        </QueryBoundary>
      </Stack>
    </Section>
  );
}
