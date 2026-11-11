// The connector's own refusal, reached past the earlier resolve check: a name that answers public when the request is
// pinned and private when the connector dials, and a redirect hop to a name that answers private. Each is refused at
// connect, writes exactly one security record naming the host and the address, and carries no secret from the
// request into the log or the resolved address into the thrown message. Only DNS and the remote socket are scripted.
// @subject packages/server/src/infra/network/egress.ts
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { EgressBlockedError, isRecordedEgressBlock, systemFetch } from "@orb/server/infra/network";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, servePhysicalPeer } from "@orb/testkit/node/composed";
import { z } from "zod";

const LOOPBACK = "127.0.0.1";
const REBIND_HOST = "rebind.test";
const FIRST_HOP_HOST = "first-hop.test";
const LANDING_HOST = "landing.test";
const SECRET = "query-and-header-secret";
const LOG_SCAN_LIMIT = 2000;
const SECURITY_EVENT = "egress_blocked";

const securityRecordSchema = z.looseObject({ security: z.literal(true), event: z.literal(SECURITY_EVENT), hostname: z.string(), address: z.string() });

/** Every host answers its script in order and then keeps its last answer, so a later lookup sees the rebound address. */
function scriptedResolver(script: ReadonlyMap<string, readonly string[]>): (host: string) => Promise<readonly string[]> {
  const asked = new Map<string, number>();
  return (host) => {
    const answers = script.get(host) ?? [];
    const turn = asked.get(host) ?? 0;
    asked.set(host, turn + 1);
    const answer = answers[Math.min(turn, answers.length - 1)];
    return Promise.resolve(answer === undefined ? [] : [answer]);
  };
}

/** A multi-user root (its private-endpoint floor is empty) whose physical fetch and connector are the platform's. */
function multiUserRoot(script: ReadonlyMap<string, readonly string[]>): Promise<ServerTestHarness> {
  return createServerHarness({
    logLevel: "warn",
    env: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "deny" },
    networkExecution: { fetch: systemFetch, resolver: scriptedResolver(script) },
  });
}

function securityRecords(root: ServerTestHarness): z.infer<typeof securityRecordSchema>[] {
  return root.observability
    .logLines(LOG_SCAN_LIMIT)
    .map((line) => securityRecordSchema.safeParse(JSON.parse(line)))
    .flatMap((parsed) => (parsed.success ? [parsed.data] : []));
}

/** The connector's refusal the platform fetch carries as its cause, or a failure that names what arrived instead. */
async function refusal(request: Promise<Response>): Promise<EgressBlockedError> {
  const outcome = await request.then(
    async (response) => {
      await response.arrayBuffer();
      return new Error(`answered ${String(response.status)}`);
    },
    (rejection: unknown) => rejection,
  );
  expect(isRecordedEgressBlock(outcome)).toBe(true);
  const cause = outcome instanceof Error ? outcome.cause : outcome;
  return cause instanceof EgressBlockedError ? cause : expect.fail(`not a connector refusal: ${String(cause)}`);
}

test("a name that rebinds from public at the pin to private at connect is refused at the connector with one security record", async () => {
  const received: string[] = [];
  await using peer = await servePhysicalPeer((request) => {
    received.push(new URL(request.url).pathname);
    return Promise.resolve(new Response("reached"));
  });
  await using root = await multiUserRoot(new Map([[REBIND_HOST, [PUBLIC_PEER_ADDRESS, LOOPBACK]]]));
  const port = new URL(peer.origin).port;
  const before = securityRecords(root).length;

  const refused = await refusal(
    root.app.egress.configuredEndpointFetch(`http://${REBIND_HOST}:${port}/v1/models?api_key=${SECRET}`, { headers: { authorization: `Bearer ${SECRET}` } }),
  );

  expect(refused.reason).toBe("private-address");
  expect(refused.message).not.toContain(LOOPBACK);
  expect(securityRecords(root).slice(before)).toEqual([expect.objectContaining({ hostname: REBIND_HOST, address: LOOPBACK })]);
  expect(root.observability.logLines(LOG_SCAN_LIMIT).filter((line) => line.includes(SECRET))).toEqual([]);
  expect(received).toEqual([]);
});

test("a redirect from an admitted endpoint to a name that resolves private is refused at the connector with one security record", async () => {
  const received: string[] = [];
  await using landing = await servePhysicalPeer((request) => {
    received.push(`landing ${new URL(request.url).pathname}`);
    return Promise.resolve(new Response("reached"));
  });
  const landingPort = new URL(landing.origin).port;
  await using firstHop = await servePhysicalPeer((request) => {
    received.push(`first ${new URL(request.url).pathname}`);
    return Promise.resolve(Response.redirect(`http://${LANDING_HOST}:${landingPort}/landed?api_key=${SECRET}`, 302));
  });
  const firstPort = new URL(firstHop.origin).port;
  await using root = await multiUserRoot(
    new Map([
      [FIRST_HOP_HOST, [LOOPBACK]],
      [LANDING_HOST, [LOOPBACK]],
    ]),
  );
  await root.services.settings.updateAppSettings({
    principal: await root.principalFor(root.ownerId),
    partial: { privateEndpointAllowlist: [`${FIRST_HOP_HOST}:${firstPort}`] },
  });
  const before = securityRecords(root).length;

  const refused = await refusal(root.app.egress.configuredEndpointFetch(`http://${FIRST_HOP_HOST}:${firstPort}/start`));

  expect(refused.reason).toBe("private-address");
  expect(refused.message).not.toContain(LOOPBACK);
  expect(securityRecords(root).slice(before)).toEqual([expect.objectContaining({ hostname: LANDING_HOST, address: LOOPBACK })]);
  expect(root.observability.logLines(LOG_SCAN_LIMIT).filter((line) => line.includes(SECRET))).toEqual([]);
  // The admitted first hop is the positive control: the same connector dialled it.
  expect(received).toEqual(["first /start"]);
});
