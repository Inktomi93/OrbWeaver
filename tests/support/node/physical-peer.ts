// A loopback HTTP peer standing in for an external service on a dynamically allocated port.
import type { NativeHttpBindings } from "@orb/server/infra/network";
import { drainHttpServer, serveHttpServer } from "@orb/server/infra/network";
import { systemTimers } from "@orb/server/infra/timers";
import { createTestLogger } from "./test-logger.ts";

export type PhysicalPeerFetch = (request: Request, bindings: NativeHttpBindings) => Promise<Response>;

export interface PhysicalPeer extends AsyncDisposable {
  /** `http://127.0.0.1:<port>`, the socket the peer bound. */
  readonly origin: string;
}

/** Serve `fetch` on loopback through the production HTTP server; disposal drains open responses and is idempotent. */
export async function servePhysicalPeer(fetch: PhysicalPeerFetch): Promise<PhysicalPeer> {
  const listening = Promise.withResolvers<string>();
  const server = serveHttpServer({ hostname: "127.0.0.1", port: 0, fetch }, (address) => listening.resolve(`http://127.0.0.1:${address.port}`));
  server.once("error", listening.reject);
  let disposal: Promise<void> | undefined;
  // The real deadline, chosen: a peer serves live provider streams, and the forced close is its only bound.
  const dispose = (): Promise<void> => {
    disposal ??= drainHttpServer(server, createTestLogger(), systemTimers.timeout);
    return disposal;
  };
  try {
    return { origin: await listening.promise, [Symbol.asyncDispose]: dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
