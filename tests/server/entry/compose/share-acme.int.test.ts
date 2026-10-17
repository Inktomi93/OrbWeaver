// @subject packages/server/src/entry/compose/share.ts
// @subject packages/server/src/infra/acme/execution.ts
// @subject packages/server/src/infra/acme/order-worker.ts
// @subject packages/server/src/infra/acme/issuer.ts
// @subject packages/server/src/infra/acme/http-01.ts
// @subject packages/server/src/infra/acme/store.ts
// @subject packages/server/src/infra/network/tls-terminator.ts
// @subject packages/server/src/domain/share/certificate/controller.ts
// @subject packages/server/src/domain/share/certificate/transitions.ts
import "@orb/testkit/node/composed-real.ts";
import { X509Certificate } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IpCertificateSetting } from "@orb/contracts/identity";
import { authMeSchema, CSRF_HEADER, ipCertificateSettingSchema } from "@orb/contracts/identity";
import { closeDb } from "@orb/db";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { IP_CERTIFICATE_FILE_NAMES } from "@orb/server/foundation/data-layout";
import { createFrozenClock, FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import { createControlledTimers } from "@orb/testkit/iso/timers.ts";
import { freshDb } from "@orb/testkit/node/db.ts";
import type { FakeAcme } from "@orb/testkit/node/fake-acme.ts";
import { startFakeAcme } from "@orb/testkit/node/fake-acme.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { freeLoopbackPort } from "@orb/testkit/node/free-port.ts";
import type { ServerHarnessOptions, ServerTestHarness } from "@orb/testkit/node/server.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { claimShareOwner, SHARE_OWNER_PASSWORD } from "@orb/testkit/node/share.ts";
import type { TlsAnswer } from "@orb/testkit/node/tls-hop.ts";
import { tlsRequest } from "@orb/testkit/node/tls-hop.ts";
import { GENERAL_NAME_IP_TAG, ipBytes, readCsr } from "@orb/testkit/node/x509.ts";

const ADDRESS = "81.2.69.160";
const TOKEN = "native_root_http01_token";
const NOT_AFTER = FROZEN_AT_MS + 1000 * 160 * 3_600_000;

interface AcmeSubject extends AsyncDisposable {
  readonly harness: ServerTestHarness;
  readonly caller: Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
  readonly authority: FakeAcme;
  readonly held: ReturnType<FakeAcme["hold"]> | undefined;
  readonly setting: IpCertificateSetting;
  readonly cookie: string;
}

async function setup(holdPath?: string, options: ServerHarnessOptions = {}): Promise<AcmeSubject> {
  await using owners = new AsyncDisposableStack();
  const challengePort = await freeLoopbackPort();
  const authority = await startFakeAcme({ challengePort, token: TOKEN, notBefore: FROZEN_AT_MS, notAfter: NOT_AFTER });
  owners.defer(authority.close);
  const held = holdPath === undefined ? undefined : authority.hold(holdPath);
  const harness = owners.use(
    await createServerHarness({
      authConfig: { ...authConfigFromEnv(), mode: "local" },
      bindHost: "0.0.0.0",
      allowPublicBind: true,
      share: { acme: { directoryUrl: authority.directoryUrl, polling: { attempts: 2, minMs: 1, maxMs: 2 } } },
      ...options,
    }),
  );
  const cookie = await claimShareOwner(harness);
  const caller = await harness.internalCallerFor(harness.ownerId);
  const setting = ipCertificateSettingSchema.parse({ address: ADDRESS, challengePort, httpsPort: await freeLoopbackPort() });
  const lifetime = owners.move();
  return { harness, caller, authority, held, setting, cookie, [Symbol.asyncDispose]: (): Promise<void> => lifetime.disposeAsync() };
}

function tlsConfig(port: number, certificate: string): Promise<TlsAnswer> {
  return tlsRequest({
    host: "127.0.0.1",
    port,
    path: "/api/auth/config",
    ca: certificate,
    allowPartialTrustChain: true,
    identityAddress: ADDRESS,
    headers: { host: ADDRESS, "x-forwarded-for": "10.0.0.1", "x-forwarded-proto": "http" },
  });
}

test("the real root obtains an IP certificate through native ACME, stores private bytes and serves verified TLS", async () => {
  await using subject = await setup();
  const { harness, caller, authority, setting } = subject;
  await expect(caller.share.enableIpCertificate(setting)).resolves.toMatchObject({ certificate: { state: "obtaining" } });
  await expect.poll(async () => (await caller.share.status()).certificate.state).toBe("active");
  expect(authority.requests.find((entry) => entry.path === "/new-order")?.payload).toEqual({
    identifiers: [{ type: "ip", value: ADDRESS }],
    profile: "shortlived",
  });
  const csr = authority.csrs[0];
  if (csr === undefined) {
    throw new Error("native finalize did not send a CSR");
  }
  expect(readCsr(csr).sanNames).toEqual([{ tag: GENERAL_NAME_IP_TAG, bytes: ipBytes(ADDRESS) }]);
  expect(authority.fetches).toMatchObject([{ status: 200, body: expect.stringContaining(`${TOKEN}.`) }]);
  const certificate = await readFile(join(harness.secretsDir, IP_CERTIFICATE_FILE_NAMES.certificate), "utf8");
  const key = await readFile(join(harness.secretsDir, IP_CERTIFICATE_FILE_NAMES.certificateKey), "utf8");
  expect(new X509Certificate(certificate).checkIP(ADDRESS)).toBe(ADDRESS);
  for (const filename of Object.values(IP_CERTIFICATE_FILE_NAMES)) {
    expect((await stat(join(harness.secretsDir, filename))).mode % 0o1000).toBe(0o600);
  }
  const response = await tlsConfig(setting.httpsPort, certificate);
  expect(response.status).toBe(200);
  expect(JSON.parse(response.body)).toMatchObject({ transport: "https", localFirstRun: false });
  const client = { host: "127.0.0.1", port: setting.httpsPort, ca: certificate, allowPartialTrustChain: true, identityAddress: ADDRESS };
  const insecure = await tlsRequest({ ...client, path: "/api/auth/me", headers: { host: ADDRESS, cookie: subject.cookie } });
  expect(authMeSchema.parse(JSON.parse(insecure.body)).authenticated).toBe(false);
  const owner = await harness.app.sessions.loadUserById(harness.ownerId);
  if (owner === null) {
    throw new Error("native certificate root owner disappeared");
  }
  const login = await tlsRequest({
    ...client,
    path: "/api/auth/login",
    method: "POST",
    headers: { host: ADDRESS, [CSRF_HEADER]: "1", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ handle: owner.handle, password: SHARE_OWNER_PASSWORD }).toString(),
  });
  expect(login.status).toBe(200);
  expect(login.cookie).not.toBe(subject.cookie);
  const secure = await tlsRequest({ ...client, path: "/api/auth/me", headers: { host: ADDRESS, cookie: login.cookie } });
  expect(authMeSchema.parse(JSON.parse(secure.body))).toMatchObject({ authenticated: true, handle: owner.handle, role: "owner" });
  const wire = JSON.stringify(await caller.share.status());
  expect(wire).not.toContain(key);
  expect(wire).not.toContain(certificate);
  await expect(fetch(`http://127.0.0.1:${setting.challengePort}/.well-known/acme-challenge/${TOKEN}`)).rejects.toThrow();
  await caller.share.disableIpCertificate();
  await expect(stat(join(harness.secretsDir, IP_CERTIFICATE_FILE_NAMES.certificate))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(stat(join(harness.secretsDir, IP_CERTIFICATE_FILE_NAMES.accountKey))).resolves.toBeDefined();
  await expect(tlsConfig(setting.httpsPort, certificate)).rejects.toThrow();
});

test("overlapping owner certificate enables keep the acknowledged persisted choice and native TLS aligned", async () => {
  await using subject = await setup();
  const b = subject.setting;
  const a = ipCertificateSettingSchema.parse({ ...b, address: "81.2.69.161", httpsPort: await freeLoopbackPort() });
  await subject.caller.share.enableIpCertificate(b);
  await subject.harness.settleSharing();
  expect((await subject.caller.share.status()).certificate).toMatchObject({ state: "active", setting: b });
  const responses = await Promise.all([subject.caller.share.enableIpCertificate(a), subject.caller.share.enableIpCertificate(b)]);
  await subject.harness.settleSharing();
  expect(responses[1].certificate).toMatchObject({ setting: b });
  const stored = await subject.harness.services.settings.getAppSettings({ principal: await subject.harness.principalFor(subject.harness.ownerId) });
  expect(stored.ipCertificate).toEqual(b);
  expect((await subject.caller.share.status()).certificate).toMatchObject({ state: "active", setting: b });
  const certificate = await readFile(join(subject.harness.secretsDir, IP_CERTIFICATE_FILE_NAMES.certificate), "utf8");
  expect(new X509Certificate(certificate).checkIP(b.address)).toBe(b.address);
  expect((await tlsConfig(b.httpsPort, certificate)).status).toBe(200);
  await expect(
    tlsRequest({
      host: "127.0.0.1",
      port: a.httpsPort,
      path: "/api/auth/config",
      ca: certificate,
      allowPartialTrustChain: true,
      identityAddress: a.address,
      headers: { host: a.address },
    }),
  ).rejects.toThrow();
});

test("overlapping owner certificate enable then disable retains off settings and deletes native serving files", async () => {
  await using subject = await setup();
  await subject.caller.share.enableIpCertificate(subject.setting);
  await subject.harness.settleSharing();
  const a = ipCertificateSettingSchema.parse({ ...subject.setting, address: "81.2.69.161", httpsPort: await freeLoopbackPort() });
  const principal = await subject.harness.principalFor(subject.harness.ownerId);
  const [, disabled] = await Promise.all([
    subject.harness.services.share.enableIpCertificate({ principal, setting: a }),
    subject.harness.services.share.disableIpCertificate({ principal }),
  ]);
  expect(disabled.certificate).toEqual({ state: "off" });
  await subject.harness.settleSharing();
  const stored = await subject.harness.services.settings.getAppSettings({ principal: await subject.harness.principalFor(subject.harness.ownerId) });
  expect(stored.ipCertificate).toBeNull();
  expect((await subject.caller.share.status()).certificate).toEqual({ state: "off" });
  await expect(stat(join(subject.harness.secretsDir, IP_CERTIFICATE_FILE_NAMES.certificate))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(stat(join(subject.harness.secretsDir, IP_CERTIFICATE_FILE_NAMES.certificateKey))).rejects.toMatchObject({ code: "ENOENT" });
  for (const port of [a.httpsPort, subject.setting.httpsPort]) {
    await using sockets = new AsyncDisposableStack();
    const socket = connect({ host: "127.0.0.1", port });
    const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
    sockets.defer(async () => {
      socket.destroy();
      await closed;
    });
    await expect(
      new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("error", reject);
      }),
    ).rejects.toMatchObject({ code: "ECONNREFUSED" });
  }
});

