// @orb/contracts/stream — the ONE multiplexed SSE transport vocabulary (SSE-1, docs/history/design/sse-multiplex-spec.md
// §3). A browser tab holds ONE `stream.connect` EventSource; every live room it cares about (the per-user
// entity bus, a chat's message bus, a game's rpg bus, …) rides that one socket as typed FRAMES, attached and
// detached through two ordinary batched mutations. Cross-boundary wire shape ⇒ it homes here, not in
// `transport/` (AGENTS.md "Type homes and unions").
//
// THE NESTING RULE (§3.2) — three vocabularies, zero collisions, zero rename tax. The frame union does NOT
// flatten the per-bus event unions: the OUTER discriminant is `channel`, and each arm carries its bus event
// VERBATIM under `event`, retaining that event's own `type`. `ChatBusEvent["type"]`, `UserBusEvent["type"]`
// and `RpgBusEvent["type"]` are therefore never members of one union, so a future collision (rpg minting a
// `chatOpened`) is impossible by construction and every client reducer keeps its exact current input type
// (`applyChatBusEvent(event: ChatBusEvent, …)` is untouched by the fold).
//
// `control` is a FRAME channel, NOT a ROOM channel: `StreamChannel` derives from `StreamRoomRef`, so `control`
// can never be attached and a `Record<StreamChannel, …>` map (the server's `ROOM_SOURCES` / overflow-policy
// tables) is total over ROOMS only.
//
// THE TRACKED ID IS AN ORDINAL, NEVER A CURSOR (§3.3). One SSE stream has one resume id; this socket carries
// N independent cursors, which no single id can express — so `Last-Event-ID` on `stream.connect` is IGNORED
// by the server and the resume truth is the per-room cursor held in the socket cell. A durable cursor travels
// INSIDE the frame (`seq` on the `chat` / `notifications` arms) because the bus events themselves do not
// carry it. A composite-cursor string (`c:<chatId>=<seq>;n=<seq>`) was considered and REJECTED: unbounded
// growth with the room set, and it would put resume policy in a string parser instead of in the room source
// that owns the verdict.
//
// SCOPE / TRUST: `socketId` is CLIENT-MINTED per tab and is NOT a capability — the server's registry cell is
// owned by the minting principal and a foreign `socketId` collapses to a leak-free NOT_FOUND (never a hijack,
// never a FORBIDDEN that confirms existence). No frame ever carries it, and no domain ever sees it.

