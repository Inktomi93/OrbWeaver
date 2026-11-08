// FORWARD_AUTH_TRUSTED_PROXIES is a comma list of ranges the unsigned forward-header path matches the TCP peer against:
// every listed range admits, an unlisted peer is refused, and a list with no range in it refuses every peer as unset.
// @subject packages/server/src/infra/auth/config.ts
// @subject packages/server/src/infra/auth/modes/forward-header.ts

import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, authMeSchema, FORWARD_AUTH_TRUSTED_PROXIES_KEY } from "@orb/contracts/identity";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { z } from "zod";

const LISTED_PEERS = ["192.0.2.7", "10.1.2.3"] as const;
const UNLISTED_PEER = "203.0.113.9";
const LOOPBACK_PEER = "127.0.0.1";
const MEMBER = "proxied-member";
const ANONYMOUS = { authenticated: false, handle: null, role: null };
// The two refusal lines this path logs; they have no export to read, and these cases pin which one fires.
const NO_TRUSTED_PROXIES = "forwarded_no_trusted_proxies";
const PEER_REJECTED = "forwarded_peer_rejected";
const logLineSchema = z.object({ event: z.string().optional() });

/** A deny-fallback forward-header root whose TCP peer the case moves between requests. */
async function proxyRoot(trustedProxies: string | undefined, peer: { current: string }): Promise<ServerTestHarness> {
  return await createServerHarness({
    env: {
      [AUTH_MODE_KEY]: "forward-header",
      [AUTH_FALLBACK_KEY]: "deny",
      ...(trustedProxies === undefined ? {} : { [FORWARD_AUTH_TRUSTED_PROXIES_KEY]: trustedProxies }),
    },
    logLevel: "debug",
    physicalPeer: () => peer.current,
  });
}

async function me(root: ServerTestHarness): Promise<ReturnType<typeof authMeSchema.parse>> {
  return authMeSchema.parse(await (await root.http.request("/api/auth/me", { headers: { "remote-user": MEMBER } })).json());
}

function forwardedRefusals(root: ServerTestHarness): readonly (string | undefined)[] {
  return root.rings.logs
    .recent()
    .map((line) => logLineSchema.parse(JSON.parse(line)).event)
    .filter((event) => event === NO_TRUSTED_PROXIES || event === PEER_REJECTED);
}

test("every range in a spaced comma list admits its peer, and an unlisted peer is refused as untrusted", async () => {
  const peer: { current: string } = { current: LISTED_PEERS[0] };
  await using root = await proxyRoot("192.0.2.0/24, 10.0.0.0/8", peer);
  const answers: Record<string, unknown> = {};
  for (const address of [...LISTED_PEERS, UNLISTED_PEER]) {
    peer.current = address;
    answers[address] = await me(root);
  }

  expect(answers).toEqual({
    [LISTED_PEERS[0]]: { authenticated: true, handle: MEMBER, role: "user" },
    [LISTED_PEERS[1]]: { authenticated: true, handle: MEMBER, role: "user" },
    [UNLISTED_PEER]: ANONYMOUS,
  });
  expect(forwardedRefusals(root)).toEqual([PEER_REJECTED]);
});

test.for([
  { name: "unset", trustedProxies: undefined },
  { name: "only separators and blanks", trustedProxies: " , ," },
])("a trusted-proxy list that is $name refuses even a loopback peer, logged as unset", async ({ trustedProxies }) => {
  await using root = await proxyRoot(trustedProxies, { current: LOOPBACK_PEER });

  expect(await me(root)).toEqual(ANONYMOUS);
  expect(forwardedRefusals(root)).toEqual([NO_TRUSTED_PROXIES]);
});