test.each(["/directory", "/chall/1", "/order/1/finalize"])("disposal cancels and joins native ACME held at %s before removing its storage", async (path) => {
  await using subject = await setup(path);
  const { harness, caller, held, setting } = subject;
  if (held === undefined) {
    throw new Error("authority gate missing");
  }
  await caller.share.enableIpCertificate(setting);
  await held.reached;
  await harness[Symbol.asyncDispose]();
  await held.closed;
  await expect(stat(harness.secretsDir)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(fetch(`http://127.0.0.1:${setting.challengePort}/.well-known/acme-challenge/${TOKEN}`)).rejects.toThrow();
  held.release();
});

test("the native challenge listener serves only its pending token and owner disable cancels its actual request", async () => {
  await using subject = await setup("/chall/1");
  await subject.caller.share.enableIpCertificate(subject.setting);
  await subject.held?.reached;
  const url = `http://127.0.0.1:${subject.setting.challengePort}/.well-known/acme-challenge/${TOKEN}`;
  const allowed = await fetch(url);
  expect(allowed.status).toBe(200);
  expect(await allowed.text()).toContain(`${TOKEN}.`);
  const head = await fetch(url, { method: "HEAD" });
  expect(head.status).toBe(200);
  expect(await head.text()).toBe("");
  for (const [path, init] of [
    [`${url}?probe=1`, {}],
    [url, { method: "POST", body: "x" }],
    [`http://127.0.0.1:${subject.setting.challengePort}/api/auth/config`, {}],
  ] as const) {
    const refused = await fetch(path, init);
    expect(refused.status).toBe(404);
    expect(await refused.text()).toBe("");
  }
  await subject.caller.share.disableIpCertificate();
  await subject.held?.closed;
  await subject.harness.settleSharing();
  expect((await subject.caller.share.status()).certificate).toEqual({ state: "off" });
  await expect(fetch(url)).rejects.toThrow();
  subject.held?.release();
});

test("native authority errors retain their reason without exposing the account key after library normalization", async () => {
  await using subject = await setup("/new-order");
  await subject.caller.share.enableIpCertificate(subject.setting);
  await subject.held?.reached;
  const key = await readFile(join(subject.harness.secretsDir, IP_CERTIFICATE_FILE_NAMES.accountKey), "utf8");
  subject.authority.refuseOrders({ type: "urn:ietf:params:acme:error:rejectedIdentifier", detail: `native refusal with private diagnostic ${key}` });
  subject.held?.release();
  await subject.harness.settleSharing();
  const status = (await subject.caller.share.status()).certificate;
  expect(status).toMatchObject({
    state: "failed",
    failure: { code: "issuance_failed", message: expect.stringContaining("native refusal with private diagnostic") },
  });
  expect(JSON.stringify(status)).not.toContain(key.replaceAll("\n", ""));
  const body = key.split("\n")[1];
  if (body === undefined) {
    throw new Error("native account key omitted its PEM body");
  }
  expect(JSON.stringify(status)).not.toContain(body);
});

test("native shutdown releases an accepted TCP connection that never sends a TLS handshake", async () => {
  await using subject = await setup();
  await subject.caller.share.enableIpCertificate(subject.setting);
  await subject.harness.settleSharing();
  expect((await subject.caller.share.status()).certificate.state).toBe("active");
  await using socket = connect({ host: "127.0.0.1", port: subject.setting.httpsPort });
  const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("error", reject);
  });
  await subject.harness[Symbol.asyncDispose]();
  await closed;
  expect(socket.destroyed).toBe(true);
});

