// Actual producers and recipient callers own inbox state; native HTTP bytes remain private observations.

import type { IncomingMessage } from "node:http";
import { request as nodeRequest } from "node:http";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { InboxView } from "@orb/contracts/notifications";
import { AUTOMATION_NOTICE_COOLDOWN_SECONDS, AUTOMATION_NOTICE_MESSAGE_MAX } from "@orb/contracts/notifications";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema, pluginToolWireName } from "@orb/contracts/plugin";
import { streamConnectInputSchema } from "@orb/contracts/stream";
import type { Db } from "@orb/db";
import { notifications } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { PLUGIN_CRASH_DISABLE_THRESHOLD } from "@orb/server/domain/plugin";
import { readSessionCookie } from "@orb/server/entry/auth";
import { inArray } from "drizzle-orm";
import type { CorpusNotificationInbox } from "../iso/corpus.ts";
import { corpusReadInput } from "../iso/corpus.ts";
import { captureCorpusCookieIdentity, seedCorpusAccount } from "./corpus-auth.ts";
import { CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL } from "./corpus-provider.ts";
import { seedAutomationRule, seedAutomationRun } from "./factories/automation.ts";
import { captureChatReplayRows } from "./factories/chat.ts";
import { makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "./factories/plugin.ts";
import type { ServerTestHarness } from "./server.ts";

const CORPUS_NOTIFICATION_PASSWORD = "synthetic-notification-reader-password";
export const CORPUS_NOTIFICATION_RULE_MESSAGE = "The room's ledger is ready for its witnesses.";
export const CORPUS_NOTIFICATION_PLUGIN_MESSAGE = "The resident keeper has checked the ledger.";
export const CORPUS_NOTIFICATION_PLUGIN_ERROR = "Resident keeper refused its scripted invocation.";
const NOTICE_TOOL_NAME = "witness";
type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
type Principal = Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
type Page = Awaited<ReturnType<Caller["notifications"]["list"]>>;
type Invite = Awaited<ReturnType<ServerTestHarness["services"]["chat"]["createInvite"]>>;
interface NotificationStream extends AsyncDisposable {
  readonly socketId: ReturnType<typeof streamConnectInputSchema.parse>["socketId"];
  readonly bytes: () => string;
  readonly readThrough: (needle: string, offset?: number) => Promise<string>;
  readonly physicalState: () => {
    readonly requestDestroyed: boolean;
    readonly responseClosed: boolean;
    readonly responseDestroyed: boolean;
    readonly generatorStopped: boolean;
  };
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
  readonly identity: Awaited<ReturnType<typeof captureCorpusCookieIdentity>>;
  readonly cookie: string;
  readonly token: NonNullable<ReturnType<typeof readSessionCookie>>;
  readonly seededPending: Awaited<ReturnType<ServerTestHarness["services"]["plugin"]["list"]>>;
  readonly answeredPending: readonly Awaited<ReturnType<ServerTestHarness["services"]["plugin"]["setGrant"]>>[];
}
interface ProducerCapture {
  readonly rule: Awaited<ReturnType<typeof seedAutomationRule>>;
  readonly ruleRun: Awaited<ReturnType<typeof seedAutomationRun>>;
  readonly ruleNotice: InboxView;
  readonly plugin: Awaited<ReturnType<typeof seedPluginGrant>>;
  readonly notifyRun: Awaited<ReturnType<typeof seedAutomationRun>>;
  readonly pluginNotice: InboxView;
  readonly failedBeforeClean: Awaited<ReturnType<typeof seedAutomationRun>>;
  readonly clean: Awaited<ReturnType<typeof seedAutomationRun>>;
  readonly cleanView: Awaited<ReturnType<ServerTestHarness["services"]["plugin"]["list"]>>[number];
  readonly crashes: readonly {
    readonly run: Awaited<ReturnType<typeof seedAutomationRun>>;
    readonly view: ProducerCapture["cleanView"];
    readonly disabled: readonly InboxView[];
  }[];
  readonly paused: Awaited<ReturnType<typeof seedAutomationRun>>;
  readonly disabled: InboxView;
  readonly foreignBefore: Page;
  readonly foreignAfter: Page;
  readonly foreignRun: Error;
}
interface DroppedCapture {
  readonly room: Invite["invite"]["chatId"];
  readonly invite: Invite;
  readonly submitted: Awaited<ReturnType<ServerTestHarness["services"]["chat"]["send"]>>;
  readonly queued: Awaited<ReturnType<typeof captureChatReplayRows>>;
  readonly drained: Awaited<ReturnType<ServerTestHarness["services"]["chat"]["drainDeferredTurns"]>>;
  readonly repeated: DroppedCapture["drained"];
  readonly completed: DroppedCapture["queued"];
  readonly notice: InboxView;
}
interface CorpusNotifications extends Omit<NotificationActors, "caller" | "foreignCaller"> {
  readonly publication: CorpusNotificationInbox;
  readonly admission: ReaderAdmission;
  readonly inbox: InboxCapture;
  readonly settled: Page;
  readonly nomination: InboxView;
  readonly accepted: Page;
  readonly kicked: InboxView;
  readonly consent: ConsentCapture;
  readonly producers: ProducerCapture;
  readonly dropped: DroppedCapture;
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
  readonly physicalCloses: readonly ReturnType<NotificationStream["physicalState"]>[];
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
  const reader = await seedCorpusAccount(root);
  await admin.admin.resetPassword({ userId: reader.userId, password: CORPUS_NOTIFICATION_PASSWORD });
  const host = await seedCorpusAccount(root);
  const foreign = await seedCorpusAccount(root);
  return {
    host,
    reader,
    foreign,
    caller: await root.internalCallerFor(reader.userId),
    foreignCaller: await root.internalCallerFor(foreign.userId),
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
  let generatorStopped = false;
  const goDark = root.app.sockets.goDark;
  const observeGoDark: typeof goDark = (cell, listener) => {
    goDark.call(root.app.sockets, cell, listener);
    if (cell.socketId === socketId) {
      generatorStopped = true;
      stopped.resolve();
    }
  };
  Object.assign(root.app.sockets, { goDark: observeGoDark });
  const releaseObservation = (): void => {
    Object.assign(root.app.sockets, { goDark });
  };
  const received = Promise.withResolvers<IncomingMessage>();
  const requestClosed = Promise.withResolvers<void>();
  const request = nodeRequest(address, { headers: { cookie: auth.cookie, accept: "text/event-stream" } }, received.resolve);
  request.once("error", received.reject);
  request.once("close", requestClosed.resolve);
  request.end();
  let response: IncomingMessage;
  try {
    response = await received.promise;
  } catch (error) {
    request.destroy();
    await requestClosed.promise;
    releaseObservation();
    throw error;
  }
  const responseClosed = Promise.withResolvers<void>();
  response.once("close", responseClosed.resolve);
  if (response.statusCode !== 200) {
    response.destroy();
    request.destroy();
    await Promise.all([responseClosed.promise, requestClosed.promise]);
    releaseObservation();
    throw new Error("native notification subscription did not open its actual body");
  }
  let bytes = "";
  let ended = false;
  let failure: Error | undefined;
  let wake: (() => void) | undefined;
  response.setEncoding("utf8");
  response.on("data", (chunk: string): void => {
    bytes += chunk;
    wake?.();
  });
  response.once("error", (error: Error): void => {
    failure = error;
    wake?.();
  });
  response.once("close", (): void => {
    ended = true;
    wake?.();
  });
  const readThrough = async (needle: string, offset = 0): Promise<string> => {
    while (!bytes.slice(offset).includes(needle)) {
      if (failure !== undefined || ended) {
        throw failure ?? new Error("native notification subscription ended before its delivery barrier");
      }
      const next = Promise.withResolvers<void>();
      wake = next.resolve;
      await next.promise;
      wake = undefined;
    }
    return bytes.slice(offset);
  };
  const close = async (): Promise<void> => {
    response.destroy();
    request.destroy();
    await Promise.all([responseClosed.promise, requestClosed.promise]);
    await stopped.promise;
  };
  try {
    await readThrough("serverReady");
    await caller.stream.attach({ socketId, ref: { channel: "notifications" }, sinceSeq: afterSeq });
    await readThrough("attached");
  } catch (error) {
    try {
      await close();
    } finally {
      releaseObservation();
    }
    throw error;
  }
  return {
    socketId,
    bytes: () => bytes,
    readThrough,
    physicalState: () => ({ requestDestroyed: request.destroyed, responseClosed: response.closed, responseDestroyed: response.destroyed, generatorStopped }),
    async [Symbol.asyncDispose](): Promise<void> {
      try {
        const offset = bytes.length;
        await caller.stream.detach({ socketId, ref: { channel: "notifications" } });
        await readThrough("detached", offset);
      } finally {
        try {
          await close();
        } finally {
          releaseObservation();
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
  const raised = await actors.caller.notifications.list(corpusReadInput.notificationInbox());
  const foreignBefore = await actors.foreignCaller.notifications.list(corpusReadInput.notificationInbox());
  const first = await actors.caller.notifications.list({ limit: 1 });
  if (first.nextCursor === null || raised.items[0] === undefined) {
    throw new Error("native notification producers omitted their required cursor population");
  }
  const pages = [first, await actors.caller.notifications.list({ limit: 1, cursor: first.nextCursor })];
  const beforeRefusal = await actors.caller.notifications.list(corpusReadInput.notificationInbox());
  const foreignDismiss = await actors.foreignCaller.notifications.dismiss({ notificationId: raised.items[0].id }).then(
    () => {
      throw new Error("foreign notification dismissal unexpectedly succeeded");
    },
    (error: Error) => error,
  );
  const afterRefusal = await actors.caller.notifications.list(corpusReadInput.notificationInbox());
  const marked = await actors.caller.notifications.markAllRead();
  const read = await actors.caller.notifications.list(corpusReadInput.notificationInbox());
  const markedAgain = await actors.caller.notifications.markAllRead();
  return {
    room,
    invites,
    raised,
    foreignBefore,
    foreignAfter: await actors.foreignCaller.notifications.list(corpusReadInput.notificationInbox()),
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
  const view = (await caller.notifications.list(corpusReadInput.notificationInbox())).items.find((item) => item.type === type);
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
    const installed = await seedInstalledPlugin(root, {
      caller: actors.reader,
      bundle: makePluginBundle(manifest, "const host = orb.host(1);", root.clock.now()),
      grant: [],
    });
    return await seedPluginGrant(root, {
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
  await seedPluginGrant(root, {
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
  return { first, grown, quiet, retracted: await actors.caller.notifications.list(corpusReadInput.notificationInbox()), quietBytes, retractedBytes };
}

async function admitReader(root: ServerTestHarness, actors: NotificationActors, origin: string): Promise<ReaderAdmission> {
  const expected = await actors.caller.sessions.me();
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
  return { cookie, token, identity: await captureCorpusCookieIdentity(root, expected, cookie), seededPending, answeredPending };
}

async function producersFor(
  root: ServerTestHarness,
  actors: NotificationActors,
  chatId: Invite["invite"]["chatId"],
  stream: NotificationStream,
): Promise<ProducerCapture> {
  const automation = root.services.automation;
  const principal = actors.reader;
  const author = { principal, chatId, trigger: { bus: "chat", type: "turnCompleted" }, timeZone: UTC_TIME_ZONE } as const;
  const rule = await seedAutomationRule(root, {
    ...author,
    name: "Corpus room notice",
    cooldownSeconds: AUTOMATION_NOTICE_COOLDOWN_SECONDS,
    actions: [{ type: "post_notification", recipient: "all_members", messageTemplate: CORPUS_NOTIFICATION_RULE_MESSAGE }],
  });
  await automation.setRuleEnabled({ principal, ruleId: rule.id, enabled: true });
  await root.services.chat.startChat({ principal: actors.foreign, characterIds: [], opening: "none" });
  const foreignBefore = await actors.foreignCaller.notifications.list(corpusReadInput.notificationInbox());
  const foreignRun = await automation.runRuleNow({ principal: actors.foreign, ruleId: rule.id }).then(
    () => {
      throw new Error("foreign rule execution unexpectedly succeeded");
    },
    (error: Error) => error,
  );
  const ruleRun = await seedAutomationRun(root, { principal, ruleId: rule.id });
  const ruleNotice = await requiredView(actors.caller, "automation-notice");
  await stream.readThrough(ruleNotice.id);
  const manifest = pluginManifestSchema.parse({
    id: `keeper-${root.idSource.typeId(ID_PREFIX.plugin).slice(-12)}`,
    name: "Corpus resident keeper",
    description: "Produces real participant feedback and resident crash-policy transitions.",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["tools.register", "chat.read", "notify"],
  });
  const source = `const host = orb.host(1);
host.tools.register({ name: ${JSON.stringify(NOTICE_TOOL_NAME)}, description: "Check the private ledger.",
  parameters: { type: "object", properties: { mode: { type: "string" } }, required: ["mode"], additionalProperties: false },
  handler: async (args) => {
    if (args.mode === "crash") throw new Error(${JSON.stringify(CORPUS_NOTIFICATION_PLUGIN_ERROR)});
    if (args.mode === "notify") await host.notifications.post(host.chat.current(), "all_members", ${JSON.stringify(CORPUS_NOTIFICATION_PLUGIN_MESSAGE.repeat(AUTOMATION_NOTICE_MESSAGE_MAX))});
    return "Ledger checked.";
  }
});`;
  const installed = await seedInstalledPlugin(root, {
    caller: principal,
    bundle: makePluginBundle(manifest, source, root.clock.now()),
    grant: [],
  });
  const plugin = await seedPluginGrant(root, {
    caller: principal,
    pluginId: installed.outcome.id,
    grant: manifest.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  const toolName = pluginToolWireName(manifest.id, NOTICE_TOOL_NAME);
  const toolRule = async (mode: string): Promise<Awaited<ReturnType<typeof seedAutomationRule>>> => {
    const row = await seedAutomationRule(root, {
      ...author,
      name: `Corpus resident ${mode}`,
      actions: [{ type: "run_tool", name: toolName, argsTemplate: JSON.stringify({ mode }) }],
    });
    await automation.setRuleEnabled({ principal, ruleId: row.id, enabled: true });
    return row;
  };
  const notifyRule = await toolRule("notify");
  const notifyRun = await seedAutomationRun(root, { principal, ruleId: notifyRule.id });
  const pluginNotice = await requiredView(actors.caller, "automation-notice");
  await stream.readThrough(pluginNotice.id);
  const crashRule = await toolRule("crash");
  const cleanRule = await toolRule("clean");
  const run = (): ReturnType<typeof seedAutomationRun> => seedAutomationRun(root, { principal, ruleId: crashRule.id });
  const view = async (): Promise<ProducerCapture["cleanView"]> => {
    const item = (await root.services.plugin.list({ caller: principal })).find((candidate) => candidate.id === plugin.outcome.id);
    if (item === undefined) {
      throw new Error("resident corpus plugin disappeared from its actual owner view");
    }
    return item;
  };
  const failedBeforeClean = await run();
  const clean = await seedAutomationRun(root, { principal, ruleId: cleanRule.id });
  const cleanView = await view();
  const crashes: ProducerCapture["crashes"][number][] = [];
  for (let count = 0; count < PLUGIN_CRASH_DISABLE_THRESHOLD; count += 1) {
    const outcome = await run();
    crashes.push({
      run: outcome,
      view: await view(),
      disabled: (await actors.caller.notifications.list(corpusReadInput.notificationInbox())).items.filter((item) => item.type === "plugin-disabled"),
    });
  }
  const disabled = await requiredView(actors.caller, "plugin-disabled");
  await stream.readThrough(disabled.id);
  const paused = await run();
  return {
    rule,
    ruleRun,
    ruleNotice,
    plugin,
    notifyRun,
    pluginNotice,
    failedBeforeClean,
    clean,
    cleanView,
    crashes,
    disabled,
    paused,
    foreignRun,
    foreignBefore,
    foreignAfter: await actors.foreignCaller.notifications.list(corpusReadInput.notificationInbox()),
  };
}

async function droppedFor(root: ServerTestHarness, actors: NotificationActors, stream: NotificationStream): Promise<DroppedCapture> {
  const principal = actors.host;
  const caller = await root.internalCallerFor(principal.userId);
  const connection = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: { kind: "generation", generation: { input: ["text"], context: { window: 32_000 } }, features: { detectServer: false } },
  });
  await caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const started = await root.services.chat.startChat({ principal, characterIds: [], opening: "none" });
  const room = started.chat.id;
  const invite = await root.services.chat.createInvite({ principal, chatId: room, input: { invitedHandle: actors.reader.handle } });
  await root.services.chat.acceptInvite({ principal: actors.reader, inviteId: invite.invite.id });
  const submitted = await root.services.chat.send({
    principal: actors.reader,
    chatId: room,
    content: "Please preserve the owed ledger reply.",
    timeZone: UTC_TIME_ZONE,
  });
  const queued = await captureChatReplayRows(root.db, room);
  await root.services.chat.selfLeave({ principal, chatId: room });
  const drained = await root.services.chat.drainDeferredTurns({ hostUserId: principal.userId });
  const notice = await requiredView(actors.caller, "deferred-turn-dropped");
  await stream.readThrough(notice.id);
  const repeated = await root.services.chat.drainDeferredTurns({ hostUserId: principal.userId });
  return { room, invite, submitted, queued, drained, repeated, notice, completed: await captureChatReplayRows(root.db, room) };
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
  const streams: NotificationStream[] = [];
  const delivered = inbox.raised.items[0];
  if (delivered === undefined) {
    throw new Error("native notification replay has no actual delivery barrier");
  }
  {
    await using stream = await openStream(root, actors.caller, { origin, cookie }, 0);
    streams.push(stream);
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
  let producers: ProducerCapture;
  let dropped: DroppedCapture;
  let settled: Page;
  {
    await using stream = await openStream(root, actors.caller, { origin, cookie }, watermark);
    streams.push(stream);
    resumed = await stream.readThrough(lateView.id);
    await root.services.chat.acceptInvite({ principal: actors.reader, inviteId: inbox.invites[0].invite.id });
    await root.services.chat.declineInvite({ principal: actors.reader, inviteId: inbox.invites[1].invite.id });
    settled = await actors.caller.notifications.list(corpusReadInput.notificationInbox());
    await root.services.chat.nominateHostHandoff({ principal: actors.host, chatId: inbox.room.chat.id, userId: actors.reader.userId });
    nomination = await requiredView(actors.caller, "handoff-nominated");
    await stream.readThrough(nomination.id);
    await root.services.chat.acceptHostHandoff({ principal: actors.reader, chatId: inbox.room.chat.id });
    accepted = await (await root.internalCallerFor(actors.host.userId)).notifications.list(corpusReadInput.notificationInbox());
    await root.services.chat.acceptInvite({ principal: actors.reader, inviteId: late.invite.id });
    await root.services.chat.kick({ principal: actors.host, chatId: kickRoom.chat.id, userId: actors.reader.userId });
    kicked = await requiredView(actors.caller, "kicked");
    await stream.readThrough(kicked.id);
    consent = await consentFor(root, actors, stream);
    producers = await producersFor(root, actors, inbox.room.chat.id, stream);
    dropped = await droppedFor(root, actors, stream);
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
  const final = await actors.caller.notifications.list(corpusReadInput.notificationInbox());
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
    producers,
    dropped,
    dismissed,
    dismissedAgain,
    final,
    publication: {
      readerRaised: { viewerUserId: actors.reader.userId, read: { input: corpusReadInput.notificationInbox(), output: inbox.raised } },
      readerRead: { viewerUserId: actors.reader.userId, read: { input: corpusReadInput.notificationInbox(), output: inbox.read } },
      readerSettled: { viewerUserId: actors.reader.userId, read: { input: corpusReadInput.notificationInbox(), output: settled } },
      readerFinal: { viewerUserId: actors.reader.userId, read: { input: corpusReadInput.notificationInbox(), output: final } },
      foreignBefore: { viewerUserId: actors.foreign.userId, read: { input: corpusReadInput.notificationInbox(), output: inbox.foreignBefore } },
      foreignAfter: { viewerUserId: actors.foreign.userId, read: { input: corpusReadInput.notificationInbox(), output: inbox.foreignAfter } },
      hostAccepted: { viewerUserId: actors.host.userId, read: { input: corpusReadInput.notificationInbox(), output: accepted } },
    },
    finalReplay: await root.services.notifications.replaySince({ principal: actors.reader, afterSeq: 0 }),
    replay,
    resumed,
    live,
    foreignAttach,
    secrets: [CORPUS_NOTIFICATION_PASSWORD, cookie, admission.token, ...inbox.invites.map((invite) => invite.token), late.token, dropped.invite.token],
    recipientIds,
    rows: await captureCorpusNotificationRows(root.db, recipientIds),
    liveSockets: root.app.sockets.liveSocketCount(),
    physicalCloses: streams.map((stream) => stream.physicalState()),
  };
}
