import type { InboxView } from "@orb/contracts/notifications";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { actionGroupGeometry } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle } from "@orb/testkit/node/composed";
import type { Locator, Page, TestInfo } from "@playwright/test";
import type { NotificationActionGroupsStory } from "./_ct-stories.tsx";

const STORY = "tests/client/features/notifications/_ct-stories/NotificationActionGroupsStory";
const PLUGIN_NAME = "Observatory collaboration extension for the long-running shared story";
const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop enlarged", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone landscape enlarged", width: 844, viewport: { width: 844, height: 390 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
type Room = Awaited<ReturnType<Caller["chat"]["startChat"]>>["chat"];

interface InboxScenario {
  readonly owner: Caller;
  readonly caller: Caller;
  readonly reader: Awaited<ReturnType<ServerTestHarness["actor"]>>;
  readonly inbox: Awaited<ReturnType<Caller["notifications"]["list"]>>;
  readonly invited: Awaited<ReturnType<Caller["invites"]["createInvite"]>>;
  readonly invitedRoom: Room;
  readonly handedRoom: Room;
}

async function seedInbox(root: ServerTestHarness, appearance: AppearanceSettings): Promise<InboxScenario> {
  const setup = await root.internalCallerFor(root.ownerId);
  await setup.settings.updateAppSettings({ partial: { localMultiUser: true } });
  const owner = await root.internalCallerFor(root.ownerId);
  const reader = await root.actor();
  const caller = await root.internalCallerFor(reader.id);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
  const invitedRoom = (await owner.chat.startChat({ characterIds: [], title: "An invitation to the observatory", opening: "none" })).chat;
  const invited = await owner.invites.createInvite({ chatId: invitedRoom.id, input: { invitedHandle: reader.handle } });
  const handedRoom = (await owner.chat.startChat({ characterIds: [], title: "A room with a pending host decision", opening: "none" })).chat;
  const handoffInvite = await owner.invites.createInvite({ chatId: handedRoom.id, input: { invitedHandle: reader.handle } });
  await caller.invites.acceptInvite({ inviteId: handoffInvite.invite.id });
  for (const item of (await caller.notifications.list({})).items) {
    if (item.payload.type === "invite" && item.payload.inviteId === handoffInvite.invite.id) {
      await caller.notifications.dismiss({ notificationId: item.id });
    }
  }
  await owner.invites.nominateHostHandoff({ chatId: handedRoom.id, userId: reader.id });
  const manifest = pluginManifestSchema.parse({
    id: "inbox-consent-layout",
    name: "Observatory storage",
    description: "A real ungranted storage request.",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["storage.kv"],
  });
  const consent = await caller.plugin.install({
    bundleBase64: Buffer.from(makePluginBundle(manifest, "orb.host(1);", root.clock.now())).toString("base64"),
    grant: [],
  });
  await caller.plugin.setGrant({ pluginId: consent.id, grant: [], acknowledgedNetHosts: [], enable: false });
  const crashManifest = pluginManifestSchema.parse({ ...manifest, id: "inbox-disabled", name: PLUGIN_NAME, capabilities: [] });
  const crashed = await caller.plugin.install({
    bundleBase64: Buffer.from(makePluginBundle(crashManifest, "orb.host(1);", root.clock.now())).toString("base64"),
    grant: [],
  });
  while ((await caller.plugin.list()).find((plugin) => plugin.id === crashed.id)?.status !== "errored") {
    await caller.plugin.reportUiCrash({ pluginId: crashed.id, surfaceId: "observatory", reason: "Scripted external UI realm termination" });
  }
  const kickedRoom = (await owner.chat.startChat({ characterIds: [], title: "A room the reader leaves", opening: "none" })).chat;
  const kickInvite = await owner.invites.createInvite({ chatId: kickedRoom.id, input: { invitedHandle: reader.handle } });
  await caller.invites.acceptInvite({ inviteId: kickInvite.invite.id });
  for (const item of (await caller.notifications.list({})).items) {
    if (item.payload.type === "invite" && item.payload.inviteId === kickInvite.invite.id) {
      await caller.notifications.dismiss({ notificationId: item.id });
    }
  }
  await owner.invites.kick({ chatId: kickedRoom.id, userId: reader.id });
  await caller.notifications.markAllRead();
  const inbox = await caller.notifications.list({});

  return { owner, caller, reader, inbox, invited, invitedRoom, handedRoom };
}

function actionMarker(page: Page, item: InboxView): Locator {
  switch (item.payload.type) {
    case "invite":
      return page.getByRole("button", { name: `Accept invitation from ${item.payload.invitedByHandle}`, exact: true });
    case "handoff-nominated":
      return page.getByRole("button", { name: "Accept the host handoff", exact: true });
    case "plugins-awaiting-consent":
      return page.getByRole("button", { name: "Review what your plugins ask for", exact: true });
    case "plugin-disabled":
      return page.getByRole("button", { name: `Open Plugins — ${PLUGIN_NAME}`, exact: true });
    case "kicked":
      return page.getByRole("button", { name: "Dismiss: You were removed from a chat", exact: true });
    case "automation-notice":
    case "deferred-turn-dropped":
    case "handoff-accepted":
      throw new Error(`Unexpected layout notification: ${item.payload.type}`);
  }
}

async function expectInboxActions(page: Page, items: readonly InboxView[], testInfo: TestInfo): Promise<void> {
  const rows = page.locator('[data-slot="inbox-row"]');
  await expect(rows).toHaveCount(items.length);
  for (const item of items) {
    const row = rows.filter({ has: actionMarker(page, item) });
    await expect(row).toHaveCount(1);
    const buttons = row.getByRole("button");
    await expect(buttons).toHaveCount(item.payload.type === "kicked" ? 1 : 2);
    const controls = await buttons.all();
    const geometry = await actionGroupGeometry(row, controls);
    await testInfo.attach(`${item.payload.type}-action-boxes`, {
      body: JSON.stringify({ notificationId: item.id, ...geometry }),
      contentType: "application/json",
    });
    expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
    for (const [index, button] of controls.entries()) {
      if (index === 0) {
        await button.focus();
      } else {
        await page.keyboard.press("Tab");
      }
      await expect(button).toBeFocused();
    }
  }
}

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });
    test("real invite, handoff, consent, disabled-plugin and informational deliveries retain only their supported actions", async ({
      mount,
      page,
    }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createServerHarness({ startJobs: false, env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" } });
      const { owner, caller, reader, inbox, invited, invitedRoom, handedRoom } = await seedInbox(root, regime.appearance);
      expect(inbox.items.map((item) => item.payload.type).sort()).toEqual(
        ["handoff-nominated", "invite", "kicked", "plugin-disabled", "plugins-awaiting-consent"].sort(),
      );
      const pluginsBefore = await caller.plugin.list();
      const routes = await routeTrpc(page, {
        ...serveCorpusProcedures(caller, [
          "sessions.me",
          "settings.getUserSettings",
          "notifications.list",
          "notifications.markAllRead",
          "notifications.dismiss",
          "plugin.list",
        ]),
        ...serveCorpusProcedures(caller, ["invites.declineInvite", "invites.acceptInvite", "invites.acceptHostHandoff"]),
      });
      await mount<typeof NotificationActionGroupsStory>(STORY, {
        width: regime.width,
        appearance: regime.appearance,
        presentation: regime.coarse ? "sheet" : "bar",
      });
      if (!regime.coarse) {
        await page.getByRole("button", { name: "Notifications", exact: true }).click();
      }
      await expectInboxActions(page, inbox.items, testInfo);
      const acceptHandoff = page.getByRole("button", { name: "Accept the host handoff", exact: true });
      await acceptHandoff.click();
      const disclosure = page.getByRole("alertdialog", { name: "Accept hosting this chat?", exact: true });
      await expect(disclosure).toContainText("Nothing is copied into your library");
      await disclosure.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(disclosure).toHaveCount(0);
      expect(routes.count("invites.acceptHostHandoff")).toBe(0);
      expect((await owner.chat.getChat({ chatId: handedRoom.id })).pendingHostUserId).toBe(reader.id);
      if (!regime.coarse) {
        await page.getByRole("button", { name: "Notifications", exact: true }).click();
      }
      const decline = page.getByRole("button", { name: /^Decline invitation from /u });
      await decline.click();
      await expect(decline).toHaveCount(0);
      expect((await owner.invites.listInvites({ chatId: invitedRoom.id })).find((row) => row.id === invited.invite.id)?.remainingUses).toBe(1);
      const review = page.getByRole("button", { name: "Review what your plugins ask for", exact: true });
      await review.click();
      expect(await caller.plugin.list()).toEqual(pluginsBefore);
      if (!regime.coarse) {
        await page.getByRole("button", { name: "Notifications", exact: true }).click();
      }
      await expect(review).toBeVisible();
      const open = page.getByRole("button", { name: `Open Plugins — ${PLUGIN_NAME}`, exact: true });
      await open.click();
      expect(await caller.plugin.list()).toEqual(pluginsBefore);
      if (!regime.coarse) {
        await page.getByRole("button", { name: "Notifications", exact: true }).click();
      }
      const rows = page.locator('[data-slot="inbox-row"]');
      const dismissals = page.getByRole("button", { name: /^Dismiss: /u });
      while (await dismissals.count()) {
        const before = await rows.count();
        await dismissals.first().click();
        await expect(rows).toHaveCount(before - 1);
      }
      await expect(page.getByText("You're all caught up", { exact: true })).toBeVisible();
      expect(await caller.plugin.list()).toEqual(pluginsBefore);
      expect((await owner.chat.getChat({ chatId: handedRoom.id })).pendingHostUserId).toBe(reader.id);
    });
  });
}
