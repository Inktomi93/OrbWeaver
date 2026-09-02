// notifications.presence (#1039) — the presence DISCLOSURE read, driven through the REAL middleware ladder
// via `createCaller`. The resolver's projection behaviour is pinned in
// `tests/server/transport/trpc/presence-disclosure.test.ts`; what is pinned HERE is the wire boundary the
// resolver sits behind, because that is what the disclosure decision actually rests on:
//
//   • NO ANONYMOUS PATH. An unauthenticated caller is refused before the registry is touched.
//   • THE ASK IS BOUNDED at the trust boundary — an over-cap or empty `userIds` is a BAD_REQUEST from the
//     input schema, never an unbounded registry sweep.
//   • THE V1 AUDIENCE IS DELIBERATELY WIDE (owner ruling 2026-09-01: "everyone can see who is online — for
//     now at least"). A caller reading a user id it shares no room with RESOLVES — pinned as an intended
//     behaviour rather than left implicit, so a later membership tightening is a visible, deliberate edit to
//     this test and to `presence-disclosure.ts`, not a silent one.
//   • ONE BIT PER ID CROSSES. The response body carries `onlineUserIds` and nothing else — no `lastSeenAt`,
//     no per-user object that could grow one.
//
// The inbox CRUD trio's own PD-106 belt lives in `trpc.test.ts` (the `beltSurfaces` table, which the presence
// read now joins).

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createPresenceRegistry } from "@orb/server/transport/trpc";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

const VIEWER = castId<UserId>("user_viewer");
/** A user the caller shares NOTHING with — no room, no invite, no prior contact. */
const STRANGER = castId<UserId>("user_stranger");

/** The wire cap (`PRESENCE_READ_MAX_USER_IDS`) mirrored so the over-cap probe sits exactly one past it. */
const MAX_USER_IDS = 100;

/** A registry with `online` connected on a fixed clock — one live device each. */
function presenceWith(online: readonly UserId[]): ReturnType<typeof createPresenceRegistry> {
  const registry = createPresenceRegistry(() => 1000);
  for (const userId of online) {
    registry.connect(userId, new AbortController().signal);
  }
  return registry;
}

describe("notifications.presence — the disclosure boundary", () => {
  test("an anonymous caller is refused — there is no unauthenticated path to online state", async () => {
    const ctx = makeContext({ auth: null, presence: presenceWith([STRANGER]) });

    await expect(caller(ctx).notifications.presence({ userIds: [STRANGER] })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("v1 audience: an authenticated caller reads a STRANGER's online state (owner-ruled, 2026-09-01)", async () => {
    const ctx = makeContext({ auth: principal("user", { userId: VIEWER }), presence: presenceWith([STRANGER]) });

    // Deliberately wide. When the audience narrows, THIS is the assertion that must be edited — alongside
    // `readPresenceDisclosure`, which is the only place the decision lives.
    await expect(caller(ctx).notifications.presence({ userIds: [STRANGER] })).resolves.toEqual({ onlineUserIds: [STRANGER] });
  });

  test("an offline id comes back ABSENT, so a withheld answer and an offline user stay indistinguishable", async () => {
    const ctx = makeContext({ auth: principal("user", { userId: VIEWER }), presence: presenceWith([]) });

    await expect(caller(ctx).notifications.presence({ userIds: [STRANGER] })).resolves.toEqual({ onlineUserIds: [] });
  });

  test("the response carries ONE key — the activity timestamp has no field to ride on", async () => {
    const ctx = makeContext({ auth: principal("user", { userId: VIEWER }), presence: presenceWith([VIEWER]) });

    const answer = await caller(ctx).notifications.presence({ userIds: [VIEWER] });
    expect(Object.keys(answer)).toEqual(["onlineUserIds"]);
    expect(JSON.stringify(answer)).not.toContain("lastSeenAt");
  });

  test("an over-cap ask is refused at the wire, before the registry is read", async () => {
    const registry = presenceWith([]);
    const ctx = makeContext({ auth: principal("user", { userId: VIEWER }), presence: registry });
    const overCap = Array.from({ length: MAX_USER_IDS + 1 }, (_, i) => castId<UserId>(`user_bulk_${i}`));

    await expect(caller(ctx).notifications.presence({ userIds: overCap })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("an EMPTY ask is refused too — a read that names nobody is a malformed ask, not a free sweep", async () => {
    const ctx = makeContext({ auth: principal("user", { userId: VIEWER }), presence: presenceWith([VIEWER]) });

    await expect(caller(ctx).notifications.presence({ userIds: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
