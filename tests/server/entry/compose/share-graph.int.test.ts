// @subject packages/server/src/entry/compose/services.ts
// @subject packages/server/src/domain/share/verbs/start.ts
// @subject packages/server/src/infra/relay/execution.ts
// @subject packages/server/src/infra/relay/binary.ts
// @subject packages/server/src/infra/relay/quick-tunnel.ts
// @subject packages/server/src/domain/share/relay/controller.ts
import "@orb/testkit/node/composed-real.ts";
import { stat } from "node:fs/promises";
import process from "node:process";
import { authConfigSchema } from "@orb/contracts/auth-config";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { requestWithHost } from "@orb/testkit/node/host-request.ts";
import { lanAddress } from "@orb/testkit/node/lan-address.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { claimShareOwner, readRelayStarts, relayExecutable, relayProgram } from "@orb/testkit/node/share.ts";

const RELAY_URL = "https://calm-river-four-birds.trycloudflare.com";

test("the server root runs the pinned native relay and shares its live host with HTTP", async () => {
  const { bytes, pin } = relayProgram(RELAY_URL);
  let downloads = 0;
  const options = {
    authConfig: { ...authConfigFromEnv(), mode: "local" as const },
    share: { relay: { pin } },
    networkExecution: {
      resolver: () => Promise.resolve(["93.184.215.14"]),
      fetch: (): Promise<Response> => {
        downloads += 1;
        return Promise.resolve(new Response(bytes));
      },
    },
  };
  await using harness = await createServerHarness(options);
  const address = await harness.listen();
  const origin = `http://127.0.0.1:${address.port}`;
  await expect(harness.services.share.startAtBoot()).resolves.toMatchObject({ kind: "refused", refusal: { code: "share_owner_unclaimed" } });
  await expect(readRelayStarts(relayExecutable(harness, pin))).rejects.toMatchObject({ code: "ENOENT" });
  await claimShareOwner(harness);
  const caller = await harness.internalCallerFor(harness.ownerId);
  await caller.share.start();
  await expect.poll(async () => (await caller.share.status()).relay).toEqual({ state: "up", relay: "quick", url: RELAY_URL });
  const admitted = await requestWithHost(origin, "/api/auth/config", { host: new URL(RELAY_URL).hostname, headers: { "x-forwarded-for": "203.0.113.9" } });
  expect(admitted.status).toBe(200);
  expect(authConfigSchema.parse(JSON.parse(admitted.body))).toMatchObject({
    discreetLogin: true,
    defaultHandle: null,
    multiHumanCapable: true,
    share: { state: "up", url: null },
  });
  await caller.share.stop();
  const refused = await requestWithHost(origin, "/api/auth/config", { host: new URL(RELAY_URL).hostname });
  expect(refused.status).toBe(421);
  await caller.share.start();
  await expect.poll(async () => (await readRelayStarts(relayExecutable(harness, pin))).length).toBe(2);
  expect((await readRelayStarts(relayExecutable(harness, pin)))[0]?.args).toEqual(["tunnel", "--url", origin, "--no-autoupdate"]);
  expect(downloads).toBe(1);
});

test("a bad pinned download restores real seating overrides and never reaches native spawn", async () => {
  const { bytes, pin } = relayProgram(RELAY_URL);
  const corrupt = new Uint8Array(bytes);
  corrupt[0] = 0;
  await using harness = await createServerHarness({
    authConfig: { ...authConfigFromEnv(), mode: "local" },
    share: { relay: { pin } },
    networkExecution: { resolver: () => Promise.resolve(["93.184.215.14"]), fetch: () => Promise.resolve(new Response(corrupt)) },
  });
  await claimShareOwner(harness);
  const caller = await harness.internalCallerFor(harness.ownerId);
  const principal = await harness.principalFor(harness.ownerId);
  await harness.services.settings.updateAppSettings({ principal, partial: { localMultiUser: false, discreetLogin: null } });
  const before = await harness.services.settings.getAppSettingsWithOverrides({ principal });
  await expect(caller.share.start()).rejects.toMatchObject({ cause: { code: "relay_binary_checksum_mismatch" } });
  expect((await harness.services.settings.getAppSettingsWithOverrides({ principal })).overrides).toEqual(before.overrides);
  await expect(readRelayStarts(relayExecutable(harness, pin))).rejects.toMatchObject({ code: "ENOENT" });
});

test("native child release is joined after immediate host invalidation, including a child that ignores SIGINT", { tags: "slow" }, async () => {
  const { bytes, pin } = relayProgram(RELAY_URL, true);
  await using harness = await createServerHarness({
    authConfig: { ...authConfigFromEnv(), mode: "local" },
    share: { relay: { pin } },
    networkExecution: { resolver: () => Promise.resolve(["93.184.215.14"]), fetch: () => Promise.resolve(new Response(bytes)) },
  });
  await claimShareOwner(harness);
  const caller = await harness.internalCallerFor(harness.ownerId);
  await caller.share.start();
  const executable = relayExecutable(harness, pin);
  await expect.poll(async () => (await caller.share.status()).relay.state).toBe("up");
  const pid = (await readRelayStarts(executable))[0]?.pid;
  if (pid === undefined) {
    throw new Error("the native relay did not record its pid");
  }
  let disposed = false;
  const disposing = harness[Symbol.asyncDispose]().then(() => {
    disposed = true;
  });
  await expect
    .poll(() =>
      stat(`${executable}.stopping`).then(
        () => true,
        () => false,
      ),
    )
    .toBe(true);
  expect(disposed).toBe(false);
  expect(process.kill(pid, 0)).toBe(true);
  await stat(harness.modelCacheDir);
  await disposing;
  expect(() => process.kill(pid, 0)).toThrow();
  await expect(stat(harness.modelCacheDir)).rejects.toMatchObject({ code: "ENOENT" });
});

