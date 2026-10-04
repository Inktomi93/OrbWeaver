// The viewer's embedder rebuild for one vector target, read where it shows: the role row's line and a paused search.
// Search's own per-target paused state decides whether there is a rebuild at all; the job rows say running or failed.

import type { RoutableTask } from "@orb/contracts/inference";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { Trpc } from "#data";
import { EMBEDDER_REBUILD_KINDS, embedderRebuildState } from "#lib";

/** How often the reads re-run while a rebuild runs; the run reports progress at about this pace. */
const REBUILD_POLL_MS = 5000;

/** The viewer's rebuild of `task`'s target: `null` when that target is not moving (or `enabled` is off). */
export function useEmbedderRebuild(trpc: Trpc, enabled: boolean, task: RoutableTask): ReturnType<typeof embedderRebuildState> {
  const viewer = useQuery({ ...trpc.sessions.me.queryOptions(), enabled });
  // Re-read while paused, so the line clears on promotion.
  const space = useQuery({
    ...trpc.search.spaceStatus.queryOptions(),
    enabled,
    refetchInterval: (query) => (query.state.data?.paused === true ? REBUILD_POLL_MS : false),
  });
  // One read per rebuild kind, each polling while it holds an active rebuild, so the line holds until the last scope lands.
  const rows = useQueries({
    queries: EMBEDDER_REBUILD_KINDS.map((kind) => ({
      ...trpc.workloads.list.queryOptions({ kind }),
      enabled,
      refetchInterval: (query: { readonly state: { readonly data?: Parameters<typeof embedderRebuildState>[0] | undefined } }): number | false =>
        embedderRebuildState(query.state.data ?? [], viewer.data?.userId ?? null, { paused: true }) === "running" ? REBUILD_POLL_MS : false,
    })),
  });
  return enabled
    ? embedderRebuildState(
        rows.flatMap((query) => query.data ?? []),
        viewer.data?.userId ?? null,
        space.data === undefined ? undefined : { paused: task === "imageEmbed" ? space.data.imageEmbed : space.data.embed },
      )
    : null;
}
