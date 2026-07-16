// The Engines section body (Settings → Admin → Engines; PD-3) — the vLLM engine monitor + restart.
// Its OWN plain `useQuery` (not the pane's suspense batch): engine status is a live ops read with no
// bus event, so it polls — fast (5s) while any engine is transitioning (a restart/warmup is watchable),
// backed off (30s) once everything is steady (the neo ServerEnginesCard cadence; the supervisor probes
// on its own loop regardless). Restart is confirm-free (it's recoverable — the supervisor respawns) but
// per-engine disabled while ITS restart is in flight; the supervisor's human status line renders after.

import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import { testId, timeLib } from "#lib";
import { useRestartEngine } from "../hooks/use-admin-mutations";
import { engineBadgeIntent } from "../lib/admin-model";

const POLL_ACTIVE_MS = 5000;
const POLL_STEADY_MS = 30_000;
const STEADY_STATUSES = new Set(["adopted", "owned"]);

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
    <Stack gap="row" data-testid={testId("adminEnginesSection")}>
      {engines.isPending ? <Text tone="muted">Loading engine status…</Text> : null}
      {engines.isError ? <Text tone="destructive">Couldn't load the engine status — administrators only.</Text> : null}
      {engines.isSuccess && entries.length === 0 ? <Text tone="muted">No engine status yet — the supervisor reports after its first probe.</Text> : null}

      <Stack gap="field">
        {entries.map(([engine, record]) => (
          <ListRow
            key={engine}
            title={engine}
            subtitle={`${record.detail === "" ? record.status : record.detail} · updated ${timeLib.formatRelative(record.updatedAt)}`}
            actions={
              <Row align="center" gap="row">
                <Badge intent={engineBadgeIntent(record.status)}>{record.status}</Badge>
                <Button
                  intent="ghost"
                  size="sm"
                  disabled={restart.isPending && restart.pendingVariables?.engine === engine}
                  aria-label={`Restart engine — ${engine}`}
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
        <Text size="label" tone="destructive">
          Couldn't restart the engine — check the server logs.
        </Text>
      )}
    </Stack>
  );
}
