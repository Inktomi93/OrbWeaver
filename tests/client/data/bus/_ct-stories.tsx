// `bus/_ct-stories.tsx` — the story module for the bus transport adapters (Spine-Testing §7: CT only
// mounts from a non-test module). Its `.ct.tsx` siblings mount ONLY these exports.

import { QueryBoundary, useInvalidation, useTRPC, useUserBus } from "@orb/client/data";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";

// Two MOUNTED user roots, both covered by the gap-heal set (`allUserRootFilters`) so either would
// refetch if the heal ran, and both driven by DISTINCT user-bus events so a scripted frame can move one
// without the other:
//   • `persona.list`  — the ASSERTION key (`personasChanged` only).
//   • `tag.listTags`  — the BARRIER key (`tagsChanged`). Its refetch proves the stream was live AND its
//                       `onData` ran, which is strictly after `onConnectionStateChange("pending")` —
//                       the round-trip barrier an absence assertion needs (counts only climb, so a bare
//                       `poll(...).toBe(1)` would go green on the way to a wrong 2).
// The reads are ACTIVE (an observer is subscribed), so an invalidate is a real wire refetch, not a mark.
function UserBusGapHealProbe(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const personas = useSuspenseQuery(trpc.persona.list.queryOptions());
  const tags = useSuspenseQuery(trpc.tag.listTags.queryOptions());
  useUserBus({
    invalidateUser: invalidation.invalidateUser,
    invalidateAllUserRoots: invalidation.invalidateAllUserRoots,
  });
  return <p data-testid="user-bus-state">{`personas=${personas.data.length} tags=${tags.data.length}`}</p>;
}

export function UserBusGapHealStory(): ReactElement {
  return (
    <CtDataProviders>
      <QueryBoundary fallback={<p>loading…</p>} renderError={(e): ReactElement => <p>{String(e)}</p>}>
        <UserBusGapHealProbe />
      </QueryBoundary>
    </CtDataProviders>
  );
}