import type { ChatId, SocketId, WorkloadId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import type { AutomationBusEvent } from "#automation";
import type { ChatBusEvent } from "#chat";
import type { InboxView } from "#notifications";
import type { RpgBusEvent } from "#rpg";
import type { UserBusEvent } from "#user-bus";
import type { WorkloadEvent } from "#workloads";

/** A room the client may attach to. `user`/`notifications` are self-scoped (the channel key IS the caller's
 *  principal — no input can widen them); the three chat-scoped rooms carry the `chatId` they address, and
 *  `workloads` carries the ONE run it tails (owner-scoped at attach, inside the room's own gate). */
export const streamRoomRefSchema = z.discriminatedUnion("channel", [
  z.object({ channel: z.literal("user") }),
  z.object({ channel: z.literal("notifications") }),
  z.object({ channel: z.literal("chat"), chatId: typeIdSchema(ID_PREFIX.chat) }),
  z.object({ channel: z.literal("rpg"), chatId: typeIdSchema(ID_PREFIX.chat) }),
  z.object({ channel: z.literal("automation"), chatId: typeIdSchema(ID_PREFIX.chat) }),
  z.object({ channel: z.literal("workloads"), workloadId: typeIdSchema(ID_PREFIX.workload) }),
]);
export type StreamRoomRef = z.infer<typeof streamRoomRefSchema>;

/** The ROOM channels — derived from the ref union, so `control` (a frame-only channel) can never appear. */
export type StreamChannel = StreamRoomRef["channel"];

/** The room-channel belt. Deliberately NOT named `*_EVENT_TYPES`: it is not an event union, and that suffix
 *  would drag it into the `bus-definition-belts` gate's producer/consumer belt demand. */
export const STREAM_CHANNELS = ["user", "notifications", "chat", "rpg", "automation", "workloads"] as const satisfies readonly StreamChannel[];

/** The ONE routing key — the server registry's map key AND the client handler-registry key. Accepts a ROOM
 *  REF or a DATA FRAME: both carry the same routing fields, and a delivered frame has to resolve to the same
 *  key its subscriber attached under, so the projection must not exist twice. Total: a new chat-scoped
 *  channel falls into the `chatId` arm (and fails `tsc` if it carries no `chatId`), a new self-scoped or
 *  otherwise-scoped channel must be named here. */
export function roomKey(addressed: StreamRoomRef | StreamDataFrame): string {
  if (addressed.channel === "user" || addressed.channel === "notifications") {
    return addressed.channel;
  }
  if (addressed.channel === "workloads") {
    return `${addressed.channel}:${addressed.workloadId}`;
  }
  return `${addressed.channel}:${addressed.chatId}`;
}

/** A DATA frame — one room's bus event, nested verbatim under `event`. The `seq` on `chat`/`notifications`
 *  is that room's DURABLE cursor (the resume truth the socket cell stores); the live-only rooms carry none. */
export type StreamDataFrame =
  | { readonly channel: "user"; readonly event: UserBusEvent }
  | { readonly channel: "notifications"; readonly seq: number; readonly event: InboxView }
  | { readonly channel: "chat"; readonly chatId: ChatId; readonly seq: number; readonly event: ChatBusEvent }
  | { readonly channel: "rpg"; readonly chatId: ChatId; readonly event: RpgBusEvent }
  | { readonly channel: "automation"; readonly chatId: ChatId; readonly event: AutomationBusEvent }
  | { readonly channel: "workloads"; readonly workloadId: WorkloadId; readonly event: WorkloadEvent };

/** The data frame a given channel delivers — the client room hook's `onEvent` payload type. */
export type StreamFrameFor<C extends StreamChannel> = Extract<StreamDataFrame, { readonly channel: C }>;

/** The tRPC error codes a `roomFailed` frame can carry. Closed vocabulary because `@orb/contracts` may not
 *  depend on `@trpc/server` (the cake): these are exactly the codes the transport's ONE domain-error
 *  classifier can produce (`transport/trpc/error-mapping.ts`), plus the INTERNAL_SERVER_ERROR a non-domain
 *  throw collapses to. The server narrows onto this tuple in one place — never a widened passthrough. */
export const STREAM_ERROR_CODES = [
  "BAD_REQUEST",
  "CONFLICT",
  "FORBIDDEN",
  "INTERNAL_SERVER_ERROR",
  "NOT_FOUND",
  "PRECONDITION_FAILED",
  "SERVICE_UNAVAILABLE",
  "TOO_MANY_REQUESTS",
] as const;
export type StreamErrorCode = (typeof STREAM_ERROR_CODES)[number];

/** The socket's own out-of-band vocabulary — lifecycle acks + the two per-room degradations. `roomLagged`
 *  and `roomFailed` are why the multiplex is strictly better than N sockets: one room's backpressure or
 *  fault is a frame, not a teardown of every other room sharing the connection. */
export type StreamControlFrame = { readonly channel: "control" } & (
  | { readonly type: "attached"; readonly ref: StreamRoomRef }
  | { readonly type: "detached"; readonly ref: StreamRoomRef }
  /** The socket queue overflowed for this room; `cursor` is the last durable seq it delivered (`null` for a
   *  live-only room). The room stays attached — the client heals from `cursor` / a blanket invalidate. */
  | { readonly type: "roomLagged"; readonly ref: StreamRoomRef; readonly cursor: number | null }
  /** This room's pump threw. The room is DETACHED server-side; the socket and every other room survive. */
  | { readonly type: "roomFailed"; readonly ref: StreamRoomRef; readonly code: StreamErrorCode; readonly message: string }
);

/** Everything that can ride the socket. */
export type StreamFrame = StreamDataFrame | StreamControlFrame;

/** `stream.connect` — the ONE EventSource. `socketId` is minted per tab by the client. */
export const streamConnectInputSchema = z.object({ socketId: brandedId<SocketId>() });
export type StreamConnectInput = z.output<typeof streamConnectInputSchema>;

/** `stream.attach` — rides the batched HTTP link (zero connections, inherits the CSRF header + rate limit).
 *  Returns `void`: delivery NEVER rides a mutation return, so a replay can never interleave ahead of live
 *  frames already queued. `sinceSeq` is a replay REQUEST for a durable room (`0` = from the beginning);
 *  `null`/omitted = live-only from now. */
export const streamAttachInputSchema = z.object({
  socketId: brandedId<SocketId>(),
  ref: streamRoomRefSchema,
  sinceSeq: z.number().int().min(0).nullish(),
});
export type StreamAttachInput = z.output<typeof streamAttachInputSchema>;

/** `stream.detach` — drop one room. Idempotent (detaching an unattached room is a no-op). */
export const streamDetachInputSchema = z.object({
  socketId: brandedId<SocketId>(),
  ref: streamRoomRefSchema,
});
export type StreamDetachInput = z.output<typeof streamDetachInputSchema>;
