// THE DEFECT #1627 CLOSED, driven end to end on a SINGLE-USER deployment: a durable notification a
// single-human PRODUCER wrote, read back through the real tRPC ladder with `multiHumanCapable: false`.
//
// The sibling unit file (`notifications.test.ts`) proves the ladder reaches the verb with the caller's
// Principal against a mocked service. This one is `.int` on purpose — it uses the REAL notifications
// service over a real db, so the row is genuinely INSERTed by the same `record` verb production calls
// (`entry/compose/automation-plugin.ts::emitNotification` → `notifications.record({ event })` →
// `publishNotification(view)`) and genuinely read back by `list`. Nothing here is a stand-in for the
// producer: the two events below are the exact payloads the crash policy and the auto-disable path emit.
//
// WHY IT IS THE ROW'S SHARPEST EVIDENCE. The belt refused this whole router while the deployment could
// not seat a second human, on the premise that every notification SOURCE was multi-human. Two sources
// refute that premise ON TODAY'S TREE, and both address a SINGLE human:
//   • `plugin-disabled` — `domain/plugin/activation/crash-policy.ts`, recipient = the INSTALLING OWNER,
//     raised when a resident plugin crosses the consecutive-crash threshold and is auto-disabled.
//   • `automation-notice` — `domain/automation/engine/dispatch.ts::notifyAutoDisabled`, recipient = the rule
//     AUTHOR, and the owner-GLOBAL lane carries `chatId: null` — a rule with no room at all, whose
//     auto-disable notice is the ONLY signal that it rotted (the transient bus event is per-chat).
// Before the widening both rows were written, stored, and unreadable: the owner's own `list` answered
// NOT_FOUND. Red-first receipt (2026-09-05, `list` restored to `multiHumanProcedure` by cp/mv):
// "TRPCError: No procedure found on path \"notifications.list\"" on both tests.
//
// OWNER WORD (2026-09-05): "yeah the notifications on single boxes probably needs to be reconsidered now
// that plugins and etc use them." / "probably just make it consistent." — the inbox behaves the SAME on
// every deployment mode, which is what the `multiHumanCapable: false` context here is asserting.

import type { Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createResolveStandingAsks } from "@orb/server/domain/chat";
import type { NotificationsService } from "@orb/server/domain/notifications";
import { createNotificationsService } from "@orb/server/domain/notifications";
import { describe } from "vitest";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

/** The only human on a single-user box — the plugin's installer and the rule's author, at once. */
const SOLO = castId<UserId>("user_solo_owner");

describe("the inbox on a single-user deployment (#1627) — a durable row its own producers wrote", () => {
  /** The real service + a ladder context that says "this deployment cannot seat a second human". */
  async function soloDeployment(db: Parameters<typeof seedUser>[0], now: () => number): Promise<NotificationsService> {
    await seedUser(db, { id: SOLO, handle: castId<Handle>("solo") });
    return createNotificationsService({ db, now, resolveStandingAsks: createResolveStandingAsks(db) });
  }

  test("a plugin the crash policy auto-disabled reaches its OWNER's inbox", async ({ db, clock }) => {
    const notifications = await soloDeployment(db, () => clock.now());
    // Byte-for-byte the crash policy's emit (crash-policy.ts: `ops.notifications.emit({ type:
    // "plugin-disabled", recipientUserId, pluginId })`, which composes onto `record`).
    await notifications.record({ event: { type: "plugin-disabled", recipientUserId: SOLO, pluginId: mintTypeId(ID_PREFIX.plugin) } });

    const ctx = makeContext({ auth: principal("owner", { userId: SOLO }), multiHumanCapable: false, services: { notifications } });
    const inbox = await caller(ctx).notifications.list();

    expect(inbox.items.map((item) => item.type)).toEqual(["plugin-disabled"]);
  });

  test("an owner-GLOBAL automation rule's auto-disable notice reaches its AUTHOR — chatId null, no room anywhere", async ({ db, clock }) => {
    const notifications = await soloDeployment(db, () => clock.now());
    // `notifyAutoDisabled`'s payload for the C5 chat-less lane. `chatId: null` is the whole point: there is
    // no room, no roster and no second human anywhere in this event, so no reading of "multi-human surface"
    // covers it.
    await notifications.record({
      event: {
        type: "automation-notice",
        recipientUserId: SOLO,
        chatId: null,
        source: { kind: "rule", ruleId: mintTypeId(ID_PREFIX.automationRule) },
        message: 'Automation rule "solo" was auto-disabled after 20 consecutive errors.',
      },
    });

    const ctx = makeContext({ auth: principal("owner", { userId: SOLO }), multiHumanCapable: false, services: { notifications } });
    const inbox = await caller(ctx).notifications.list();

    expect(inbox.items[0]?.payload).toMatchObject({ type: "automation-notice", chatId: null });
    // …and the caller can ACT on it: dismissing is the same self-scoped write, equally ungated now.
    const dismissed = await caller(ctx).notifications.dismiss({ notificationId: inbox.items[0]?.id ?? castId("notification_missing") });
    expect(dismissed.dismissedAt).not.toBeNull();
    await expect(caller(ctx).notifications.list()).resolves.toEqual({ items: [], nextCursor: null });
  });
});
