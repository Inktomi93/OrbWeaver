// @subject tests/support/node/corpus-seed.ts
// @subject tests/support/node/corpus-auth.ts
// @subject packages/server/src/entry/auth/seam.ts
import "./composed-real.ts";
import { blobIconUrl, blobUrl } from "@orb/contracts/assets";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { sessions } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { authConfigFromEnv, readSessionCookie } from "@orb/server/entry/auth";
import { createCas } from "@orb/server/infra/storage/cas";
import { eq } from "drizzle-orm";
import { createCorpusHarness, loadCorpusFixture } from "./corpus.ts";
import { captureCorpusCookieIdentity } from "./corpus-auth.ts";
import { captureCookieAuth } from "./corpus-seed.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

const PASSWORD = "native-shared-member-login-password";

test("committed media uses native cookie ownership, exact CAS bytes and native variant refusals", { tags: "slow" }, async () => {
  const source = loadCorpusFixture();
  await using root = await createCorpusHarness();
  const hash = source.wire.reads["character.list"][0]?.output.items.find((row) => row.avatarHash !== null)?.avatarHash;
  const reader = source.wire.memberIdentities?.notificationReader.viewer;
  if (hash === undefined || hash === null || reader === undefined) {
    throw new Error("The committed corpus has no native media ownership cohort");
  }
  const bytes = Buffer.from(await createCas(source.layout.assets).read(root.ownerId, hash));
  const owner = await root.principalFor(root.ownerId);
  const ownerAuth = await captureCookieAuth(root, owner, PASSWORD);
  const member = await root.principalFor(brandedId<UserId>().parse(reader.userId));
  const memberAuth = await captureCookieAuth(root, member, PASSWORD);
  const request = (path: string, cookie: string): Promise<Response> => Promise.resolve(root.http.request(path, { headers: { cookie, forwarded: "" } }));
  const original = await request(blobUrl(hash), ownerAuth.cookie);
  expect(original.status).toBe(200);
  expect(original.headers.get("cache-control")).toBe("private, immutable");
  expect(original.headers.get("x-content-type-options")).toBe("nosniff");
  expect(Buffer.from(await original.arrayBuffer()).equals(bytes)).toBe(true);
  const variant = await request(blobIconUrl(hash, 64), ownerAuth.cookie);
  expect(variant.status).toBe(200);
  expect(variant.headers.get("content-type")).toBe("image/webp");
  expect((await variant.arrayBuffer()).byteLength).toBeGreaterThan(0);
  const refusals = [
    await request(blobUrl(hash), memberAuth.cookie),
    await request(blobIconUrl(hash, 64), memberAuth.cookie),
    await request(blobUrl("0".repeat(64)), ownerAuth.cookie),
    await request(`${blobUrl(hash)}?w=-1`, ownerAuth.cookie),
    await request(`${blobIconUrl(hash, 64)}&v=unsupported`, ownerAuth.cookie),
  ];
  for (const response of refusals) {
    expect(response.status).toBe(404);
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  }
  const anonymous = await request(blobUrl(hash), "");
  expect(anonymous.status).toBe(401);
  await anonymous.arrayBuffer();
  expect(Buffer.from(await createCas(source.layout.assets).read(root.ownerId, hash)).equals(bytes)).toBe(true);
});