test("a real TLS listener still closes and root storage releases when a supplied timer cancellation rejects", async () => {
  const clock = createFrozenClock();
  // biome-ignore lint/nursery/useDisposables: setup transfers this exact scheduler to the root through the raw timer view.
  const base = createControlledTimers(clock);
  const failure = new Error("raw certificate timer cancellation failed");
  let refuse = false;
  const timers = {
    ...base,
    timeoutUnref: (callback: () => void, ms: number): (() => void) => {
      const cancel = base.timeoutUnref(callback, ms);
      return (): void => {
        cancel();
        if (refuse) {
          refuse = false;
          throw failure;
        }
      };
    },
  };
  await using subject = await setup(undefined, { clock, timers });
  await subject.caller.share.enableIpCertificate(subject.setting);
  await subject.harness.settleSharing();
  expect((await subject.caller.share.status()).certificate.state).toBe("active");
  const certificate = await readFile(join(subject.harness.secretsDir, IP_CERTIFICATE_FILE_NAMES.certificate), "utf8");
  expect((await tlsConfig(subject.setting.httpsPort, certificate)).status).toBe(200);
  refuse = true;
  await expect(subject.harness[Symbol.asyncDispose]()).rejects.toMatchObject({ errors: [failure] });
  await expect(tlsConfig(subject.setting.httpsPort, certificate)).rejects.toThrow();
  await expect(stat(subject.harness.secretsDir)).rejects.toMatchObject({ code: "ENOENT" });
  expect(timers.pending()).toBe(0);
});

