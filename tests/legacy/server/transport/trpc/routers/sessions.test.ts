// sessions.me projects the resolved Principal without re-querying identity (Spine-Identity-and-Auth invariant 2).
// Real-credential wire projection lives in tests/server/entry/auth/seam-arms.int.test.ts and
// tests/e2e/csrf-gates.forward.spec.ts; this legacy slice also retains malformed-known-field refusal.

import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { caller, makeContext, principal } from "../_support.ts";

const USER = castId<UserId>("user_viewer");
const HANDLE = castId<Handle>("alex");

describe("sessions.me — viewer identity projection", () => {
  test("projects the caller's Principal into { userId, handle, globalRole }", async () => {
    const db = await freshDb();
    const view = await caller(makeContext({ auth: await principal(db, "admin", { userId: USER, handle: HANDLE }) })).sessions.me();

    expect(view).toEqual({ userId: USER, handle: HANDLE, globalRole: "admin" });
  });

  test("maps role verbatim to globalRole (owner/user, not just admin)", async () => {
    const db = await freshDb();
    const owner = await caller(makeContext({ auth: await principal(db, "owner") })).sessions.me();
    expect(owner.globalRole).toBe("owner");

    const user = await caller(makeContext({ auth: await principal(db, "user") })).sessions.me();
    expect(user.globalRole).toBe("user");
  });
});

describe("sessions.me — the strict output parser", () => {
  test("a malformed known field is refused at runtime instead of reaching the wire", async () => {
    const db = await freshDb();
    const ctx = makeContext({ auth: await principal(db, "user", { userId: USER, handle: castId<Handle>("") }) });

    await expect(caller(ctx).sessions.me()).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });
});
