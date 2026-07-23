// The per-request PINNED dispatcher is the DNS-rebind close (D61 §2 step 3): its connector lookup hands
// back ONLY the pre-validated addresses (the name never re-resolves between check and connect) and is
// SINGLE-USE (a second connect errors). Every other suite stubs global fetch, which ignores init.dispatcher
// — so the pin is never exercised there. This drives the REAL pinned agent (via the __pinnedAgentForTest
// seam) against a loopback listener: an UNRESOLVABLE fake host still connects (proving addresses-only), and
// a second origin on the same agent is refused (proving single-use). Offline — only the loopback socket.

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { __pinnedAgentForTest } from "@orb/server/infra/network";
import { afterAll, beforeAll, describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

// A host that can NEVER resolve via real DNS (.invalid, RFC 6761) — so a successful connect proves the
// pinned lookup supplied the address, not the resolver.
const FAKE_HOST_A = "pinned-fake-a.invalid";
const FAKE_HOST_B = "pinned-fake-b.invalid";

describe("safeFetch pinned dispatcher (addresses-only lookup + single-use)", () => {
  let port = 0;
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("PINNED_OK");
  });

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr: string | AddressInfo | null = server.address();
    if (addr === null || typeof addr === "string") {
      throw new Error("listener did not bind an ephemeral TCP port");
    }
    port = addr.port;
  });
  afterAll(() => {
    server.close();
  });

  test("connects an UNRESOLVABLE host via the pinned 127.0.0.1, then refuses a second connect (single-use)", async () => {
    const agent = __pinnedAgentForTest(["127.0.0.1"]);
    // Node global fetch reads init.dispatcher (undici); the test package can't import undici, so set it
    // structurally (no cast).
    const initA: RequestInit = {};
    Reflect.set(initA, "dispatcher", agent);
    const res = await fetch(`http://${FAKE_HOST_A}:${port}/x`, initA);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("PINNED_OK"); // reached the loopback listener via the pinned address

    // A second origin on the SAME agent forces a fresh connect → the single-use lookup errors.
    const initB: RequestInit = {};
    Reflect.set(initB, "dispatcher", agent);
    await expect(fetch(`http://${FAKE_HOST_B}:${port}/y`, initB)).rejects.toThrow();
    await agent.destroy();
  });
});