test("shutdown preserves borrowed certificates for real restart; a corrupt stored key forces another native order", async () => {
  await using resources = new AsyncDisposableStack();
  const directory = await mkdtemp(join(tmpdir(), "share-acme-native-restart-"));
  resources.defer(() => rm(directory, { recursive: true, force: true }));
  const db = await freshDb();
  resources.defer(() => closeDb(db));
  await using first = await setup(undefined, { db, secretsDir: join(directory, "secrets") });
  await first.caller.share.enableIpCertificate(first.setting);
  await expect.poll(async () => (await first.caller.share.status()).certificate.state).toBe("active");
  const path = join(first.harness.secretsDir, IP_CERTIFICATE_FILE_NAMES.certificate);
  const certificate = await readFile(path, "utf8");
  await first.harness[Symbol.asyncDispose]();
  expect(await readFile(path, "utf8")).toBe(certificate);
  const options = {
    db,
    ownerId: first.harness.ownerId,
    secretsDir: first.harness.secretsDir,
    authConfig: { ...authConfigFromEnv(), mode: "local" as const },
    bindHost: "0.0.0.0",
    allowPublicBind: true,
    share: { acme: { directoryUrl: first.authority.directoryUrl, polling: { attempts: 2, minMs: 1, maxMs: 2 } } },
  };
  await using second = await createServerHarness(options);
  await second.listen();
  await expect(second.services.share.resumeIpCertificate()).resolves.toMatchObject({ kind: "started", certificate: { state: "active" } });
  expect(first.authority.requests.filter((entry) => entry.path === "/new-order")).toHaveLength(1);
  expect((await tlsConfig(first.setting.httpsPort, certificate)).status).toBe(200);
  await second[Symbol.asyncDispose]();
  await writeFile(join(first.harness.secretsDir, IP_CERTIFICATE_FILE_NAMES.certificateKey), "corrupt private key");
  await using third = await createServerHarness(options);
  await third.listen();
  await third.services.share.resumeIpCertificate();
  const caller = await third.internalCallerFor(third.ownerId);
  await expect.poll(async () => (await caller.share.status()).certificate.state).toBe("active");
  expect(first.authority.requests.filter((entry) => entry.path === "/new-order")).toHaveLength(2);
  expect(await readFile(path, "utf8")).not.toBe(certificate);
});

