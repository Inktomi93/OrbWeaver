// data/bus CT fixtures — the room registry's transport mutations, shared across this directory's CT files
// so every `routeTrpc` call feeds them (#649 batch 1).
//
// `stream.attach` / `stream.detach` ride the BATCHED HTTP link, not the SSE leg (`use-orb-socket.ts:7,139`
// states this plainly — only `stream.connect` is the subscription). Every CT in this directory drives the
// room registry through `useOrbSocket`, so every mount fires at least one real `attach` mutation; left
// unfed it rode `routeTrpc`'s lenient null instead of a served response.
import type { TrpcRoutes } from "../../../support/node/route-trpc.ts";

export const STREAM_MUTATION_ROUTES: TrpcRoutes<"stream.attach" | "stream.detach"> = {
  // `useOrbSocket.bindTransport.attach` discards this mutation's result (`await client.stream.attach.mutate(…)`,
  // packages/client/src/data/bus/use-orb-socket.ts:139) — so feeding `null` changes no assertion in this
  // directory's files; it only stops the mutation riding the unstubbed-null fulfil.
  "stream.attach": null,
  // Same posture as attach — `useOrbSocket.bindTransport.detach` also discards its result (:142).
  "stream.detach": null,
};
