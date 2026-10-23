import type { Principal } from "@orb/contracts/identity";
import type { InboxView, NotificationEvent } from "@orb/contracts/notifications";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { ID_PREFIX } from "@orb/kit/ids";
import { test as base } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { makePluginBundle, seedChat, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/composed";

interface NotificationActors {
  readonly host: Principal;
  readonly alice: Principal;
  readonly bob: Principal;
  readonly room: Awaited<ReturnType<typeof seedChat>>["row"];
  readonly aliceRaised: InboxView;
  readonly bobRaised: InboxView;
  readonly aliceInvite: Extract<NotificationEvent, { readonly type: "invite" }>;
  readonly bobInvite: Extract<NotificationEvent, { readonly type: "invite" }>;
}

// Capture the real targeted-invite producer, then clear its delivery without settling the invite.
async function recipientInvite(harness: ServerTestHarness, host: Principal, room: NotificationActors["room"], principal: Principal): Promise<InboxView> {
  const made = await harness.services.chat.createInvite({ principal: host, chatId: room.id, input: { invitedHandle: principal.handle } });
  const page = await harness.services.notifications.list({ principal });
  const raised = page.items.find((item) => item.payload.type === "invite" && item.payload.inviteId === made.invite.id);
  if (raised === undefined || raised.payload.type !== "invite") {
    throw new Error("the production targeted invite did not deliver its notification");
  }
  await harness.services.notifications.markAllRead({ principal });
  await harness.services.notifications.dismiss({ principal, notificationId: raised.id });
  return raised;
}

interface PendingConsent {
  readonly plugin: Awaited<ReturnType<typeof seedInstalledPlugin>>["plugin"];
  readonly view: InboxView;
  readonly event: Extract<NotificationEvent, { readonly type: "plugins-awaiting-consent" }>;
}

interface ConsentSnapshots {
  readonly small: Awaited<ReturnType<typeof pendingConsent>>["event"];
  readonly large: Awaited<ReturnType<typeof pendingConsent>>["event"];
  readonly corrected: Awaited<ReturnType<typeof pendingConsent>>["event"];
  readonly bob: Awaited<ReturnType<typeof pendingConsent>>["event"];
}

interface NotificationDecisions {
  readonly nomination: Extract<NotificationEvent, { readonly type: "handoff-nominated" }>;
  readonly kicked: Extract<NotificationEvent, { readonly type: "kicked" }>;
  readonly host: Principal;
  readonly room: NotificationActors["room"];
}

// A fresh actor founds the room, so production seats it as host.
async function hostedRoom(harness: ServerTestHarness): Promise<{ readonly host: Principal; readonly room: NotificationActors["room"] }> {
  const host = await harness.principalFor((await harness.actor()).id);
  const { row: room } = await seedChat(harness, { principal: host, characterIds: [] });
  return { host, room };
}

async function clearInbox(harness: ServerTestHarness, principal: Principal): Promise<void> {
  await harness.services.notifications.markAllRead({ principal });
  const page = await harness.services.notifications.list({ principal });
  for (const view of page.items) {
    await harness.services.notifications.dismiss({ principal, notificationId: view.id });
  }
}

export const NOTIFICATION_GUEST_SOURCE = "const host = orb.host(1);";

export async function pendingConsent(harness: ServerTestHarness, caller: Principal): Promise<PendingConsent> {
  const manifest = pluginManifestSchema.parse({
    id: `notice-${harness.idSource.typeId(ID_PREFIX.plugin).slice(-12)}`,
    name: "Notification consent fixture",
    description: "Requests a scoped storage grant for the notification control.",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["storage.kv"],
  });
  const installed = await seedInstalledPlugin(harness, {
    caller,
    bundle: makePluginBundle(manifest, NOTIFICATION_GUEST_SOURCE, harness.clock.now()),
    grant: [],
  });
  await seedPluginGrant(harness, {
    caller,
    pluginId: installed.plugin.id,
    grant: [],
    acknowledgedNetHosts: [],
  });
  const page = await harness.services.notifications.list({ principal: caller });
  const [view] = page.items.filter((item) => item.payload.type === "plugins-awaiting-consent");
  if (view === undefined || view.payload.type !== "plugins-awaiting-consent") {
    throw new Error("the real pending grant did not produce its consent notification");
  }
  return { plugin: installed.plugin, view, event: view.payload };
}

export const test = base.extend<{
  notificationActors: NotificationActors;
  consentSnapshots: ConsentSnapshots;
  notificationDecisions: NotificationDecisions;
}>({
  notificationActors: async ({ harness }, use): Promise<void> => {
    const alice = await harness.principalFor((await harness.actor()).id);
    const bob = await harness.principalFor((await harness.actor()).id);
    const { host, room } = await hostedRoom(harness);
    const aliceRaised = await recipientInvite(harness, host, room, alice);
    const bobRaised = await recipientInvite(harness, host, room, bob);
    if (aliceRaised.payload.type !== "invite" || bobRaised.payload.type !== "invite") {
      throw new Error("the actual invite deliveries have different event types");
    }
    await use({ host, alice, bob, room, aliceRaised, bobRaised, aliceInvite: aliceRaised.payload, bobInvite: bobRaised.payload });
  },
  consentSnapshots: async ({ harness, notificationActors: actors }, use): Promise<void> => {
    const first = await pendingConsent(harness, actors.alice);
    const large = await pendingConsent(harness, actors.alice);
    await harness.services.notifications.markAllRead({ principal: actors.alice });
    await seedPluginGrant(harness, {
      caller: actors.alice,
      pluginId: first.plugin.id,
      grant: first.plugin.manifest.capabilities,
      acknowledgedNetHosts: [],
    });
    const [corrected] = (await harness.services.notifications.list({ principal: actors.alice })).items.filter(
      (item) => item.payload.type === "plugins-awaiting-consent",
    );
    if (corrected === undefined || corrected.payload.type !== "plugins-awaiting-consent") {
      throw new Error("the real covering grant did not retain its corrected consent ask");
    }
    const bob = await pendingConsent(harness, actors.bob);
    await clearInbox(harness, actors.alice);
    await clearInbox(harness, actors.bob);
    await use({ small: first.event, large: large.event, corrected: corrected.payload, bob: bob.event });
  },
  notificationDecisions: async ({ harness, notificationActors: actors }, use): Promise<void> => {
    const { host, room } = await hostedRoom(harness);
    const { host: kickHost, room: kickRoom } = await hostedRoom(harness);
    for (const principal of [actors.alice, actors.bob]) {
      const made = await harness.services.chat.createInvite({ principal: host, chatId: room.id, input: { invitedHandle: principal.handle } });
      await harness.services.chat.acceptInvite({ principal, inviteId: made.invite.id });
    }
    await harness.services.chat.nominateHostHandoff({ principal: host, chatId: room.id, userId: actors.alice.userId });
    const [nomination] = (await harness.services.notifications.list({ principal: actors.alice })).items.filter(
      (item) => item.payload.type === "handoff-nominated" && item.payload.chatId === room.id,
    );
    const made = await harness.services.chat.createInvite({ principal: kickHost, chatId: kickRoom.id, input: { invitedHandle: actors.alice.handle } });
    await harness.services.chat.acceptInvite({ principal: actors.alice, inviteId: made.invite.id });
    await harness.services.chat.kick({ principal: kickHost, chatId: kickRoom.id, userId: actors.alice.userId });
    const [kicked] = (await harness.services.notifications.list({ principal: actors.alice })).items.filter(
      (item) => item.payload.type === "kicked" && item.payload.chatId === kickRoom.id,
    );
    if (nomination?.payload.type !== "handoff-nominated" || kicked?.payload.type !== "kicked") {
      throw new Error("the actual nomination or kick omitted its closed notification event");
    }
    await clearInbox(harness, actors.alice);
    await clearInbox(harness, actors.bob);
    await use({ nomination: nomination.payload, kicked: kicked.payload, host, room });
  },
});

export { expect } from "@orb/testkit/node";
