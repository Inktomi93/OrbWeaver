// sessions.me — the canonical viewer-identity read (docs/law/Tier-4-Transport.md). Unlike the other router
// tests, this procedure calls NO `ctx.services` verb: it is a PURE projection of the resolved `Principal`
// (`ctx.auth`) into a `ViewerView` (`userId`/`handle`/`globalRole`), so identity is never re-queried below
// the seam (Spine-Identity-and-Auth invariant #2). These tests drive the real middleware ladder via
// `createCaller` and assert the projection: the exact three fields, `role`→`globalRole`, and no leakage of
// any other `Principal` field (`externalId`/`via`).
//
// The procedure also parses its result through the strict `viewerViewSchema`. The literal projection cannot
// carry an extra key today; the parser is what refuses a refactor that spreads the Principal (its
// `externalId` is the SSO subject). The contract test pins the strict refusal; here the pins are that the
// parser is installed and that it rejects a malformed known field at runtime.

import { viewerViewSchema } from "@orb/contracts/identity";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { appRouter } from "@orb/server/transport/trpc";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

const USER = castId<UserId>("user_viewer");
const HANDLE = castId<Handle>("nate");

describe("sessions.me — viewer identity projection", () => {
  test("projects the caller's Principal into { userId, handle, globalRole }", async () => {
    const view = await caller(makeContext({ auth: principal("admin", { userId: USER, handle: HANDLE }) })).sessions.me();

    expect(view).toEqual({ userId: USER, handle: HANDLE, globalRole: "admin" });
  });

  test("maps role verbatim to globalRole (owner/user, not just admin)", async () => {
    const owner = await caller(makeContext({ auth: principal("owner") })).sessions.me();
    expect(owner.globalRole).toBe("owner");

    const user = await caller(makeContext({ auth: principal("user") })).sessions.me();
    expect(user.globalRole).toBe("user");
  });

  test("leaks no other Principal field (externalId / via stay off the wire)", async () => {
    const view = await caller(
      makeContext({
        auth: principal("user", {
          userId: USER,
          handle: HANDLE,
          externalId: castId<ExternalId>("authentik-sub-123"),
          via: "cookie",
        }),
      }),
    ).sessions.me();

    expect(Object.keys(view).sort()).toEqual(["globalRole", "handle", "userId"]);
  });
});

describe("sessions.me — the strict output parser", () => {
  test("the procedure parses its result through the canonical viewerViewSchema", () => {
    const output: unknown = Reflect.get(appRouter.sessions.me._def, "output");
    // Both sides undefined would pass `toBe`, so the parser's presence is asserted on its own first.
    expect(output).toBeDefined();
    expect(output).toBe(viewerViewSchema);
  });

  test("a malformed known field is refused at runtime instead of reaching the wire", async () => {
    const ctx = makeContext({ auth: principal("user", { userId: USER, handle: castId<Handle>("") }) });

    await expect(caller(ctx).sessions.me()).toThrowTRPCError("INTERNAL_SERVER_ERROR");
  });
});
