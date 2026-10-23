// The public bootstrap routes over the request principal the seam resolved from a real credential.
// @subject packages/server/src/entry/http/auth-meta.ts
import process from "node:process";
import { authConfigSchema } from "@orb/contracts/auth-config";
import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { claimShareOwner, createServerHarness, readRelayStarts, relayExecutable, relayProgram } from "@orb/testkit/node/composed";
import { describe } from "vitest";
import { signedInMember } from "../_auth-roots.ts";

const RELAY_URL = "https://calm-river-four-birds.trycloudflare.com";

type Root = Pick<ServerTestHarness, "http">;

async function authConfig(root: Root, headers: Record<string, string> = {}): Promise<ReturnType<typeof authConfigSchema.parse>> {
  const response = await root.http.request("/api/auth/config", { headers });
  expect(response.status).toBe(200);
  return authConfigSchema.parse(await response.json());
}

function localRoot(options: Parameters<typeof createServerHarness>[0] = {}): Promise<ServerTestHarness> {
  return createServerHarness({ ...options, authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny" } });
}

describe("GET /api/auth/config", () => {
  test("serves the injected single-user mode and complete deployment flags without checkout defaults", async () => {
    const maxImageBytes = 5_000_000;
    const defaultHandle = castId<Handle>("bootstrap-owner");
    await using root = await createServerHarness({
      physicalPeer: () => "127.0.0.1",
      authConfig: { ...authConfigFromEnv(), mode: "single-user", fallback: "deny", defaultHandle },
    });
    await root.services.settings.updateAppSettings({
      principal: await root.principalFor(root.ownerId),
      partial: {
        discreetLogin: false,
        localMultiUser: true,
        forbidExternalMedia: true,
        trustHtml: false,
        allowInteractiveCards: true,
        maxImageBytes,
        maxDatabankBytes: DEFAULT_UPLOAD_CAPS.databankUpload,
      },
    });
    expect(await authConfig(root)).toEqual({
      mode: "single-user",
      localEnabled: false,
      oidcEnabled: false,
      oidcProviderName: "Harness identity provider",
      localFirstRun: false,
      discreetLogin: false,
      defaultHandle,
      multiHumanCapable: false,
      forbidExternalMedia: true,
      trustHtml: false,
      allowInteractiveCards: true,
      share: { state: "off", url: null },
      uploads: { ...DEFAULT_UPLOAD_CAPS, image: maxImageBytes },
      transport: "http",
      clientScope: "loopback",
    });
    const join = await root.http.request("/join/some-token");
    expect(join.status).toBe(404);
    expect(join.headers.get("location")).toBeNull();
  });

  test("multiHumanCapable is the INJECTED per-request derivation (a runtime LOCAL_MULTI_USER flip takes effect immediately)", async () => {
    await using root = await localRoot();
    const owner = await root.principalFor(root.ownerId);
    await root.services.settings.updateAppSettings({ principal: owner, partial: { localMultiUser: false } });
    expect((await authConfig(root)).multiHumanCapable).toBe(false);
    const refused = await root.http.request("/join/some-token");
    expect(refused.status).toBe(404);
    expect(refused.headers.get("location")).toBeNull();
    await root.services.settings.updateAppSettings({ principal: owner, partial: { localMultiUser: true } });
    expect((await authConfig(root)).multiHumanCapable).toBe(true);
    const admitted = await root.http.request("/join/some-token");
    expect(admitted.status).toBe(302);
    expect(admitted.headers.get("location")).toBe("/?join=some-token");
  });
});

describe("GET /api/auth/me", () => {
  test("projects the middleware-resolved principal", async () => {
    await using root = await localRoot();
    const { cookie } = await signedInMember(root, castId<Handle>("alice"));
    const response = await root.http.request("/api/auth/me", { headers: { cookie } });
    expect(await response.json()).toEqual({ authenticated: true, handle: "alice", role: "user" });
  });
});

// The share relay's state goes to anyone; its link only to a signed-in caller who may hand it on through an invite.
describe("GET /api/auth/config share fields", () => {
  test("an up relay's link goes to a signed-in caller and never to an anonymous one", async () => {
    const { bytes, pin } = relayProgram(RELAY_URL);
    await using root = await localRoot({
      share: { relay: { pin } },
      networkExecution: { resolver: () => Promise.resolve(["93.184.215.14"]), fetch: () => Promise.resolve(new Response(bytes)) },
    });
    const cookie = await claimShareOwner(root);
    const caller = await root.internalCallerFor(root.ownerId);
    await caller.share.start();
    await expect.poll(async () => (await caller.share.status()).relay.state).toBe("up");
    expect((await authConfig(root)).share).toEqual({ state: "up", url: null });
    expect((await authConfig(root, { cookie })).share).toEqual({ state: "up", url: RELAY_URL });
    await caller.share.stop();
  });

  test("a relay that is not up serves no link, even to a signed-in caller", async () => {
    const { bytes, pin } = relayProgram(RELAY_URL);
    await using root = await localRoot({
      share: { relay: { pin } },
      networkExecution: { resolver: () => Promise.resolve(["93.184.215.14"]), fetch: () => Promise.resolve(new Response(bytes)) },
    });
    const cookie = await claimShareOwner(root);
    expect((await authConfig(root, { cookie })).share).toEqual({ state: "off", url: null });
    const caller = await root.internalCallerFor(root.ownerId);
    await caller.share.start();
    await expect.poll(async () => (await caller.share.status()).relay.state).toBe("up");
    const pid = (await readRelayStarts(relayExecutable(root, pin)))[0]?.pid;
    if (pid === undefined) {
      throw new Error("the native relay did not record its pid");
    }
    // The relay process dies under the box: the supervisor reports it down while it restarts.
    process.kill(pid, "SIGKILL");
    await expect.poll(async () => (await caller.share.status()).relay.state).not.toBe("up");
    const down = await authConfig(root, { cookie });
    expect(down.share.url).toBeNull();
    expect(down.share.state).not.toBe("up");
    await caller.share.stop();
  });
});
