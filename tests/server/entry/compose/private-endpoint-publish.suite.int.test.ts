// The private-endpoint allowlist reaches the egress guard on save, over the REAL composition root (settings verb ⋈
// compose wiring ⋈ `infra/network/egress.ts`). Owner ruling on docs/work/0325: nothing may require a restart to
// reach a model. Both guard inputs are read after each save: the write-time admission a connection draft passes
// (`connection.draftCatalogModels`) and the connect-time firewall the dial itself passes (`fetch` through the
// installed global dispatcher). A non-owner save must widen neither.

// COMPOSED-REAL: the server graph loads in the untimed IMPORT phase, never inside the first test's timeout (#2386 — support/composed-real.ts).
import "../../../support/composed-real.ts";
import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import { installEgressFirewall, publishPrivateEndpointAllowlist } from "@orb/server/infra/network";
import type { Dispatcher } from "undici";
import { getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { afterAll, beforeAll, describe } from "vitest";
import type { AppCaller } from "../../../support/fixtures.ts";
import { expect, test } from "../../../support/fixtures.ts";

const ENDPOINT_PROVIDER = "custom-openai";
// A normal high port with nothing listening: an admitted dial fails ECONNREFUSED, which is the evidence that
// the connect was attempted rather than refused by the firewall. Not in fetch's "bad port" set.
const ADMITTED_PORT = 9998;
const NEIGHBOUR_PORT = 9997;
const TARGET_BASE_URL = `http://127.0.0.1:${String(ADMITTED_PORT)}/v1`;
const TARGET_DIAL = `http://127.0.0.1:${String(ADMITTED_PORT)}/v1/models`;
const NEIGHBOUR_DIAL = `http://127.0.0.1:${String(NEIGHBOUR_PORT)}/v1/models`;
/** What an admitted draft answers under the fixture's refusing provider transport: the dial was made. */
const DIALED = { listed: false, reason: "endpoint models: transport failure" };

// undici wraps a connect rejection as "fetch failed"; the firewall's signal is on the cause chain.
function errorChainText(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; depth < 6 && cur !== null && cur !== undefined; depth++) {
    parts.push(cur instanceof Error ? `${cur.name}: ${cur.message}` : String(cur));
    cur = cur instanceof Error ? (cur as { cause?: unknown }).cause : undefined;
  }
  return parts.join(" <- ");
}

async function dialVerdict(url: string): Promise<"BLOCKED" | "attempted"> {
  const err: unknown = await fetch(url).then(
    () => null,
    (e: unknown) => e,
  );
  return errorChainText(err).includes("SSRF_BLOCKED") ? "BLOCKED" : "attempted";
}

/** The owner's draft of an endpoint connection to the target: resolves when admitted, refuses otherwise. */
function draftTarget(caller: AppCaller): Promise<unknown> {
  return caller.connection.draftCatalogModels({ providerId: ENDPOINT_PROVIDER, baseUrl: TARGET_BASE_URL });
}

const REFUSED = { cause: { code: CONNECTION_OP_CODES.baseUrlRefused } };

describe("the private-endpoint allowlist is enforced on the request after a save, with no restart", () => {
  const original: Dispatcher = getGlobalDispatcher();
  beforeAll(() => {
    installEgressFirewall();
  });
  afterAll(() => {
    setGlobalDispatcher(original);
    publishPrivateEndpointAllowlist([]);
  });

  test("an owner's save admits the host, and a removal refuses it again", async ({ ownerCaller }) => {
    // Positive control: the suite's single-user floor admits loopback at boot, so the target is reachable
    // before any save. Without this, the refusal below could be a guard that never admits anything.
    await expect(draftTarget(ownerCaller)).resolves.toEqual(DIALED);
    expect(await dialVerdict(TARGET_DIAL)).toBe("attempted");

    await ownerCaller.settings.updateAppSettings({ partial: { privateEndpointAllowlist: [] } });
    await expect(draftTarget(ownerCaller)).rejects.toMatchObject(REFUSED);
    expect(await dialVerdict(TARGET_DIAL)).toBe("BLOCKED");

    await ownerCaller.settings.updateAppSettings({ partial: { privateEndpointAllowlist: [`127.0.0.1:${String(ADMITTED_PORT)}`] } });
    await expect(draftTarget(ownerCaller)).resolves.toEqual(DIALED);
    expect(await dialVerdict(TARGET_DIAL)).toBe("attempted");
    // The guard holds the saved set, not the floor: the port-scoped entry leaves the next port refused.
    expect(await dialVerdict(NEIGHBOUR_DIAL)).toBe("BLOCKED");

    await ownerCaller.settings.updateAppSettings({ partial: { privateEndpointAllowlist: [] } });
    await expect(draftTarget(ownerCaller)).rejects.toMatchObject(REFUSED);
    expect(await dialVerdict(TARGET_DIAL)).toBe("BLOCKED");
  });

  test("a delegated admin or a member cannot admit a host through the verb, and the guard stays closed", async ({ ownerCaller, adminCaller, otherCaller }) => {
    await ownerCaller.settings.updateAppSettings({ partial: { privateEndpointAllowlist: [] } });
    const admit = { partial: { privateEndpointAllowlist: [`127.0.0.1:${String(ADMITTED_PORT)}`] } };

    await expect(adminCaller.settings.updateAppSettings(admit)).toThrowTRPCError("FORBIDDEN");
    await expect(otherCaller.settings.updateAppSettings(admit)).toThrowTRPCError("FORBIDDEN");
    // A delegated admin's save of a field it may write still reloads and republishes: that must carry the
    // owner's stored set, never widen it.
    await adminCaller.settings.updateAppSettings({ partial: { promptCacheMinDepth: 1 } });

    await expect(draftTarget(ownerCaller)).rejects.toMatchObject(REFUSED);
    await expect(draftTarget(otherCaller)).rejects.toMatchObject(REFUSED);
    expect(await dialVerdict(TARGET_DIAL)).toBe("BLOCKED");
  });
});
