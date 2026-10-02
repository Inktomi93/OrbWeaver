// admin at the router: the restart confirm and the handle cap are input refusals that never reach the verb, and
// layer 1 refuses a plain user before either. The user and session reads parse through strict output schemas, so a
// producer that starts returning an extra column fails the call instead of shipping it. The verbs' own gates are
// their unit tests.

import type { UserRole } from "@orb/contracts/identity";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { AdminService, AdminUserView } from "@orb/server/domain/admin";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

function harness(role: UserRole): {
  readonly admin: ReturnType<typeof caller>["admin"];
  readonly restart: ReturnType<typeof vi.fn>;
} {
  const restart = vi.fn(() => Promise.resolve());
  const admin = caller(makeContext({ auth: principal(role), services: { admin: { restart } } })).admin;
  return { admin, restart };
}

const INSTANCE_ID = "20000000-0000-4000-8000-000000000002";

// A handle's key normalizes, and NFKC/NFD over a long run of combining marks is quadratic, so the length cap is
// enforced before any key is computed.
const COMBINING_MARKS = "\u0345\u0301\u0316\u0334";

const USER_VIEW: AdminUserView = {
  id: castId<UserId>("user_alice"),
  handle: castId<Handle>("alice"),
  externalId: null,
  role: "user",
  enabled: true,
  kind: "human",
  ownerHandle: null,
  createdAt: 1_750_000_000_000,
  updatedAt: 1_750_000_000_000,
};

describe("admin.createUser handle length", () => {
  const createUser = vi.fn<AdminService["createUser"]>(() => Promise.resolve(USER_VIEW));
  const admin = (): ReturnType<typeof caller>["admin"] => caller(makeContext({ auth: principal("admin"), services: { admin: { createUser } } })).admin;

  test("a handle over 64 code points answers BAD_REQUEST and the verb never runs", async () => {
    createUser.mockClear();
    const long = `a${COMBINING_MARKS.repeat(16)}`;
    await expect(admin().createUser({ handle: long as never, password: "correct-horse" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(createUser).not.toHaveBeenCalled();
  });

  test("control: a handle of exactly 64 code points reaches the verb", async () => {
    createUser.mockClear();
    const edge = `${"a".repeat(63)}\u{1D400}`;
    await admin().createUser({ handle: edge as never, password: "correct-horse" });
    expect(createUser).toHaveBeenCalledOnce();
  });
});

describe("admin.restart", () => {
  test("without the confirm it answers BAD_REQUEST and the verb never runs", async () => {
    const h = harness("owner");
    for (const input of [
      { expectedServerInstanceId: INSTANCE_ID },
      { confirm: false, expectedServerInstanceId: INSTANCE_ID },
      { confirm: "true", expectedServerInstanceId: INSTANCE_ID },
    ]) {
      // @ts-expect-error the wire can carry a missing or wrong confirm; the input schema is what refuses it
      const refusal = h.admin.restart(input);
      await expect(refusal, JSON.stringify(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(h.restart).not.toHaveBeenCalled();
  });

  test("a missing or malformed expected instance never reaches the verb", async () => {
    const h = harness("owner");
    // @ts-expect-error the input boundary must refuse a wire request without its expected process identity
    await expect(h.admin.restart({ confirm: true })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(h.admin.restart({ confirm: true, expectedServerInstanceId: "not-a-process-uuid" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(h.restart).not.toHaveBeenCalled();
  });

  test("a plain user is refused at layer 1 and the verb never runs", async () => {
    const h = harness("user");
    await expect(h.admin.restart({ confirm: true, expectedServerInstanceId: INSTANCE_ID })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.restart).not.toHaveBeenCalled();
  });

  test("control: the confirmed call reaches the verb with the caller and the confirm", async () => {
    const h = harness("owner");
    await expect(h.admin.restart({ confirm: true, expectedServerInstanceId: INSTANCE_ID })).resolves.toEqual({ restarting: true });
    expect(h.restart).toHaveBeenCalledExactlyOnceWith({ principal: principal("owner"), confirm: true, expectedServerInstanceId: INSTANCE_ID });
  });
});

describe("admin user and session reads — the strict output boundary", () => {
  const PasswordHash = "$argon2id$v=19$m=65536,t=3,p=4$planted";
  const adminWith = (services: Partial<AdminService>): ReturnType<typeof caller>["admin"] =>
    caller(makeContext({ auth: principal("admin"), services: { admin: services } })).admin;

  test("control: a well-formed view passes through unchanged", async () => {
    const listUsers = vi.fn<AdminService["listUsers"]>(async () => [USER_VIEW]);
    const linked = { ...USER_VIEW, externalId: castId<ExternalId>("sso-subject-1") };
    const linkSsoIdentity = vi.fn<AdminService["linkSsoIdentity"]>(async () => linked);
    const api = adminWith({ listUsers, linkSsoIdentity });

    await expect(api.listUsers()).resolves.toEqual([USER_VIEW]);
    await expect(api.linkSsoIdentity({ userId: USER_VIEW.id, externalId: castId<ExternalId>("sso-subject-1") })).resolves.toEqual(linked);
  });

  test("listUsers refuses a row carrying the password hash instead of stripping or shipping it", async () => {
    const listUsers = vi.fn<AdminService["listUsers"]>(async () => [{ ...USER_VIEW, passwordHash: PasswordHash }]);

    const failure = await adminWith({ listUsers })
      .listUsers()
      .then(
        () => null,
        (err: unknown) => err,
      );

    expect(failure).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(String(failure)).not.toContain(PasswordHash);
  });

  test("setRole refuses an extra key on the single-row write result", async () => {
    const setRole = vi.fn<AdminService["setRole"]>(async () => ({ ...USER_VIEW, role: "admin", passwordHash: PasswordHash }));

    await expect(adminWith({ setRole }).setRole({ userId: USER_VIEW.id, role: "admin" })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  test("listSessions refuses a session row carrying its token hash", async () => {
    const session = {
      id: mintTypeId(ID_PREFIX.session),
      userId: USER_VIEW.id,
      expiresAt: 1_750_000_100_000,
      lastSeenAt: 1_750_000_000_000,
      revokedAt: null,
      userAgent: null,
      createdAt: 1_750_000_000_000,
    };
    const listSessions = vi.fn<AdminService["listSessions"]>(async () => [{ ...session, tokenHash: "planted-token-hash" }]);
    const clean = vi.fn<AdminService["listSessions"]>(async () => [session]);

    await expect(adminWith({ listSessions }).listSessions({ userId: USER_VIEW.id })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    await expect(adminWith({ listSessions: clean }).listSessions({ userId: USER_VIEW.id })).resolves.toEqual([session]);
  });
});