test("unscripted roots refuse relay and ACME before raw network execution and preserve owner-only authority", async () => {
  let outbound = 0;
  await using harness = await createServerHarness({
    authConfig: { ...authConfigFromEnv(), mode: "local" },
    bindHost: "0.0.0.0",
    allowPublicBind: true,
    networkExecution: {
      resolver: () => {
        outbound += 1;
        return Promise.resolve(["93.184.215.14"]);
      },
    },
  });
  const cookie = await claimShareOwner(harness);
  const caller = await harness.internalCallerFor(harness.ownerId);
  await expect(caller.share.start()).rejects.toMatchObject({ message: expect.stringContaining("unscripted") });
  const { port } = await harness.listen();
  const refused = await fetch(`http://127.0.0.1:${port}/api/trpc/share.start`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: "{}",
  });
  expect(refused.status).toBe(403);
  await refused.arrayBuffer();
  for (const role of ["admin", "user"] as const) {
    const actor = await harness.actor({ role });
    const foreign = await harness.internalCallerFor(actor.id);
    await expect(foreign.share.start()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(foreign.share.status()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(foreign.share.enableIpCertificate({ address: "81.2.69.160", httpsPort: 8443, challengePort: 8080 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  }
  const claimed = await fetch(`http://127.0.0.1:${port}/api/auth/first-run`, {
    method: "POST",
    headers: { [CSRF_HEADER]: "1", "x-forwarded-for": "127.0.0.1" },
    body: new URLSearchParams({ password: "forged-owner-password" }),
  });
  expect(claimed.status).toBe(403);
  await claimed.arrayBuffer();
  await caller.share.enableIpCertificate({ address: "81.2.69.160", httpsPort: 8443, challengePort: 8080 });
  await expect.poll(async () => (await caller.share.status()).certificate.state).toBe("failed");
  expect(outbound).toBe(0);
});

test("a held raw download keeps owned storage until physical execution acknowledges cancellation", async () => {
  const program = relayProgram(RELAY_URL);
  const reached = Promise.withResolvers<AbortSignal>();
  const release = Promise.withResolvers<Response>();
  await using harness = await createServerHarness({
    authConfig: { ...authConfigFromEnv(), mode: "local" },
    share: { relay: { pin: program.pin } },
    networkExecution: {
      resolver: () => Promise.resolve(["93.184.215.14"]),
      fetch: (_input, init) => {
        const signal = init?.signal;
        if (signal === undefined || signal === null) {
          throw new Error("native pinned download omitted cancellation");
        }
        reached.resolve(signal);
        return release.promise;
      },
    },
  });
  await claimShareOwner(harness);
  const caller = await harness.internalCallerFor(harness.ownerId);
  const starting = expect(caller.share.start()).rejects.toBeDefined();
  const signal = await reached.promise;
  const aborted = Promise.withResolvers<void>();
  signal.addEventListener("abort", () => aborted.resolve(), { once: true });
  let disposed = false;
  const disposing = harness[Symbol.asyncDispose]().then(() => {
    disposed = true;
  });
  try {
    await aborted.promise;
    expect(disposed).toBe(false);
    await stat(harness.modelCacheDir);
  } finally {
    release.resolve(new Response(program.bytes));
    await Promise.all([disposing, starting]);
  }
  await expect(stat(harness.modelCacheDir)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readRelayStarts(relayExecutable(harness, program.pin))).rejects.toMatchObject({ code: "ENOENT" });
});

test("a named native interface shares through its real loopback companion and disposal joins both listeners", async () => {
  const program = relayProgram(RELAY_URL);
  const host = lanAddress();
  await using harness = await createServerHarness({
    authConfig: { ...authConfigFromEnv(), mode: "local" },
    bindHost: host,
    allowPublicBind: true,
    share: { relay: { pin: program.pin } },
    networkExecution: { resolver: () => Promise.resolve(["93.184.215.14"]), fetch: () => Promise.resolve(new Response(program.bytes)) },
  });
  const address = await harness.listen();
  expect(address.address).toBe(host);
  await claimShareOwner(harness);
  const caller = await harness.internalCallerFor(harness.ownerId);
  await caller.share.start();
  await expect.poll(async () => (await caller.share.status()).relay.state).toBe("up");
  const loopback = `http://127.0.0.1:${address.port}`;
  expect((await readRelayStarts(relayExecutable(harness, program.pin)))[0]?.args).toEqual(["tunnel", "--url", loopback, "--no-autoupdate"]);
  const primary = await fetch(`http://${host}:${address.port}/healthz`);
  expect(primary.status).toBe(200);
  await primary.arrayBuffer();
  expect((await requestWithHost(loopback, "/api/auth/config", { host: new URL(RELAY_URL).hostname })).status).toBe(200);
  await harness[Symbol.asyncDispose]();
  await expect(fetch(`http://${host}:${address.port}/healthz`)).rejects.toThrow();
  await expect(fetch(`${loopback}/healthz`)).rejects.toThrow();
});