test("corpus cookie capture provisions and admits the actual member rather than resetting only the owner", async () => {
  await using root = await createServerHarness({ authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny" } });
  const member = await root.principalFor((await root.actor()).id);
  const capture = await captureCookieAuth(root, member, PASSWORD);
  expect(capture.auth.signedInMe).toEqual({ authenticated: true, handle: member.handle, role: member.role });
  expect(capture.identity.viewer).toEqual({ userId: member.userId, handle: member.handle, globalRole: member.role });
  expect(capture.identity.authMe).toEqual(capture.auth.signedInMe);
  expect(capture.identity.authConfig).toMatchObject({ mode: "local", transport: "http", clientScope: "loopback" });
  expect(await root.app.sessions.ownerNeedsPassword()).toBe(true);
  const owner = await root.principalFor(root.ownerId);
  const ownerCapture = await captureCookieAuth(root, owner, "native-owner-compatibility-password");
  expect(ownerCapture.identity.viewer).toEqual({ userId: owner.userId, handle: owner.handle, globalRole: owner.role });
  await captureCookieAuth(root, member, PASSWORD);
  expect(await captureCorpusCookieIdentity(root, owner, ownerCapture.cookie)).toEqual(ownerCapture.identity);
  await expect(captureCorpusCookieIdentity(root, owner, capture.cookie)).rejects.toThrow("request refused");
});

test("native cookie identity refuses cross-viewer, anonymous, malformed, disabled, revoked and expired admission", async () => {
  await using root = await createServerHarness({ authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny" } });
  const member = await root.principalFor((await root.actor()).id);
  const foreign = await root.principalFor((await root.actor()).id);
  const capture = await captureCookieAuth(root, member, PASSWORD);
  expect((await captureCorpusCookieIdentity(root, member, capture.cookie)).viewer.userId).toBe(member.userId);
  await expect(captureCorpusCookieIdentity(root, foreign, capture.cookie)).rejects.toThrow("does not admit the expected viewer");
  await expect(captureCorpusCookieIdentity(root, member, "")).rejects.toThrow("request refused (401)");
  const token = readSessionCookie(new Headers({ cookie: capture.cookie }), "http");
  if (token === null) {
    throw new Error("native member cookie has no canonical session token");
  }
  const malformed = capture.cookie.replace(token, "%E0%A4%A");
  await expect(captureCorpusCookieIdentity(root, member, malformed)).rejects.toThrow("request refused (401)");
  const login = (password: string, csrf: boolean): Promise<Response> =>
    Promise.resolve(
      root.http.request("/api/auth/login", {
        method: "POST",
        headers: csrf ? { [CSRF_HEADER]: "1" } : {},
        body: new URLSearchParams({ handle: member.handle, password }),
      }),
    );
  const noCsrf = await login(PASSWORD, false);
  expect(noCsrf.status).toBe(403);
  expect(noCsrf.headers.getSetCookie()).toEqual([]);
  await noCsrf.arrayBuffer();
  const wrongPassword = await login("incorrect-native-member-password", true);
  expect(wrongPassword.status).toBe(401);
  expect(wrongPassword.headers.getSetCookie()).toEqual([]);
  await wrongPassword.arrayBuffer();
  const admin = await root.internalCallerFor(root.ownerId);
  await admin.admin.setEnabled({ userId: member.userId, enabled: false });
  const disabled = await login(PASSWORD, true);
  expect(disabled.status).toBe(401);
  await disabled.arrayBuffer();
  await expect(captureCorpusCookieIdentity(root, member, capture.cookie)).rejects.toThrow("request refused (401)");
  await admin.admin.setEnabled({ userId: member.userId, enabled: true });
  const fresh = await captureCookieAuth(root, member, PASSWORD);
  const logout = await root.http.request("/api/auth/logout", { method: "POST", headers: { cookie: fresh.cookie, [CSRF_HEADER]: "1" } });
  expect(logout.status).toBe(200);
  await logout.arrayBuffer();
  await expect(captureCorpusCookieIdentity(root, member, fresh.cookie)).rejects.toThrow("request refused (401)");
  const expiring = await captureCookieAuth(root, member, PASSWORD);
  expect((await captureCorpusCookieIdentity(root, member, expiring.cookie)).viewer.userId).toBe(member.userId);
  const minted = await root.db.select().from(sessions).where(eq(sessions.userId, member.userId));
  expect(minted.length).toBeGreaterThan(0);
  root.clock.advance(Math.max(...minted.map((row) => row.expiresAt)) - root.clock.now());
  await expect(captureCorpusCookieIdentity(root, member, expiring.cookie)).rejects.toThrow("request refused (401)");
});

test("native loopback owner fallback cannot stand in for a cookie identity capture", async () => {
  await using root = await createServerHarness({ authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "owner" } });
  const owner = await root.principalFor(root.ownerId);
  const capture = await captureCookieAuth(root, owner, PASSWORD);
  const address = await root.listen();
  const ambient = await fetch(`http://${address.address}:${String(address.port)}/api/trpc/sessions.me`);
  expect(ambient.status).toBe(200);
  await ambient.arrayBuffer();
  expect((await captureCorpusCookieIdentity(root, owner, capture.cookie)).viewer.userId).toBe(root.ownerId);
  await expect(captureCorpusCookieIdentity(root, owner, "")).rejects.toThrow("request refused (401)");
});
