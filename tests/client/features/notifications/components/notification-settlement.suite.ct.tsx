// A same-seq settlement invalidates the bell's inbox; reading an ask is not its settlement.

import type { InboxView } from "@orb/contracts/notifications";
import { notificationEventSchema } from "@orb/contracts/notifications";
import type { StreamFrame } from "@orb/contracts/stream";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeOrbSocket } from "../../../../support/node/route-orb-socket.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { STREAM_MUTATION_ROUTES } from "../../../data/bus/fixtures.ts";
import { NotificationBellStory } from "../_ct-stories.tsx";

for (const recovery of ["live", "lag", "reconnect"] as const) {
  test(`consent settlement clears the pending dot and preserves history on ${recovery}`, async ({ mount, page }) => {
    const pending: InboxView = {
      id: mintTypeId(ID_PREFIX.notification),
      type: "plugins-awaiting-consent",
      payload: notificationEventSchema.parse({ type: "plugins-awaiting-consent", recipientUserId: "recipient", pendingCount: 1 }),
      seq: 1,
      readAt: 1_750_000_000_001,
      dismissedAt: null,
      createdAt: 1_750_000_000_000,
      actionable: true,
    };
    const historical: InboxView = {
      ...pending,
      id: mintTypeId(ID_PREFIX.notification),
      seq: 2,
      type: "kicked",
      payload: notificationEventSchema.parse({ type: "kicked", recipientUserId: "recipient", chatId: mintTypeId(ID_PREFIX.chat) }),
      actionable: false,
    };
    const state = { items: [historical, pending] };
    await routeTrpc(page, {
      ...STREAM_MUTATION_ROUTES,
      "notifications.list": () => ({ items: state.items, nextCursor: null }),
    });
    const frames: StreamFrame[] = [];
    if (recovery === "live") {
      frames.push({ channel: "notifications", seq: historical.seq, event: { ...pending, dismissedAt: 1_750_000_000_002, actionable: false } });
    }
    if (recovery === "lag") {
      frames.push({ channel: "control", type: "roomLagged", ref: { channel: "notifications" }, cursor: historical.seq });
    }
    await routeOrbSocket(page, {
      awaitAttaches: 1,
      frames,
      dropFirstConnection: recovery === "reconnect",
    });
    const ready = Promise.withResolvers<void>();
    await page.route("**/api/trpc/**", async (route) => {
      if ((route.request().headers()["accept"] ?? "").includes("text/event-stream")) {
        await ready.promise;
      }
      await route.fallback();
    });
    await mount(<NotificationBellStory />);
    const bell = page.getByRole("button", { name: "Notifications", exact: true });
    await expect(bell.locator('[data-slot="badge"]')).toHaveCount(1);
    await bell.click();
    await expect(page.getByText("One plugin is installed but not allowed to do anything yet")).toBeVisible();
    state.items = [historical];
    ready.resolve();
    await expect(page.getByText("One plugin is installed but not allowed to do anything yet")).toHaveCount(0);
    await expect(bell.locator('[data-slot="badge"]')).toHaveCount(0);
    await expect(page.getByText("You were removed from a chat")).toBeVisible();
  });
}
