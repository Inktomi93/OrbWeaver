// `bus/_ct-stories.tsx` — the story module for the bus transport adapters (Spine-Testing §7: CT only
// mounts from a non-test module). Its `.ct.tsx` siblings mount ONLY these exports.
//
// The stories mount the REAL socket + the REAL room hooks over the REAL tRPC client — routeOrbSocket stubs
// only the NETWORK, so what runs is the production path: EventSource → httpSubscriptionLink → useOrbSocket →
// the room registry → useRpgBus/useUserBus → the invalidation callbacks (or, in the gap-heal story, the LIVE
// invalidation seam → real wire refetches).
//
// `SocketHost` mirrors `routes/app-root.tsx`: the socket is mounted ONCE, above every room hook. That
// placement is the thing under test in the two-room story — N rooms, one connect — and it is why the
// gap-heal probe wraps in it too: since SSE-1 the user bus has no subscription of its own, it JOINS a room
// on the tab's one socket, so the socket has to exist for the bus to be live at all.

import { QueryBoundary, useInvalidation, useOrbSocket, useRpgBus, useTRPC, useUserBus } from "@orb/client/data";
import type { RpgBusEvent } from "@orb/contracts/rpg";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { ChatId } from "@orb/kit/ids";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";

/** The app-root shape: ONE socket, above every room hook. */
function SocketHost({ children }: { readonly children: ReactNode }): ReactElement {
  useOrbSocket();
  return <>{children}</>;
}

// ── The probes: render what they RECEIVED so a CT asserts delivery without reaching into module state
//    (the `OnlineStatusProbeStory` posture). ───────────────────────────────────────────────────────────

function RpgBusProbe({ chatId }: { readonly chatId: ChatId | null }): ReactElement {
  const [seen, setSeen] = useState<string[]>([]);
  const [heals, setHeals] = useState(0);
  useRpgBus(chatId, {
    invalidateRpg: (event: RpgBusEvent): void => {
      setSeen((prev) => [...prev, event.type]);
    },
    gapHealRpg: (): void => {
      setHeals((prev) => prev + 1);
    },
  });
  return (
    <>
      <output data-testid="rpg-events">{seen.join(",")}</output>
      <output data-testid="rpg-heals">{String(heals)}</output>
    </>
  );
}

function UserBusProbe(): ReactElement {
  const [seen, setSeen] = useState<string[]>([]);
  const [heals, setHeals] = useState(0);
  useUserBus({
    invalidateUser: (event: UserBusEvent): void => {
      setSeen((prev) => [...prev, event.type]);
    },
    invalidateAllUserRoots: (): void => {
      setHeals((prev) => prev + 1);
    },
  });
  return (
    <>
      <output data-testid="user-events">{seen.join(",")}</output>
      <output data-testid="user-heals">{String(heals)}</output>
    </>
  );
}

/** The rpg room's ATTACH GATE under test: a null chatId (landing), a chat whose `getChat.rpg` is null (a
 *  non-game room), and a DISENGAGED game must all attach NOTHING. */
export function RpgBusStory({ chatId }: { readonly chatId: ChatId | null }): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <RpgBusProbe chatId={chatId} />
      </SocketHost>
    </CtDataProviders>
  );
}

/** The always-on user room — the one room that attaches unconditionally. */
export function UserBusStory(): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <UserBusProbe />
      </SocketHost>
    </CtDataProviders>
  );
}

/** BOTH rooms under ONE socket — the multiplex claim: two rooms, one connect. */
export function TwoRoomStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <UserBusProbe />
        <RpgBusProbe chatId={chatId} />
      </SocketHost>
    </CtDataProviders>
  );
}

// ── BOOT-4X: the gap-heal cadence, driven through the LIVE invalidation seam (not a counting callback), so
//    a heal is a REAL wire refetch and its absence is a real absence. ──────────────────────────────────
//
// Two MOUNTED user roots, both covered by the gap-heal set (`allUserRootFilters`) so either would
// refetch if the heal ran, and both driven by DISTINCT user-bus events so a scripted frame can move one
// without the other:
//   • `persona.list`  — the ASSERTION key (`personasChanged` only).
//   • `tag.listTags`  — the BARRIER key (`tagsChanged`). Its refetch proves the socket was live AND its
//                       `onEvent` ran, which is strictly after the `pending` connection-state transition —
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
      <SocketHost>
        <QueryBoundary fallback={<p>loading…</p>} renderError={(e): ReactElement => <p>{String(e)}</p>}>
          <UserBusGapHealProbe />
        </QueryBoundary>
      </SocketHost>
    </CtDataProviders>
  );
}
