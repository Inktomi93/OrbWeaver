// `useOrbSocket` — THE socket (SSE-1 §6). Mounted ONCE at the authed composition root
// (`routes/app-root.tsx`), beside the bus hooks it now carries. Every live room in the tab — the per-user
// entity bus, a game's rpg bus, and (as they fold) chat/notifications/automation — rides this one
// EventSource, so adding the NEXT always-on stream costs zero browser connections.
//
// Two jobs, no third:
//   • bind the room registry's mutation channel (`stream.attach` / `stream.detach` ride the BATCHED HTTP
//     link — zero connections, and they inherit the CSRF header + rate limit every mutation gets);
//   • route arriving frames. Control frames drive lifecycle/degradation; data frames go to the registry,
//     which fans them to that room's subscribers.
//
// It never reads a domain event (the byte-blind rule is a client property too — `applyChatBusEvent` and the
// invalidation maps stay the ONLY translators) and never writes a store (gate `bus-onData-no-store-write`).
//
// The one thing it DOES read off a fault is the tRPC error CODE, and only to answer "is the session dead?"
// A warm tab under D54's pins issues no reads, so the QueryCache belt has nothing to fire on — this
// socket is the only place a revoked/expired session announces itself, and it used to end at a toast.

import type { StreamFrame } from "@orb/contracts/stream";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useEffect } from "react";
import { notify } from "#lib";
import { recoverIfUnauthorizedCode } from "../stale-session.ts";
import { useTRPC, useTRPCClient } from "../trpc.ts";
import { roomRegistry } from "./room-registry.ts";
import { socketId } from "./socket-id.ts";

/** One arriving envelope payload: a frame, or the typed terminal frame `withSubscriptionErrors` yields for a
 *  genuine SOCKET-level fault (a per-ROOM fault is a `roomFailed` control frame and never gets here). */
type SocketPayload = StreamFrame | { readonly __subscriptionError: true; readonly code: string; readonly message: string };

function routeFrame(payload: SocketPayload): void {
  if ("__subscriptionError" in payload) {
    // The whole socket is over. Every room loses freshness, so every room's consumer hears it; the
    // reconnect's gap-heal closes the data gap when the client re-subscribes.
    roomRegistry.failed(payload.message);
    // W1 — and if the reason was the SESSION, this frame is the only signal a warm tab will ever get: with
    // `staleTime: Infinity` it issues no reads, so the QueryCache belt has nothing to fire on. Route the
    // code into the recovery ladder; every other code keeps its room-failure handling and nothing else.
    recoverIfUnauthorizedCode(payload.code);
    return;
  }
  if (payload.channel !== "control") {
    roomRegistry.deliver(payload);
    return;
  }
  if (payload.type === "roomFailed") {
    roomRegistry.failed(payload.message, payload.ref);
    return;
  }
  if (payload.type === "roomLagged") {
    // The socket shed this room's tail. The DELIVERY gap is already being healed server-side (the shed
    // restarts that room's pump from its last-DELIVERED cursor, so a durable room's replay refills exactly
    // what was dropped); this edge only fans the room's own gap-heal, which is what a LIVE-ONLY room needs
    // to refresh reads it has no replay for.
    roomRegistry.lagged(payload.ref);
  }
  // `attached` / `detached` are acks — the registry already holds the desired state; nothing to do but let
  // an instrument (the CT recorder / the e2e tap) observe the lifecycle on the wire.
}

/** Attach the ONE multiplexed socket for this tab. Call once, at the authed composition root. */
export function useOrbSocket(): void {
  const trpc = useTRPC();
  const client = useTRPCClient();

  useEffect(() => {
    roomRegistry.bindTransport({
      attach: async (ref, sinceSeq) => {
        await client.stream.attach.mutate({ socketId: socketId(), ref, sinceSeq });
      },
      detach: async (ref) => {
        await client.stream.detach.mutate({ socketId: socketId(), ref });
      },
    });
    return (): void => {
      roomRegistry.bindTransport(null);
    };
  }, [client]);

  useSubscription(
    trpc.stream.connect.subscriptionOptions(
      { socketId: socketId() },
      {
        onData: (envelope) => {
          routeFrame(envelope.data);
        },
        onConnectionStateChange: (connection) => {
          // `pending` = the socket is live. There is exactly ONE `pending` per successful connection (a drop
          // goes `pending → connecting/error → pending`), so this counts CONNECTIONS, not renders. The
          // registry re-announces its rooms and fans the gap-heal to the ones that had already been live —
          // never on a first live edge (BOOT-4X; the gate is in `room-registry.ts`).
          if (connection.state === "pending") {
            roomRegistry.socketLive();
            return;
          }
          roomRegistry.socketDown();
        },
        onError: (error) => {
          // `stream.connect` is an `authedProcedure`, so a dead cookie refuses the CONNECT REQUEST — the
          // principal is never minted and the generator never runs, which is why this arm (not the terminal
          // frame above) is where an expired/revoked session actually surfaces. Recovery replaces the toast:
          // a "UNAUTHORIZED" notice the user can do nothing about is worse than the re-auth prompt.
          if (recoverIfUnauthorizedCode(error.data?.code)) {
            return;
          }
          notify.error(error.message);
        },
      },
    ),
  );
}
