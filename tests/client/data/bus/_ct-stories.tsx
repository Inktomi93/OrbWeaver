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

import { QueryBoundary } from "@orb/client/components";
import { useChatBus, useChatBusDeps, useInvalidation, useOrbSocket, useRpgBus, useTRPC, useUserBus } from "@orb/client/data";
import type { RpgBusEvent } from "@orb/contracts/rpg";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { ChatId } from "@orb/kit/ids";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { CtDataProviders } from "../../../support/browser/ct-data-providers.tsx";
import { CtToastSurface } from "../../lib/_ct-stories.tsx";

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

/** A REMOUNT of the room consumer, on demand — the double lifecycle edge in the shape a CT can drive. Bumping
 *  the key unmounts and re-mounts the probe in ONE commit, so the registry sees leave-then-join back to back:
 *  exactly what React's StrictMode does to every effect on a dev boot (`main.tsx`), what a Suspense retry does
 *  on chat open, and what used to cost the user room a detach + a second attach on the wire.
 *
 *  `tag.listTags` + its refetch button are the BARRIER an absence assertion needs: counts only climb, so a
 *  round trip issued AFTER the remount is what proves the remount's own traffic (if any) has already landed. */
function RemountableRoomProbe(): ReactElement {
  const trpc = useTRPC();
  const tags = useQuery(trpc.tag.listTags.queryOptions());
  const [generation, setGeneration] = useState(0);
  return (
    <>
      <button type="button" data-testid="remount-room" onClick={(): void => setGeneration((prev) => prev + 1)}>
        remount
      </button>
      <button type="button" data-testid="probe-barrier" onClick={(): void => void tags.refetch()}>
        barrier
      </button>
      <output data-testid="room-generation">{String(generation)}</output>
      <UserBusProbe key={generation} />
    </>
  );
}

/** The always-on user room, REMOUNTABLE — the double-edge story (see {@link RemountableRoomProbe}). */
export function UserBusRemountStory(): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <RemountableRoomProbe />
      </SocketHost>
    </CtDataProviders>
  );
}

// ── R1-2: the chat room's ATTACH CURSOR FLOOR. A room whose SSE dies before this client has applied any
//    durable frame used to re-announce with `sinceSeq: null`, which requests no replay — so anything the
//    server committed while the socket was dark stayed invisible until a reload. The floor comes off the
//    server's `chatOpened` synthetic, so the probe needs nothing but the real hook over the real socket:
//    the assertion is on the WIRE (`attachRequests()`), not on rendered state.
function ChatBusAttachFloorProbe({ chatId }: { readonly chatId: ChatId }): ReactElement {
  useChatBus(chatId, useChatBusDeps());
  return <output data-testid="chat-bus-mounted">{chatId}</output>;
}

/** The chat room joined for real, so its re-announce carries whatever cursor the hook decided on. */
export function ChatBusAttachFloorStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <ChatBusAttachFloorProbe chatId={chatId} />
      </SocketHost>
    </CtDataProviders>
  );
}

/** BOTH rooms under ONE socket PLUS the real toast surface — the #222 story. A socket-level fault is ONE
 *  thing that happened, so the pixels it produces are the assertion: two joined rooms must not each repeat
 *  it. `CtToastSurface` owns the single `bindNotify` (its header — a second manager would race on import
 *  order), so this story reuses it rather than minting one here. */
export function SocketFaultToastStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtDataProviders>
      <CtToastSurface>
        <SocketHost>
          <UserBusProbe />
          <RpgBusProbe chatId={chatId} />
        </SocketHost>
      </CtToastSurface>
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
