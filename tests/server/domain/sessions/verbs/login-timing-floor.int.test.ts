// The login constant-time floor over the real login route: an unknown handle and an SSO-only row each run the
// root's password verifier against its dummy hash, and that hash has the live stored format, so the KDF runs.
// @subject packages/server/src/domain/sessions/verbs/authenticate.ts
import { CSRF_HEADER } from "@orb/contracts/identity";
import { users } from "@orb/db";
import type { ExternalId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsCryptoOps } from "@orb/server/domain/sessions";
import { SessionsCrypto } from "@orb/server/entry/compose";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import type { MockInstance } from "vitest";
import { vi } from "vitest";

type PasswordVerifier = ReturnType<SessionsCryptoOps["createPasswordHasher"]>;

const LAN_PEER = "192.168.1.55";
const MEMBER_HANDLE = castId<Handle>("floor-member");
const SSO_HANDLE = castId<Handle>("floor-sso-member");
const UNKNOWN_HANDLE = castId<Handle>("floor-nobody");
const PASSWORD = "login-timing-floor-password";
const WRONG_PASSWORD = "login-timing-floor-wrong-guess";
const STORED_SEPARATOR = "$";
const UNAUTHORIZED = 401;
const OK = 200;

// The real factory, from an instance no spy wraps, so the probes below build hashers without being observed.
const realCreatePasswordHasher = SessionsCrypto.production().createPasswordHasher;

interface ObservedRoot extends AsyncDisposable {
  readonly root: ServerTestHarness;
  /** The verifier the sessions domain closed over, spied through to the production implementation. */
  readonly verify: MockInstance<PasswordVerifier["verify"]>;
  /** The dummy hash that same verifier handed the domain. */
  readonly dummyHash: string;
  readonly login: (handle: Handle, password: string) => Promise<number>;
}

// Spies the production crypto ops the root hands to the sessions service (Spine-Testing §3), so the verifier
// under observation is the production one the real login route reaches.
async function observedLocalRoot(): Promise<ObservedRoot> {
  let observed: { readonly verify: ObservedRoot["verify"]; readonly dummyHash: string } | undefined;
  const sessionsCrypto = SessionsCrypto.production();
  const factory = vi.spyOn(sessionsCrypto, "createPasswordHasher").mockImplementation((pepper) => {
    const hasher = realCreatePasswordHasher(pepper);
    observed = { verify: vi.spyOn(hasher, "verify"), dummyHash: hasher.dummyHash };
    return hasher;
  });
  const root = await createServerHarness({ physicalPeer: () => LAN_PEER, env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" }, sessionsCrypto }).finally(
    () => factory.mockRestore(),
  );
  if (observed === undefined) {
    await root[Symbol.asyncDispose]();
    throw new Error("the composed root built no sessions password verifier");
  }
  return {
    root,
    verify: observed.verify,
    dummyHash: observed.dummyHash,
    [Symbol.asyncDispose]: () => root[Symbol.asyncDispose](),
    login: async (handle, password): Promise<number> => {
      const response = await root.http.request("/api/auth/login", {
        method: "POST",
        headers: { [CSRF_HEADER]: "1" },
        body: new URLSearchParams({ handle, password }),
      });
      await response.arrayBuffer();
      return response.status;
    },
  };
}

async function storedHashOf(root: ServerTestHarness, handle: Handle): Promise<string | null> {
  const [row] = await root.db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.handle, handle));
  if (row === undefined) {
    throw new Error(`no users row for ${handle}`);
  }
  return row.passwordHash;
}

/** The stored-format fields the verifier gates the KDF on: algorithm tag, part count, salt and key widths. */
function storedFormat(stored: string): { readonly algorithm: string; readonly parts: number; readonly saltBytes: number; readonly keyBytes: number } {
  const parts = stored.split(STORED_SEPARATOR);
  const [algorithm = "", salt = "", key = ""] = parts;
  for (const segment of [salt, key]) {
    expect(Buffer.from(segment, "base64").toString("base64"), "a stored segment must be canonical base64").toBe(segment);
  }
  return { algorithm, parts: parts.length, saltBytes: Buffer.from(salt, "base64").length, keyBytes: Buffer.from(key, "base64").length };
}

