// admin.restart at the router: the explicit confirm is the input, so a call without it never reaches the verb, and
// layer 1 refuses a plain user before it. The verb's own gates (owner, supervisor, single flight) are its unit test.

import type { UserRole } from "@orb/contracts/identity";
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

// A handle's key normalizes, and NFKC/NFD over a long run of combining marks is quadratic, so the length cap is
// enforced before any key is computed.
const COMBINING_MARKS = "\u0345\u0301\u0316\u0334";

describe("admin.createUser handle length", () => {
  const createUser = vi.fn(() => Promise.resolve(undefined as never));
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
    for (const input of [{}, { confirm: false }, { confirm: "true" }]) {
      // @ts-expect-error the wire can carry a missing or wrong confirm; the input schema is what refuses it
      const refusal = h.admin.restart(input);
      await expect(refusal, JSON.stringify(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(h.restart).not.toHaveBeenCalled();
  });

  test("a plain user is refused at layer 1 and the verb never runs", async () => {
    const h = harness("user");
    await expect(h.admin.restart({ confirm: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.restart).not.toHaveBeenCalled();
  });

  test("control: the confirmed call reaches the verb with the caller and the confirm", async () => {
    const h = harness("owner");
    await expect(h.admin.restart({ confirm: true })).resolves.toEqual({ restarting: true });
    expect(h.restart).toHaveBeenCalledExactlyOnceWith({ principal: principal("owner"), confirm: true });
  });
});
