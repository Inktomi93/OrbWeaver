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

import type { StreamFrame } from "@orb/contracts/stream";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useEffect } from "react";
import { notify } from "#lib";
import { useTRPC, useTRPCClient } from "../trpc";
import { roomRegistry } from "./room-registry";
import { socketId } from "./socket-id";

/** One arriving envelope payload: a frame, or the typed terminal frame `withSubscriptionErrors` yields for a
 *  genuine SOCKET-level fault (a per-ROOM fault is a `roomFailed` control frame and never gets here). */
type SocketPayload = StreamFrame | { readonly __subscriptionError: true; readonly code: string; readonly message: string };

function routeFrame(payload: SocketPayload): void {
  if ("__subscriptionError" in payload) {
    // The whole socket is over. Every room loses freshness, so every room's consumer hears it; the
    // reconnect's gap-heal closes the data gap when the client re-subscribes.
    roomRegistry.failed(payload.message);
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
    // The socket shed this room's tail. For a live-only room that IS the gap-heal edge; for a durable room
    // the heal refetches, and the server's cursor still points at the last delivered row.
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
          // `pending` = the socket is live; fires on the first connect AND every reconnect. The registry
          // re-announces its rooms and fans the gap-heal out to each one.
          if (connection.state === "pending") {
            roomRegistry.socketLive();
          }
        },
        onError: (error) => {
          notify.error(error.message);
        },
      },
    ),
  );
}
