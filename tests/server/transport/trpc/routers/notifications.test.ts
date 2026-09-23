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
// The inbox CRUD trio is NO LONGER on that belt (#1627 — see the second describe below); `presence` is, and
// its belt row lives with the others in `trpc.test.ts` (the `beltSurfaces` table).

import type { UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { NotificationsService } from "@orb/server/domain/notifications";
import { createPresenceRegistry } from "@orb/server/transport/trpc";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

// MINTED, never readable literals: these ids cross `typeIdSchema` tRPC inputs, which validate the TypeID suffix.
const ID = {
  notificationOwn: mintTypeId(ID_PREFIX.notification),
} as const;

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

// ── #1627 — THE INBOX CRUD TRIO IS NO LONGER MULTI-HUMAN GATED ─────────────────────────────────────────
//
// PD-106's belt covered the whole router because every notification SOURCE was multi-human (invite / kick /
// host-handoff). That premise is dead on this tree: `plugin-disabled` (the crash policy notifying the
// INSTALLING OWNER — `domain/plugin/activation/crash-policy.ts`) and `automation-notice` (the auto-disable
// notice to the rule AUTHOR, including the owner-GLOBAL lane that has no chat at all —
// `domain/automation/engine/dispatch.ts::notifyAutoDisabled`) both write durable inbox rows on a
// single-user deployment, and #1041's plugin-consent prompt joins them. The belt was recording notices the
// only human on the box could never read.
//
// THE RULING SURVIVES — ITS INPUT CHANGED. The mechanism is untouched (`multiHumanProcedure`, the uniform
// NOT_FOUND, the `multi_human_unavailable` security event) and still carries `presence` here plus the whole
// invites router; what changed is WHICH surfaces are multi-human.
//
// WHY WIDENING IS SAFE, stated so it can be checked rather than trusted: none of the three takes a user id,
// so a caller cannot NAME another inbox at the wire, and the verbs scope on `principal.userId` in the
// persistence WHERE clause — `selectInbox` / `markAllReadScoped` / `dismissScoped` all pin
// `recipient_user_id` (`domain/notifications/persistence/queries.ts`), so a foreign row matches nothing and
// `dismiss` collapses to the leak-free NOT_FOUND. That WHERE-clause partition is now the ONLY belt between
// two principals' inboxes, so it is PROBED at the wire (all three, no longer EXEMPT) in
// tests/server/transport/cross-tenant-sweep.suite.int.test.ts.
describe("the inbox CRUD trio on a deployment that cannot seat a second human (#1627)", () => {
  const notCapable = { multiHumanCapable: false, auth: principal("user", { userId: VIEWER }) } as const;

  test("list reaches the caller's OWN inbox, scoped to the resolved principal", async () => {
    const list = vi.fn<NotificationsService["list"]>(() => Promise.resolve({ items: [], nextCursor: null }));
    const ctx = makeContext({ ...notCapable, services: { notifications: { list } } });

    await expect(caller(ctx).notifications.list()).resolves.toEqual({ items: [], nextCursor: null });
    // The scope is not a parameter — it is the seam-resolved Principal the router hands the verb.
    expect(list.mock.calls[0]?.[0]?.principal.userId).toBe(VIEWER);
  });

  test("markAllRead reaches the verb, scoped to the resolved principal", async () => {
    const markAllRead = vi.fn<NotificationsService["markAllRead"]>(() => Promise.resolve({ markedCount: 0 }));
    const ctx = makeContext({ ...notCapable, services: { notifications: { markAllRead } } });

    await expect(caller(ctx).notifications.markAllRead()).resolves.toEqual({ markedCount: 0 });
    expect(markAllRead.mock.calls[0]?.[0]?.principal.userId).toBe(VIEWER);
  });

  test("dismiss reaches the verb with the caller's principal AND the asked id — the pairing IS the belt", async () => {
    const notificationId = ID.notificationOwn;
    // @orb-waive no-test-fabrication(never): the router is a thin pass-through; the returned view is never read by this assertion. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const dismiss = vi.fn<NotificationsService["dismiss"]>(() => Promise.resolve({} as never));
    const ctx = makeContext({ ...notCapable, services: { notifications: { dismiss } } });

    await caller(ctx).notifications.dismiss({ notificationId });
    expect(dismiss.mock.calls[0]?.[0]).toMatchObject({ notificationId, principal: { userId: VIEWER } });
  });

  test("presence STILL refuses as NONEXISTENT — online state about OTHER humans stays the multi-human surface", async () => {
    const read = vi.fn();
    const ctx = makeContext({ ...notCapable, presence: { connect: (): void => undefined, read } });

    await expect(caller(ctx).notifications.presence({ userIds: [STRANGER] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(read).not.toHaveBeenCalled();
  });

  test("the widening is NOT an anonymous bypass — an unauthenticated caller is still refused", async () => {
    const list = vi.fn<NotificationsService["list"]>();
    const ctx = makeContext({ auth: null, multiHumanCapable: false, services: { notifications: { list } } });

    await expect(caller(ctx).notifications.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(list).not.toHaveBeenCalled();
  });
});
