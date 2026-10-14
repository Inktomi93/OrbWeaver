// Actual producers and recipient callers own inbox state; native HTTP bytes remain private observations.

import { CSRF_HEADER } from "@orb/contracts/identity";
import type { InboxView } from "@orb/contracts/notifications";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { streamConnectInputSchema } from "@orb/contracts/stream";
import type { Db } from "@orb/db";
import { notifications } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { readSessionCookie } from "@orb/server/entry/auth";
import { inArray } from "drizzle-orm";
import { vi } from "vitest";
import { makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "./factories/plugin.ts";
import type { ServerTestHarness } from "./server.ts";

export const CORPUS_NOTIFICATION_PASSWORD = "synthetic-notification-reader-password";
type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
type Principal = Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
type Page = Awaited<ReturnType<Caller["notifications"]["list"]>>;
type Invite = Awaited<ReturnType<ServerTestHarness["services"]["chat"]["createInvite"]>>;
interface NotificationStream extends AsyncDisposable {
  readonly socketId: ReturnType<typeof streamConnectInputSchema.parse>["socketId"];
  readonly bytes: () => string;
  readonly readThrough: (needle: string, offset?: number) => Promise<string>;
}
interface NotificationActors {
  readonly host: Principal;
  readonly reader: Principal;
  readonly foreign: Principal;
  readonly caller: Caller;
  readonly foreignCaller: Caller;
}
interface InboxCapture {
  readonly room: Awaited<ReturnType<ServerTestHarness["services"]["chat"]["startChat"]>>;
  readonly invites: readonly Invite[];
  readonly raised: Page;
  readonly foreignBefore: Page;
  readonly foreignAfter: Page;
  readonly pages: readonly Page[];
  readonly foreignDismiss: Error;
  readonly beforeRefusal: Page;
  readonly afterRefusal: Page;
  readonly marked: Awaited<ReturnType<Caller["notifications"]["markAllRead"]>>;
  readonly markedAgain: Awaited<ReturnType<Caller["notifications"]["markAllRead"]>>;
  readonly read: Page;
}
interface ConsentCapture {
  readonly first: InboxView;
  readonly grown: InboxView;
  readonly quiet: InboxView;
  readonly retracted: Page;
  readonly quietBytes: string;
  readonly retractedBytes: string;
}
interface ReaderAdmission {
  readonly cookie: string;
  readonly token: NonNullable<ReturnType<typeof readSessionCookie>>;
  readonly seededPending: Awaited<ReturnType<ServerTestHarness["services"]["plugin"]["list"]>>;
  readonly answeredPending: readonly Awaited<ReturnType<ServerTestHarness["services"]["plugin"]["setGrant"]>>[];
}
interface CorpusNotifications extends Omit<NotificationActors, "caller" | "foreignCaller"> {
  readonly admission: ReaderAdmission;
  readonly inbox: InboxCapture;
  readonly settled: Page;
  readonly nomination: InboxView;
  readonly accepted: Page;
  readonly kicked: InboxView;
  readonly consent: ConsentCapture;
  readonly dismissed: InboxView;
  readonly dismissedAgain: InboxView;
  readonly final: Page;
  readonly finalReplay: Awaited<ReturnType<ServerTestHarness["services"]["notifications"]["replaySince"]>>;
  readonly replay: string;
  readonly resumed: string;
  readonly live: string;
  readonly foreignAttach: Error;
  readonly secrets: readonly string[];
  readonly recipientIds: readonly UserId[];
  readonly rows: readonly (typeof notifications.$inferSelect)[];
  readonly liveSockets: number;
}

/** Retain every canonical row, including dismissed history; do not substitute the active-inbox projection. */
export async function captureCorpusNotificationRows(db: Db, recipientIds: readonly UserId[]): Promise<(typeof notifications.$inferSelect)[]> {
  return await db
    .select()
    .from(notifications)
    .where(inArray(notifications.recipientUserId, [...recipientIds]))
    .orderBy(notifications.recipientUserId, notifications.seq);
}

async function actorsFor(root: ServerTestHarness): Promise<NotificationActors> {
  const admin = await root.internalCallerFor(root.ownerId);
  const reader = await root.actor();
  await admin.admin.resetPassword({ userId: reader.id, password: CORPUS_NOTIFICATION_PASSWORD });
  const host = await root.actor();
  const foreign = await root.actor();
  return {
    host: await root.principalFor(host.id),
    reader: await root.principalFor(reader.id),
    foreign: await root.principalFor(foreign.id),
    caller: await root.internalCallerFor(reader.id),
    foreignCaller: await root.internalCallerFor(foreign.id),
  };
}

async function openStream(
  root: ServerTestHarness,
  caller: Caller,
  auth: { readonly origin: string; readonly cookie: string },
  afterSeq: number,
): Promise<NotificationStream> {
  const { socketId } = streamConnectInputSchema.parse({ socketId: root.ids.uuid() });
  const address = new URL("/api/trpc/stream.connect", auth.origin);
  address.searchParams.set("input", JSON.stringify({ socketId }));
  const stopped = Promise.withResolvers<void>();
  const goDark = root.app.sockets.goDark;
  const observation = vi.spyOn(root.app.sockets, "goDark").mockImplementation((cell, listener): void => {
    goDark.call(root.app.sockets, cell, listener);
    if (cell.socketId === socketId) {
      stopped.resolve();
    }
  });
  const stop = new AbortController();
  const response = await fetch(address, { headers: { cookie: auth.cookie, accept: "text/event-stream" }, signal: stop.signal });
  const reader = response.body?.getReader();
  if (response.status !== 200 || reader === undefined) {
    stop.abort();
    observation.mockRestore();
    throw new Error("native notification subscription did not open its actual body");
  }
  const decoder = new TextDecoder();
  let bytes = "";
  const readThrough = async (needle: string, offset = 0): Promise<string> => {
    while (!bytes.slice(offset).includes(needle)) {
      const next = await reader.read();
      if (next.done) {
        throw new Error("native notification subscription ended before its delivery barrier");
      }
      bytes += decoder.decode(next.value, { stream: true });
    }
    return bytes.slice(offset);
  };
  try {
    await readThrough("serverReady");
    await caller.stream.attach({ socketId, ref: { channel: "notifications" }, sinceSeq: afterSeq });
    await readThrough("attached");
  } catch (error) {
    try {
      await reader.cancel();
    } finally {
      stop.abort();
      reader.releaseLock();
      observation.mockRestore();
    }
    throw error;
  }
  return {
    socketId,
    bytes: () => bytes,
    readThrough,
    async [Symbol.asyncDispose](): Promise<void> {
      try {
        const offset = bytes.length;
        await caller.stream.detach({ socketId, ref: { channel: "notifications" } });
        await readThrough("detached", offset);
      } finally {
        try {
          await reader.cancel();
          stop.abort();
          await stopped.promise;
        } finally {
          stop.abort();
          reader.releaseLock();
          observation.mockRestore();
        }
      }
    },
  };
}

async function inboxFor(root: ServerTestHarness, actors: NotificationActors): Promise<InboxCapture> {
  const room = await root.services.chat.startChat({ principal: actors.host, characterIds: [], opening: "none" });
  const invite = (principal: Principal): Promise<Invite> =>
    root.services.chat.createInvite({ principal: actors.host, chatId: room.chat.id, input: { invitedHandle: principal.handle } });
  const invites = [await invite(actors.reader), await invite(actors.reader), await invite(actors.foreign)];
  const raised = await actors.caller.notifications.list();
  const foreignBefore = await actors.foreignCaller.notifications.list();
  const first = await actors.caller.notifications.list({ limit: 1 });
  if (first.nextCursor === null || raised.items[0] === undefined) {
    throw new Error("native notification producers omitted their required cursor population");
  }
  const pages = [first, await actors.caller.notifications.list({ limit: 1, cursor: first.nextCursor })];
  const beforeRefusal = await actors.caller.notifications.list();
  const foreignDismiss = await actors.foreignCaller.notifications.dismiss({ notificationId: raised.items[0].id }).then(
    () => {
      throw new Error("foreign notification dismissal unexpectedly succeeded");
    },
    (error: Error) => error,
  );
  const afterRefusal = await actors.caller.notifications.list();
  const marked = await actors.caller.notifications.markAllRead();
  const read = await actors.caller.notifications.list();
  const markedAgain = await actors.caller.notifications.markAllRead();
  return {
    room,
    invites,
    raised,
    foreignBefore,
    foreignAfter: await actors.foreignCaller.notifications.list(),
    pages,
    foreignDismiss,
    beforeRefusal,
    afterRefusal,
    marked,
    markedAgain,
    read,
  };
}

async function requiredView(caller: Caller, type: InboxView["type"]): Promise<InboxView> {
  const view = (await caller.notifications.list()).items.find((item) => item.type === type);
  if (view === undefined) {
    throw new Error(`actual notification producer omitted ${type}`);
  }
  return view;
}

async function consentFor(root: ServerTestHarness, actors: NotificationActors, stream: NotificationStream): Promise<ConsentCapture> {
  const pending = async (): Promise<Awaited<ReturnType<typeof seedInstalledPlugin>>> => {
    const manifest = pluginManifestSchema.parse({
      id: `notice-${root.idSource.typeId(ID_PREFIX.plugin).slice(-12)}`,
      name: "Corpus notification consent",
      description: "Requests actual storage consent for the private notification corpus.",
      version: "1.0.0",
      hostVersion: PLUGIN_HOST_VERSIONS[0],
      entry: PLUGIN_MAIN_ENTRY,
      capabilities: ["storage.kv"],
    });
    const installed = await seedInstalledPlugin(root.db, root.services.plugin.install, {
      caller: actors.reader,
      bundle: makePluginBundle(manifest, "const host = orb.host(1);", root.clock.now()),
      grant: [],
    });
    return await seedPluginGrant(root.db, root.services.plugin.setGrant, {
      caller: actors.reader,
      pluginId: installed.plugin.id,
      grant: [],
      acknowledgedNetHosts: [],
    });
  };
  const firstPlugin = await pending();
  const first = await requiredView(actors.caller, "plugins-awaiting-consent");
  await stream.readThrough(first.id);
  const secondPlugin = await pending();
  const grown = await requiredView(actors.caller, "plugins-awaiting-consent");
  await stream.readThrough(grown.id);
  await actors.caller.notifications.markAllRead();
  const quietOffset = stream.bytes().length;
  await seedPluginGrant(root.db, root.services.plugin.setGrant, {
    caller: actors.reader,
    pluginId: firstPlugin.plugin.id,
    grant: firstPlugin.plugin.manifest.capabilities,
    acknowledgedNetHosts: [],
  });
  const quiet = await requiredView(actors.caller, "plugins-awaiting-consent");
  const quietBytes = await stream.readThrough(JSON.stringify(quiet.payload), quietOffset);
  const retractOffset = stream.bytes().length;
  await root.services.plugin.uninstall({ caller: actors.reader, pluginId: secondPlugin.plugin.id });
  const retractedBytes = await stream.readThrough(`"dismissedAt":${String(root.clock.now())}`, retractOffset);
  return { first, grown, quiet, retracted: await actors.caller.notifications.list(), quietBytes, retractedBytes };
}

async function admitReader(root: ServerTestHarness, actors: NotificationActors, origin: string): Promise<ReaderAdmission> {
  const login = await fetch(new URL("/api/auth/login", origin), {
    method: "POST",
    headers: { [CSRF_HEADER]: "1" },
    body: new URLSearchParams({ handle: actors.reader.handle, password: CORPUS_NOTIFICATION_PASSWORD }),
  });
  await login.arrayBuffer();
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (login.status !== 200 || cookie === undefined) {
    throw new Error("native notification reader did not receive its real login cookie");
  }
  const token = readSessionCookie(new Headers({ cookie }), "http");
  if (token === null) {
    throw new Error("native notification login did not supply its canonical session token");
  }
  const authenticated = await fetch(new URL("/api/trpc/notifications.list", origin), { headers: { cookie } });
  await authenticated.arrayBuffer();
  if (authenticated.status !== 200) {
    throw new Error("native notification reader did not enter its authenticated seed lifecycle");
  }
  await root.settleBackground();
  const seededPending = (await root.services.plugin.list({ caller: actors.reader })).filter((plugin) => plugin.reconsentPending);
  const answeredPending: ReaderAdmission["answeredPending"][number][] = [];
  for (const plugin of seededPending) {
    answeredPending.push(
      await root.services.plugin.setGrant({
        caller: actors.reader,
        pluginId: plugin.id,
        grant: plugin.declaredCapabilities,
        acknowledgedNetHosts: plugin.netHosts ?? [],
      }),
    );
  }
  return { cookie, token, seededPending, answeredPending };
}

/** Produce only the selected real notification variants and retain private native lifecycle observations. */
export async function seedCorpusNotifications(root: ServerTestHarness): Promise<CorpusNotifications> {
  const actors = await actorsFor(root);
  const inbox = await inboxFor(root, actors);
  const address = await root.listen();
  const origin = `http://${address.address}:${String(address.port)}`;
  const admission = await admitReader(root, actors, origin);
  const { cookie } = admission;
  let replay: string;
  let foreignAttach: Error;
  const delivered = inbox.raised.items[0];
  if (delivered === undefined) {
    throw new Error("native notification replay has no actual delivery barrier");
  }
  {
    await using stream = await openStream(root, actors.caller, { origin, cookie }, 0);
    foreignAttach = await actors.foreignCaller.stream.attach({ socketId: stream.socketId, ref: { channel: "notifications" } }).then(
      () => {
        throw new Error("foreign notification socket attachment unexpectedly succeeded");
      },
      (error: Error) => error,
    );
    replay = await stream.readThrough(delivered.id);
  }
  const kickRoom = await root.services.chat.startChat({ principal: actors.host, characterIds: [], opening: "none" });
  const late = await root.services.chat.createInvite({ principal: actors.host, chatId: kickRoom.chat.id, input: { invitedHandle: actors.reader.handle } });
  const lateView = await requiredView(actors.caller, "invite");
  const watermark = delivered.seq;
  if (inbox.invites[0] === undefined || inbox.invites[1] === undefined) {
    throw new Error("native notification resume lost its actual delivered watermark");
  }
  let resumed: string;
  let live: string;
  let nomination: InboxView;
  let accepted: Page;
  let kicked: InboxView;
  let consent: ConsentCapture;
  let settled: Page;
  {
    await using stream = await openStream(root, actors.caller, { origin, cookie }, watermark);
    resumed = await stream.readThrough(lateView.id);
    await root.services.chat.acceptInvite({ principal: actors.reader, inviteId: inbox.invites[0].invite.id });
    await root.services.chat.declineInvite({ principal: actors.reader, inviteId: inbox.invites[1].invite.id });
    settled = await actors.caller.notifications.list();
    await root.services.chat.nominateHostHandoff({ principal: actors.host, chatId: inbox.room.chat.id, userId: actors.reader.userId });
    nomination = await requiredView(actors.caller, "handoff-nominated");
    await stream.readThrough(nomination.id);
    await root.services.chat.acceptHostHandoff({ principal: actors.reader, chatId: inbox.room.chat.id });
    accepted = await (await root.internalCallerFor(actors.host.userId)).notifications.list();
    await root.services.chat.acceptInvite({ principal: actors.reader, inviteId: late.invite.id });
    await root.services.chat.kick({ principal: actors.host, chatId: kickRoom.chat.id, userId: actors.reader.userId });
    kicked = await requiredView(actors.caller, "kicked");
    await stream.readThrough(kicked.id);
    consent = await consentFor(root, actors, stream);
    live = stream.bytes();
  }
  const original = inbox.raised.items.at(-1);
  if (original === undefined) {
    throw new Error("native notification disposition lost its original row");
  }
  const dismissed = await actors.caller.notifications.dismiss({ notificationId: original.id });
  const dismissedAgain = await actors.caller.notifications.dismiss({ notificationId: original.id });
  await root.settleBackground();
  const recipientIds = [actors.host.userId, actors.reader.userId, actors.foreign.userId];
  return {
    host: actors.host,
    reader: actors.reader,
    foreign: actors.foreign,
    admission,
    inbox,
    settled,
    nomination,
    accepted,
    kicked,
    consent,
    dismissed,
    dismissedAgain,
    final: await actors.caller.notifications.list(),
    finalReplay: await root.services.notifications.replaySince({ principal: actors.reader, afterSeq: 0 }),
    replay,
    resumed,
    live,
    foreignAttach,
    secrets: [CORPUS_NOTIFICATION_PASSWORD, cookie, admission.token, ...inbox.invites.map((invite) => invite.token), late.token],
    recipientIds,
    rows: await captureCorpusNotificationRows(root.db, recipientIds),
    liveSockets: root.app.sockets.liveSocketCount(),
  };
}
