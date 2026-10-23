// @subject packages/server/src/entry/http/healthz.ts
import { HEALTH_STATUSES, healthResponseSchema } from "@orb/contracts/diagnostics";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

test.each([
  { peer: "127.0.0.1", headers: new Headers(), identity: true, label: "direct operator" },
  { peer: "127.0.0.1", headers: new Headers({ "x-forwarded-for": "127.0.0.1" }), identity: false, label: "loopback relay" },
  { peer: "93.184.215.14", headers: new Headers({ "x-forwarded-for": "127.0.0.1" }), identity: false, label: "forged forwarded loopback" },
  { peer: undefined, headers: new Headers({ host: "localhost" }), identity: false, label: "missing physical peer with local host" },
])("actual health wire preserves operator-only identity for $label", async ({ peer, headers, identity }) => {
  await using harness = await createServerHarness({ physicalPeer: () => peer });
  const response = await harness.http.request("/healthz", { headers });
  expect(response.status).toBe(200);
  const body = healthResponseSchema.parse(await response.json());
  expect(body.status).toBe(HEALTH_STATUSES[0]);
  expect("harness" in body && body.harness).toBe(false);
  expect(body.version !== undefined).toBe(identity);
  expect(Object.keys(body).sort()).toEqual(identity ? ["harness", "status", "version"] : ["harness", "status"]);
});