/** One login's verifier calls: the password and the stored hash it was checked against. */
async function verifiedDuring(
  box: ObservedRoot,
  login: () => Promise<number>,
  status: number,
): Promise<ReadonlyArray<readonly [string, string | null | undefined]>> {
  box.verify.mockClear();
  expect(await login()).toBe(status);
  return box.verify.mock.calls;
}

// A disabled (pepperless) production hasher throws only once its stored hash passes every format check and it
// starts the KDF; a hash the verifier refuses resolves false without deriving.
async function expectReachesKdf(stored: string): Promise<void> {
  await expect(realCreatePasswordHasher(null).verify(PASSWORD, stored)).rejects.toThrow();
}

// Positive control: a real local row reaches the same spy with its own stored hash, the live format reference.
async function liveFormatOf(box: ObservedRoot): Promise<ReturnType<typeof storedFormat>> {
  const { root } = box;
  await root.services.admin.createUser({ principal: await root.principalFor(root.ownerId), handle: MEMBER_HANDLE, password: PASSWORD });
  const memberHash = await storedHashOf(root, MEMBER_HANDLE);
  if (memberHash === null) {
    throw new Error("admin.createUser stored no password hash");
  }
  expect(await verifiedDuring(box, () => box.login(MEMBER_HANDLE, PASSWORD), OK)).toEqual([[PASSWORD, memberHash]]);
  expect(await verifiedDuring(box, () => box.login(MEMBER_HANDLE, WRONG_PASSWORD), UNAUTHORIZED)).toEqual([[WRONG_PASSWORD, memberHash]]);
  await expectReachesKdf(memberHash);
  return storedFormat(memberHash);
}

async function expectDummyFloor(box: ObservedRoot, handle: Handle, liveFormat: ReturnType<typeof storedFormat>): Promise<void> {
  expect(await verifiedDuring(box, () => box.login(handle, PASSWORD), UNAUTHORIZED)).toEqual([[PASSWORD, box.dummyHash]]);
  expect(storedFormat(box.dummyHash), "the dummy hash has the format hash() writes").toEqual(liveFormat);
  await expectReachesKdf(box.dummyHash);
}

test("an unknown handle runs the verifier against the live-format dummy hash", async () => {
  await using box = await observedLocalRoot();
  const liveFormat = await liveFormatOf(box);
  expect(await box.root.app.sessions.resolveHandle(UNKNOWN_HANDLE)).toBeNull();
  await expectDummyFloor(box, UNKNOWN_HANDLE, liveFormat);
});

test("an SSO-only row runs the verifier against the live-format dummy hash", async () => {
  await using box = await observedLocalRoot();
  const liveFormat = await liveFormatOf(box);
  const provisioned = await box.root.app.sessions.provisionIdentity(
    { externalId: castId<ExternalId>("floor-sso-subject"), handle: SSO_HANDLE, groups: [], email: null },
    { ownerClaimProven: false },
  );
  expect(provisioned).toMatchObject({ outcome: "provisioned", enabled: true });
  expect(await storedHashOf(box.root, SSO_HANDLE), "the SSO-provisioned row carries no password").toBeNull();
  await expectDummyFloor(box, SSO_HANDLE, liveFormat);
});

test("the KDF probe tells a refused hash from one the verifier derives against", async () => {
  const hasher = realCreatePasswordHasher(null);
  const [algorithm, salt] = hasher.dummyHash.split(STORED_SEPARATOR);
  await expect(hasher.verify(PASSWORD, [algorithm, salt, ""].join(STORED_SEPARATOR))).resolves.toBe(false);
  await expect(hasher.verify(PASSWORD, null)).resolves.toBe(false);
  await expectReachesKdf(hasher.dummyHash);
});