test("native renewals keep the serving certificate on failure, replace it on recovery and close TLS at expiry", async () => {
  const clock = createFrozenClock();
  // biome-ignore lint/nursery/useDisposables: setup transfers this scheduler to the real server root, including its disposal method.
  const baseTimers = createControlledTimers(clock);
  const pending = new Set<{ readonly at: number; readonly fire: () => void; readonly cancel: () => void }>();
  const timers = {
    ...baseTimers,
    timeoutUnref: (callback: () => void, ms: number): (() => void) => {
      const cancel = baseTimers.timeoutUnref(callback, ms);
      const entry = { at: clock.now() + ms, fire: callback, cancel };
      pending.add(entry);
      return (): void => {
        pending.delete(entry);
        cancel();
      };
    },
  };
  const fireAt = (at: number): void => {
    const entry = [...pending].find((candidate) => candidate.at === at);
    if (entry === undefined) {
      throw new Error("the production controller did not arm the expected native renewal/expiry timer");
    }
    pending.delete(entry);
    entry.cancel();
    clock.advance(at - clock.now());
    entry.fire();
  };
  await using subject = await setup(undefined, { clock, timers });
  await subject.caller.share.enableIpCertificate(subject.setting);
  await expect.poll(async () => (await subject.caller.share.status()).certificate.state).toBe("active");
  const initial = (await subject.caller.share.status()).certificate;
  if (initial.state !== "active") {
    throw new Error("native initial certificate did not activate");
  }
  const path = join(subject.harness.secretsDir, IP_CERTIFICATE_FILE_NAMES.certificate);
  const before = await readFile(path, "utf8");
  subject.authority.refuseOrders({ type: "urn:ietf:params:acme:error:rejectedIdentifier", detail: "raw authority refuses this renewal" });
  // Long timers re-arm in bounded native steps; trigger those steps without running unrelated interval work.
  while (clock.now() < initial.renewAt) {
    const next = Math.min(...[...pending].map((entry) => entry.at));
    fireAt(next);
  }
  await expect
    .poll(async () => (await subject.caller.share.status()).certificate)
    .toMatchObject({ state: "active", renewalFailure: { code: "issuance_failed" } });
  expect((await tlsConfig(subject.setting.httpsPort, before)).status).toBe(200);
  const failed = (await subject.caller.share.status()).certificate;
  if (failed.state !== "active") {
    throw new Error("failed renewal dropped the serving certificate");
  }
  subject.authority.refuseOrders(undefined);
  subject.authority.validity(FROZEN_AT_MS, NOT_AFTER + 160 * 3_600_000);
  fireAt(failed.renewAt);
  await expect
    .poll(async () => (await subject.caller.share.status()).certificate)
    .toMatchObject({ state: "active", notAfter: NOT_AFTER + 160 * 3_600_000, renewalFailure: null });
  const renewed = await readFile(path, "utf8");
  expect(renewed).not.toBe(before);
  expect((await tlsConfig(subject.setting.httpsPort, renewed)).status).toBe(200);
  subject.authority.refuseOrders({ type: "urn:ietf:params:acme:error:rejectedIdentifier", detail: "raw authority refuses all later renewals" });
  const active = (await subject.caller.share.status()).certificate;
  if (active.state !== "active") {
    throw new Error("native renewed certificate did not remain active");
  }
  clock.advance(active.notAfter - clock.now());
  const ordersBeforeExpiry = subject.authority.requests.filter((entry) => entry.path === "/new-order").length;
  for (const entry of [...pending]) {
    entry.cancel();
    entry.fire();
  }
  await expect.poll(async () => (await subject.caller.share.status()).certificate).toMatchObject({ state: "failed", failure: { code: "expired" } });
  await subject.harness.settleSharing();
  expect(subject.authority.requests.filter((entry) => entry.path === "/new-order")).toHaveLength(ordersBeforeExpiry);
  await expect(tlsConfig(subject.setting.httpsPort, renewed)).rejects.toThrow();
});
