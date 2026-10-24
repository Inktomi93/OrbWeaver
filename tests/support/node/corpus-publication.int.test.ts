// @subject tests/support/iso/corpus.ts
// @subject tests/support/node/corpus-seed.ts
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createCharacterSchema } from "@orb/contracts/character";
import { healthResponseSchema } from "@orb/contracts/diagnostics";
import { closeDb } from "@orb/db";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { CorpusWire } from "../iso/corpus.ts";
import { hydrateCorpusWire, parseCorpusWire, serializeCorpusWire } from "../iso/corpus.ts";
import { createCorpusReadResponder, createCorpusViewerReadResponder } from "../iso/corpus-read-responder.ts";
import { seedCorpusActors } from "./corpus-actors.ts";
import { captureCorpusMemberMessages, seedCorpusChatLifecycle } from "./corpus-chat-lifecycle.ts";
import { CORPUS_CHAT_MODEL, CORPUS_CHAT_REPLY, createCorpusChatWire } from "./corpus-chat-wire.ts";
import { CORPUS_NOTIFICATION_RULE_MESSAGE, seedCorpusNotifications } from "./corpus-notifications.ts";
import { captureCorpusPluginStage, seedCorpusPlugins } from "./corpus-plugin.ts";
import { CORPUS_PLUGIN_OUTPUT_PRIVATE_VALUE } from "./corpus-plugin-outputs.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "./corpus-provider.ts";
import { captureCookieAuth, captureCorpusReads, seedCorpusLibraries } from "./corpus-seed.ts";
import { freshHeldDb } from "./db.ts";
import { seedUserCredential } from "./factories/rows/credentials.ts";
import { expect, test } from "./fixtures.ts";
import type { ServerTestHarness } from "./server.ts";
import { createServerHarness } from "./server.ts";

const PRIVATE_KEY = 'native-publication-"credential"\\959';
const OWNER_PASSWORD = "native-publication-owner-password";

async function publication(root: ServerTestHarness): Promise<CorpusWire> {
  const owner = await root.principalFor(root.ownerId);
  const authentication = await captureCookieAuth(root, owner, OWNER_PASSWORD);
  const caller = await root.internalCallerFor(root.ownerId);
  const solo = await caller.chat.startChat({ characterIds: [], opening: "none" });
  const group = await caller.chat.startChat({ characterIds: [], opening: "none" });
  const document = await caller.databank.createFromText({ name: "Publication witness", text: "The native publication remains intact." });
  const reads = await captureCorpusReads(root, { soloChatId: solo.chat.id, groupChatId: group.chat.id, documentId: document.document.id });
  const health = healthResponseSchema.parse(await (await root.http.request("/healthz")).json());
  return hydrateCorpusWire({ auth: authentication.auth, reads, health });
}

test("portable plugin stages preserve native viewers and finite requests while refusing private guest echoes", async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn, authConfig: { mode: "local" } });
  const wire = await publication(root);
  const recipient = await root.actor();
  const captured = await seedCorpusPlugins(root, recipient.id);
  const extended = { ...wire, pluginLibrary: captured.library };
  const secrets = [OWNER_PASSWORD, ...captured.wirePrivateLiterals];
  const bytes = serializeCorpusWire(extended, secrets);
  const parsed = parseCorpusWire(bytes);
  expect(parsed).toEqual(extended);
  expect(parseCorpusWire(serializeCorpusWire(wire, secrets)).pluginLibrary).toBeUndefined();
  const library = parsed.pluginLibrary;
  if (library === undefined) {
    throw new Error("Portable plugin lifecycle captures disappeared");
  }
  const active = library.ownerActive;
  const state = { viewerUserId: active.viewerUserId, read: active.reads.state };
  const respond = createCorpusViewerReadResponder("plugin.getSurfaceState", root.ownerId, state);
  expect(respond(active.reads.state.input)).toEqual({ entry: "Initial ledger entry" });
  expect(() => createCorpusViewerReadResponder("plugin.getSurfaceState", recipient.id, state)).toThrow("snapshot viewer does not match");
  expect(() => respond(library.recipientActive.reads.state.input)).toThrow("Uncaptured corpus read");
  // Decoded malformed input must not collapse to an inputless native request.
  expect(() => Reflect.apply(createCorpusReadResponder("plugin.list", [active.reads.plugins]), undefined, [{}])).toThrow("Uncaptured corpus read");
  expect(() => createCorpusReadResponder("plugin.getLog", [active.reads.log])({ ...active.reads.log.input, limit: 1 })).toThrow("Uncaptured corpus read");
  expect(() => createCorpusReadResponder("plugin.getSurfaceState", [active.reads.state, library.ownerDisabled.reads.state])).toThrow(
    "Conflicting corpus captures",
  );
  for (const read of ["plugins", "surfaces", "commands", "displayTransforms"] as const) {
    const changed = structuredClone(extended);
    Object.assign(changed.pluginLibrary.ownerActive.reads[read], { input: {} });
    expect(() => serializeCorpusWire(hydrateCorpusWire(changed), secrets)).toThrow("publication recipe");
  }
  for (const read of ["assets", "log", "state"] as const) {
    const changed = structuredClone(extended);
    Object.assign(changed.pluginLibrary.ownerActive.reads[read].input, { pluginId: captured.recipient.outcome.id });
    expect(() => serializeCorpusWire(hydrateCorpusWire(changed), secrets)).toThrow("publication recipe");
  }
  const changedLimit = structuredClone(extended);
  Object.assign(changedLimit.pluginLibrary.ownerActive.reads.log.input, { limit: 1 });
  expect(() => serializeCorpusWire(changedLimit, secrets)).toThrow("publication recipe");
  const changedRoom = structuredClone(extended);
  Object.assign(changedRoom.pluginLibrary.ownerActive.reads.state.input, { chatId: wire.reads["chat.getChat"][0]?.output.id });
  expect(() => serializeCorpusWire(changedRoom, secrets)).toThrow("publication recipe");
  const swapped = structuredClone(extended);
  Object.assign(swapped.pluginLibrary.ownerActive, { viewerUserId: recipient.id });
  expect(() => serializeCorpusWire(swapped, secrets)).toThrow("viewer or lifecycle cohort mismatch");
  const mixed = structuredClone(extended);
  Object.assign(mixed.pluginLibrary.ownerActive.reads.surfaces.output[0] ?? {}, { pluginId: captured.recipient.outcome.id });
  expect(() => serializeCorpusWire(mixed, secrets)).toThrow("registration catalog mismatch");
  const wrongStage = structuredClone(extended);
  Object.assign(wrongStage.pluginLibrary.ownerActive, { reads: wrongStage.pluginLibrary.ownerDisabled.reads });
  expect(() => serializeCorpusWire(wrongStage, secrets)).toThrow("lifecycle stage mismatch");
  const changedAdmin = structuredClone(extended);
  Object.assign(changedAdmin.pluginLibrary.distribution.read, { input: {} });
  expect(() => serializeCorpusWire(changedAdmin, secrets)).toThrow("publication recipe");
  const missingField = structuredClone(extended);
  Reflect.deleteProperty(missingField.pluginLibrary.ownerActive.reads.log.output[0] ?? {}, "level");
  expect(() => serializeCorpusWire(missingField, secrets)).toThrow("level");
  const rpc = await root.internalCallerFor(recipient.id);
  for (const value of [CORPUS_PLUGIN_OUTPUT_PRIVATE_VALUE, JSON.stringify({ echo: CORPUS_PLUGIN_OUTPUT_PRIVATE_VALUE })]) {
    await rpc.plugin.invokeUiCommand({ pluginId: captured.recipient.outcome.id, name: "record", args: "", values: { entry: value }, chatId: null });
    const echoed = await captureCorpusPluginStage(root, recipient.id, library.recipientActive.ids);
    expect(echoed.reads.state.output).toEqual({ args: "", values: { entry: value } });
    const leaked = { ...extended, pluginLibrary: { ...library, recipientActive: echoed } };
    expect(() => serializeCorpusWire(leaked, secrets)).toThrow("Corpus publication contains private material");
    Reflect.deleteProperty(echoed.reads, "commands");
    expect(() => serializeCorpusWire(leaked, secrets)).toThrow("Corpus publication contains private material");
  }
  expect(serializeCorpusWire(extended, secrets)).toBe(bytes);
});

test("portable stats publish final native owner reads with exact request recipes and canonical schemas", async () => {
  const execution = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The keeper preserves the portable stats witness.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    usage: { promptTokens: 40, completionTokens: 15 },
  });
  await using root = await createServerHarness({ providerFetch: execution.execute, authConfig: { mode: "local" } });
  const actors = await seedCorpusActors(root);
  const library = await seedCorpusLibraries(root);
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { currentPersonaId: library.persona.id, defaultPersonaId: library.persona.id } });
  const before = await publication(root);
  expect(Object.hasOwn(before.reads, "stats.overview")).toBe(true);
  expect(before.reads["stats.overview"][0]?.output).toBeNull();
  const turn = await root.services.chat.send({ principal: actors.owner, chatId: library.room.chat.id, content: "Preserve the portable stats witness." });
  expect(turn.aborted).toBe(false);
  expect(turn.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  await root.settleBackground();
  const wire = await publication(root);
  const parsed = parseCorpusWire(serializeCorpusWire(wire, [OWNER_PASSWORD]));
  expect(parsed).toEqual(wire);
  expect(parsed.reads["stats.overview"][0]?.output?.assistantTurns).toBe(1);
  expect(parsed.reads["stats.overview"]).not.toEqual(before.reads["stats.overview"]);
  expect(createCorpusReadResponder("stats.overview", parsed.reads["stats.overview"])(undefined)).toEqual(await caller.stats.overview());
  expect(createCorpusReadResponder("stats.wrapped", parsed.reads["stats.wrapped"])(undefined)).toEqual(await caller.stats.wrapped());
  expect(createCorpusReadResponder("stats.byModel", parsed.reads["stats.byModel"])(undefined)).toEqual(await caller.stats.byModel());
  expect(parsed.reads["stats.byModel"][0]?.output).toEqual(expect.arrayContaining([expect.objectContaining({ model: CORPUS_TEXT_MODEL, tokensOut: 15 })]));
  expect(createCorpusReadResponder("stats.personaUsage", parsed.reads["stats.personaUsage"])(undefined)).toEqual(await caller.stats.personaUsage());
  expect(createCorpusReadResponder("stats.timeseries", parsed.reads["stats.timeseries"])(undefined)).toEqual(await caller.stats.timeseries());
  expect(createCorpusReadResponder("stats.leaderboard", parsed.reads["stats.leaderboard"])(undefined)).toEqual(await caller.stats.leaderboard());
  expect(createCorpusReadResponder("stats.freshness", parsed.reads["stats.freshness"])(undefined)).toEqual(await caller.stats.freshness());
  expect(createCorpusReadResponder("stats.momentum", parsed.reads["stats.momentum"])(undefined)).toEqual(await caller.stats.momentum());
  const latency = createCorpusReadResponder("stats.latency", parsed.reads["stats.latency"]);
  expect(latency({ kind: "owner" })).toEqual(await caller.stats.latency({ kind: "owner" }));
  expect(parsed.reads["stats.latency"].map(({ input }) => input)).toEqual([{ kind: "owner" }]);
  expect(() => latency({ kind: "character", characterId: library.character.id })).toThrow("Uncaptured corpus read");
  expect(() => Reflect.apply(latency, undefined, [null])).toThrow("Uncaptured corpus read");
  expect(() => Reflect.apply(createCorpusReadResponder("stats.overview", parsed.reads["stats.overview"]), undefined, [null])).toThrow("Uncaptured corpus read");
  expect(() => createCorpusReadResponder("stats.byModel", parsed.reads["stats.byModel"])({})).toThrow("Uncaptured corpus read");
  const changed = structuredClone(wire);
  Object.assign(changed.reads["stats.latency"][0] ?? {}, { input: { kind: "character", characterId: library.character.id } });
  expect(() => serializeCorpusWire(hydrateCorpusWire(changed), [OWNER_PASSWORD])).toThrow("publication recipe");
  const malformed = structuredClone(wire);
  Object.assign(malformed.reads["stats.byModel"][0] ?? {}, { input: null });
  expect(() => serializeCorpusWire(hydrateCorpusWire(malformed), [OWNER_PASSWORD])).toThrow("publication recipe");
  const missingField = structuredClone(wire);
  Reflect.deleteProperty(missingField.reads["stats.overview"][0]?.output ?? {}, "tokensOutProvenance");
  expect(() => serializeCorpusWire(missingField, [OWNER_PASSWORD])).toThrow("tokensOutProvenance");
  expect(() => parseCorpusWire(serializeCorpusWire(wire, [OWNER_PASSWORD]).replace('"reads":{', '"reads":{"stats.reconcile":[], '))).toThrow(
    "Unrecognized key",
  );
  const unknownRead = structuredClone(wire);
  Object.assign(unknownRead.reads, { "stats.reconcile": [] });
  expect(() => serializeCorpusWire(unknownRead, [OWNER_PASSWORD])).toThrow("Unrecognized key");
});

test("portable stats reject real label credential echoes before malformed schema diagnostics", async () => {
  await using root = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 1), authConfig: { mode: "local" } });
  await seedCorpusActors(root);
  const principal = await root.principalFor(root.ownerId);
  const credential = await seedUserCredential(root, { principal, provider: "custom-openai", key: PRIVATE_KEY });
  const caller = await root.internalCallerFor(root.ownerId);
  const character = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "stats-publication", name: "Public stats witness", description: "A native stats publication witness." }),
  });
  const room = await caller.chat.startChat({ characterIds: [character.id], opening: "none" });
  await caller.chat.commitMessage({ chatId: room.chat.id, content: "A retained stats witness.", timeZone: UTC_TIME_ZONE });
  const wire = await publication(root);
  const secrets = [PRIVATE_KEY, OWNER_PASSWORD, credential.row.ciphertext, credential.row.iv, credential.row.tag];
  expect(parseCorpusWire(serializeCorpusWire(wire, secrets))).toEqual(wire);
  for (const name of [PRIVATE_KEY, JSON.stringify(PRIVATE_KEY), JSON.stringify({ echo: PRIVATE_KEY })]) {
    await caller.character.update({ characterId: character.id, input: { name } });
    const output = await caller.stats.leaderboard();
    expect(output.rows.find((row) => row.characterId === character.id)?.name).toBe(name);
    const echoed = { ...wire, reads: { ...wire.reads, "stats.leaderboard": [{ input: undefined, output }] } };
    expect(() => serializeCorpusWire(echoed, secrets)).toThrow("Corpus publication contains private material");
    Reflect.deleteProperty(output, "total");
    expect(() => serializeCorpusWire(echoed, secrets)).toThrow("Corpus publication contains private material");
  }
  expect(parseCorpusWire(serializeCorpusWire(wire, secrets))).toEqual(wire);
});

test("notification corpus preserves seven actual viewer and lifecycle snapshots in portable bytes", async () => {
  await using root = await createServerHarness({
    secretBoxKey: randomBytes(32),
    authConfig: { mode: "local", fallback: "deny" },
    pluginSpawn: spawn,
  });
  const principal = await root.principalFor(root.ownerId);
  await root.services.settings.updateAppSettings({ principal, partial: { privateEndpointAllowlist: [new URL(CORPUS_PROVIDER_ENDPOINT).hostname] } });
  const wire = await publication(root);
  const actors = await seedCorpusActors(root);
  const shared = await captureCookieAuth(root, await root.principalFor(actors.secondUserId), "native-shared-publication-password");
  const result = await seedCorpusNotifications(root);
  const readerView = await (await root.internalCallerFor(result.reader.userId)).sessions.me();
  const hostView = await (await root.internalCallerFor(result.host.userId)).sessions.me();
  const secrets = [OWNER_PASSWORD, ...result.secrets, ...shared.secrets];
  const memberIdentities = { notificationReader: result.admission.identity, sharedMember: shared.identity };
  const extended = { ...wire, notificationInbox: result.publication, memberIdentities };
  const decoded = parseCorpusWire(serializeCorpusWire(extended, secrets));
  expect(decoded.memberIdentities).toEqual(memberIdentities);
  expect(readerView).toMatchObject({ userId: result.reader.userId, handle: result.reader.handle, globalRole: "user" });
  expect(memberIdentities.notificationReader.viewer).toEqual(readerView);
  expect(memberIdentities.sharedMember.viewer.userId).toBe(actors.secondUserId);
  const identityRead = { viewerUserId: shared.identity.viewer.userId, read: { input: undefined, output: shared.identity.viewer } };
  expect(createCorpusViewerReadResponder("sessions.me", actors.secondUserId, identityRead)(undefined)).toEqual(shared.identity.viewer);
  expect(() => createCorpusViewerReadResponder("sessions.me", result.reader.userId, identityRead)).toThrow("snapshot viewer does not match");
  const swapped = { notificationReader: shared.identity, sharedMember: result.admission.identity };
  expect(() => serializeCorpusWire({ ...extended, memberIdentities: swapped }, secrets)).toThrow("identity viewer mismatch");
  expect(() => serializeCorpusWire({ ...extended, memberIdentities: { notificationReader: shared.identity, sharedMember: shared.identity } }, secrets)).toThrow(
    "identity cohort mismatch",
  );
  const mismatchedIdentity = structuredClone(extended);
  Object.assign(mismatchedIdentity.memberIdentities.sharedMember.authMe, { role: hostView.globalRole, handle: hostView.handle });
  expect(() => serializeCorpusWire(mismatchedIdentity, secrets)).toThrow("identity response mismatch");
  const driftedIdentity = structuredClone(extended);
  Reflect.deleteProperty(driftedIdentity.memberIdentities.sharedMember.viewer, "globalRole");
  expect(() => serializeCorpusWire(driftedIdentity, secrets)).toThrow("globalRole");
  Object.assign(driftedIdentity.memberIdentities.sharedMember.authMe, { [shared.cookie]: true });
  expect(() => serializeCorpusWire(driftedIdentity, secrets)).toThrow("Corpus publication contains private material");
  const publicBytes = serializeCorpusWire(extended, secrets);
  expect(secrets.some((secret) => publicBytes.includes(secret))).toBe(false);
  for (const identity of Object.values(memberIdentities)) {
    const witness = await seedUserCredential(root, { principal, provider: "custom-openai", key: identity.viewer.handle });
    const knownIdentitySecret = [...secrets, identity.viewer.handle, witness.row.ciphertext, witness.row.iv, witness.row.tag];
    expect(parseCorpusWire(serializeCorpusWire(wire, knownIdentitySecret))).toEqual(wire);
    expect(() => serializeCorpusWire({ ...wire, memberIdentities }, knownIdentitySecret)).toThrow("Corpus publication contains private material");
  }
  const snapshots = decoded.notificationInbox;
  if (snapshots === undefined) {
    throw new Error("portable notification snapshots disappeared");
  }
  expect(snapshots).toEqual(result.publication);
  for (const [snapshot, output, viewer] of [
    [snapshots.readerRaised, result.inbox.raised, result.reader.userId],
    [snapshots.readerRead, result.inbox.read, result.reader.userId],
    [snapshots.readerSettled, result.settled, result.reader.userId],
    [snapshots.readerFinal, result.final, result.reader.userId],
    [snapshots.foreignBefore, result.inbox.foreignBefore, result.foreign.userId],
    [snapshots.foreignAfter, result.inbox.foreignAfter, result.foreign.userId],
    [snapshots.hostAccepted, result.accepted, result.host.userId],
  ] as const) {
    expect(snapshot.viewerUserId).toBe(viewer);
    expect(snapshot.read.input).toEqual({});
    expect(createCorpusViewerReadResponder("notifications.list", viewer, snapshot)({})).toEqual(output);
  }
  expect(snapshots.readerRaised.read.output).not.toEqual(snapshots.readerRead.read.output);
  expect(() => createCorpusViewerReadResponder("notifications.list", result.foreign.userId, snapshots.readerRaised)).toThrow("snapshot viewer does not match");
  expect(() => createCorpusReadResponder("notifications.list", [snapshots.readerRaised.read, snapshots.readerRead.read])).toThrow(
    "Conflicting corpus captures",
  );
  const respond = createCorpusViewerReadResponder("notifications.list", result.reader.userId, snapshots.readerRaised);
  expect(() => respond(undefined)).toThrow("Uncaptured corpus read");
  expect(() => Reflect.apply(respond, undefined, [null])).toThrow("Uncaptured corpus read");
  const mixed = structuredClone(snapshots);
  Object.assign(mixed.readerRaised, { read: mixed.foreignBefore.read });
  expect(() => serializeCorpusWire({ ...wire, notificationInbox: mixed }, secrets)).toThrow("recipient mismatch");
  const malformed = structuredClone(snapshots);
  Object.assign(malformed.readerRaised.read, { input: null });
  expect(() => serializeCorpusWire(hydrateCorpusWire({ ...wire, notificationInbox: malformed }), secrets)).toThrow("publication recipe");
  Object.assign(malformed.readerRaised.read, { input: undefined });
  expect(() => serializeCorpusWire(hydrateCorpusWire({ ...wire, notificationInbox: malformed }), secrets)).toThrow("publication recipe");
  const drifted = structuredClone(snapshots);
  Reflect.deleteProperty(drifted.readerFinal.read.output, "nextCursor");
  expect(() => serializeCorpusWire({ ...wire, notificationInbox: drifted }, secrets)).toThrow("nextCursor");
  const credential = await seedUserCredential(root, {
    principal,
    provider: "custom-openai",
    key: CORPUS_NOTIFICATION_RULE_MESSAGE,
  });
  const known = [...secrets, CORPUS_NOTIFICATION_RULE_MESSAGE, credential.row.ciphertext, credential.row.iv, credential.row.tag];
  expect(parseCorpusWire(serializeCorpusWire(wire, known))).toEqual(wire);
  expect(() => serializeCorpusWire(extended, known)).toThrow("Corpus publication contains private material");
  Object.assign(drifted.readerFinal, { [CORPUS_NOTIFICATION_RULE_MESSAGE]: true });
  expect(() => serializeCorpusWire({ ...wire, notificationInbox: drifted }, known)).toThrow("Corpus publication contains private material");
});

test("portable member snapshots retain held, completed and cancelled native message pages separately", async () => {
  const wire = createCorpusChatWire();
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_CHAT_MODEL, CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: CORPUS_CHAT_REPLY,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    completion: wire.completion,
  });
  const heldDb = await freshHeldDb();
  await using database = new AsyncDisposableStack();
  database.defer(() => closeDb(heldDb.db));
  await using root = await createServerHarness({
    db: heldDb.db,
    secretBoxKey: randomBytes(32),
    providerFetch: wire.wrap(physical.execute),
    authConfig: { mode: "local" },
  });
  const base = await publication(root);
  const actors = await seedCorpusActors(root);
  const lifecycle = await seedCorpusChatLifecycle(root, wire, actors.secondUserId, heldDb);
  const extended = { ...base, chatLifecycleMember: lifecycle.publication };
  const parsed = parseCorpusWire(serializeCorpusWire(extended, [OWNER_PASSWORD]));
  const snapshots = parsed.chatLifecycleMember;
  if (snapshots === undefined) {
    throw new Error("portable member snapshots disappeared");
  }
  expect(snapshots).toEqual(lifecycle.publication);
  expect(snapshots.heldDuring.read.output.messages.map((message) => message.role)).toEqual(["user"]);
  expect(snapshots.heldCompleted.read.output.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  expect(snapshots.abortedDuring.read.output.messages.map((message) => message.role)).toEqual(["user"]);
  expect(snapshots.abortedCompleted.read.output.messages.map((message) => message.role)).toEqual(["user"]);
  expect(lifecycle.aborted.turn.aborted).toBe(true);
  for (const snapshot of Object.values(snapshots)) {
    expect(snapshot.viewerUserId).toBe(actors.secondUserId);
    expect(snapshot.read.input).toEqual({ chatId: snapshot.chatId });
    expect(createCorpusViewerReadResponder("chat.listMessages", actors.secondUserId, snapshot)(snapshot.read.input)).toEqual(snapshot.read.output);
  }
  const respond = createCorpusViewerReadResponder("chat.listMessages", actors.secondUserId, snapshots.heldCompleted);
  expect(() => respond({ chatId: snapshots.abortedCompleted.chatId })).toThrow("Uncaptured corpus read");
  expect(() => Reflect.apply(respond, undefined, [null])).toThrow("Uncaptured corpus read");
  expect(() => createCorpusViewerReadResponder("chat.listMessages", root.ownerId, snapshots.heldCompleted)).toThrow("snapshot viewer does not match");
  expect(() => createCorpusReadResponder("chat.listMessages", [snapshots.heldDuring.read, snapshots.heldCompleted.read])).toThrow(
    "Conflicting corpus captures",
  );
  const changed = structuredClone(snapshots);
  Object.assign(changed.heldCompleted.read, { input: { chatId: changed.heldCompleted.chatId, beforeSeq: 0 } });
  expect(() => serializeCorpusWire(hydrateCorpusWire({ ...base, chatLifecycleMember: changed }), [OWNER_PASSWORD])).toThrow("publication recipe");
  const mixed = structuredClone(snapshots);
  Object.assign(mixed.heldCompleted.read, { output: mixed.abortedCompleted.read.output });
  expect(() => serializeCorpusWire({ ...base, chatLifecycleMember: mixed }, [OWNER_PASSWORD])).toThrow("chat mismatch");
  const drifted = structuredClone(snapshots);
  Reflect.deleteProperty(drifted.heldCompleted.read.output, "identities");
  expect(() => serializeCorpusWire({ ...base, chatLifecycleMember: drifted }, [OWNER_PASSWORD])).toThrow("identities");
  const principal = await root.principalFor(root.ownerId);
  const credential = await seedUserCredential(root, { principal, provider: "custom-openai", key: CORPUS_CHAT_REPLY });
  const secrets = [OWNER_PASSWORD, CORPUS_CHAT_REPLY, credential.row.ciphertext, credential.row.iv, credential.row.tag];
  expect(parseCorpusWire(serializeCorpusWire(base, secrets))).toEqual(base);
  expect(() => serializeCorpusWire(extended, secrets)).toThrow("Corpus publication contains private material");
  expect(wire.remaining()).toBe(0);
});

test("native member publication capture excludes host-only content and below-floor history before fixture selection", async () => {
  await using root = await createServerHarness({ authConfig: { mode: "local", fallback: "deny" } });
  const principal = await root.principalFor(root.ownerId);
  await seedCorpusActors(root);
  const member = await root.actor();
  const foreign = await root.actor();
  const caller = await root.internalCallerFor(root.ownerId);
  const room = await caller.chat.startChat({ characterIds: [], opening: "none" });
  const chatId = room.chat.id;
  const beforeJoin = "A private below-floor publication witness.";
  const atJoin = "A visible join-boundary publication witness.";
  const hidden = "A private hidden-truth publication witness.";
  const belowFloor = await caller.chat.commitMessage({ chatId, content: beforeJoin, timeZone: UTC_TIME_ZONE });
  // D106 is join-inclusive: the row at the captured joinSeq remains visible.
  const boundary = await caller.chat.commitMessage({ chatId, content: atJoin, timeZone: UTC_TIME_ZONE });
  const invite = await root.services.chat.createInvite({ principal, chatId, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: await root.principalFor(member.id), inviteId: invite.invite.id });
  await root.services.chat.setMemberHistoryVisibility({ principal, chatId, userId: member.id, visibility: "from-join" });
  const visible = await caller.chat.commitMessage({ chatId, content: `A public member scene. <lie truth="${hidden}"/>`, timeZone: UTC_TIME_ZONE });
  const host = await caller.chat.listMessages({ chatId });
  expect(JSON.stringify(host)).toContain(beforeJoin);
  expect(JSON.stringify(host)).toContain(hidden);
  const snapshot = await captureCorpusMemberMessages(root, member.id, chatId);
  const bytes = JSON.stringify(snapshot);
  expect(snapshot.read.output.messages).toHaveLength(2);
  expect(snapshot.read.output.messages.map((message) => message.id)).toEqual([...boundary.messages, ...visible.messages].map((message) => message.id));
  expect(host.messages.map((message) => message.id)).toEqual([...belowFloor.messages, ...boundary.messages, ...visible.messages].map((message) => message.id));
  expect(bytes).toContain(atJoin);
  expect(bytes).toContain("A public member scene.");
  expect(bytes).not.toContain(beforeJoin);
  expect(bytes).not.toContain(hidden);
  expect(createCorpusViewerReadResponder("chat.listMessages", member.id, snapshot)({ chatId })).toEqual(snapshot.read.output);
  expect(() => createCorpusViewerReadResponder("chat.listMessages", foreign.id, snapshot)({ chatId })).toThrow("snapshot viewer does not match");
  await expect(captureCorpusMemberMessages(root, foreign.id, chatId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(captureCorpusMemberMessages(root, root.ownerId, chatId)).rejects.toThrow("actual non-host viewer");
});

test("schema-valid raw and JSON-escaped credential echoes from real card writers refuse portable publication", async () => {
  await using root = await createServerHarness({ secretBoxKey: randomBytes(32), authConfig: { mode: "local" } });
  const principal = await root.principalFor(root.ownerId);
  const credential = await seedUserCredential(root, { principal, provider: "custom-openai", key: PRIVATE_KEY });
  const caller = await root.internalCallerFor(root.ownerId);
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "publication-card", name: "Public witness", description: "A native public witness." }),
  });
  const wire = await publication(root);
  const secrets = [PRIVATE_KEY, OWNER_PASSWORD, credential.row.ciphertext, credential.row.iv, credential.row.tag];
  expect(parseCorpusWire(serializeCorpusWire(wire, secrets))).toEqual(wire);
  for (const name of [PRIVATE_KEY, JSON.stringify(PRIVATE_KEY), JSON.stringify({ echo: PRIVATE_KEY })]) {
    await caller.character.update({ characterId: card.id, input: { name } });
    const input = undefined;
    const output = await caller.character.list(input);
    expect(output.items.find((item) => item.id === card.id)?.name).toBe(name);
    const captured = { ...wire, reads: { ...wire.reads, "character.list": [{ input, output }] } };
    expect(() => serializeCorpusWire(captured, secrets)).toThrow("Corpus publication contains private material");
    expect(captured.reads["character.list"][0]?.output).toEqual(output);
  }
});

test("a real document credential echo refuses while a clean sibling retains exact captured requests", async () => {
  await using root = await createServerHarness({ secretBoxKey: randomBytes(32), authConfig: { mode: "local" } });
  const principal = await root.principalFor(root.ownerId);
  await seedUserCredential(root, { principal, provider: "custom-openai", key: PRIVATE_KEY });
  const caller = await root.internalCallerFor(root.ownerId);
  const wire = await publication(root);
  const secrets = [PRIVATE_KEY, OWNER_PASSWORD];
  const publicBytes = serializeCorpusWire(wire, secrets);
  const parsed = parseCorpusWire(publicBytes);
  expect(parsed).toEqual(wire);
  expect(parsed.reads["settings.getUserSettings"][0]?.input).toBeUndefined();
  expect(Object.hasOwn(parsed, "secrets")).toBe(false);
  const document = await caller.databank.createFromText({ name: "Private document witness", text: PRIVATE_KEY });
  const input = { id: document.document.id, includeText: true };
  const output = await caller.databank.get(input);
  expect(output.extractedText).toBe(PRIVATE_KEY);
  expect(() => serializeCorpusWire({ ...wire, reads: { ...wire.reads, "databank.get": [{ input, output }] } }, secrets)).toThrow(
    "Corpus publication contains private material",
  );
  const listed = { input: { cursor: null }, output: await caller.databank.list({ cursor: null }) };
  expect(() => serializeCorpusWire({ ...wire, reads: { ...wire.reads, "databank.list": [listed] } }, secrets)).toThrow(
    "Corpus request does not match its publication recipe",
  );
  // Malformed decoded input bypasses the typed call; null must not select an absent-input recipe.
  const malformed = {
    ...wire,
    reads: { ...wire.reads, "settings.getUserSettings": wire.reads["settings.getUserSettings"].map((capture) => ({ input: null, output: capture.output })) },
  };
  expect(() => Reflect.apply(serializeCorpusWire, undefined, [malformed, secrets])).toThrow("Corpus request does not match its publication recipe");
  expect(serializeCorpusWire(wire, secrets)).toBe(publicBytes);
});

test("known native credential values cannot escape through malformed publication diagnostics", async () => {
  await using root = await createServerHarness({ secretBoxKey: randomBytes(32), authConfig: { mode: "local" } });
  const principal = await root.principalFor(root.ownerId);
  await seedUserCredential(root, { principal, provider: "custom-openai", key: PRIVATE_KEY });
  const wire = await publication(root);
  const secrets = [PRIVATE_KEY, OWNER_PASSWORD];
  const clean = serializeCorpusWire(wire, secrets);
  // Malformed decoded captures can reach publication without passing the typed producer API.
  for (const health of [
    { ...wire.health, [PRIVATE_KEY]: true },
    { ...wire.health, status: PRIVATE_KEY },
  ]) {
    let diagnostic = "";
    try {
      Reflect.apply(serializeCorpusWire, undefined, [{ ...wire, health }, secrets]);
    } catch (error) {
      diagnostic = String(error);
    }
    expect(diagnostic).toBe("Error: Corpus publication contains private material");
    expect(diagnostic).not.toContain(PRIVATE_KEY);
    expect(diagnostic).not.toContain(JSON.stringify(PRIVATE_KEY).slice(1, -1));
  }
  expect(() => Reflect.apply(serializeCorpusWire, undefined, [{ ...wire, health: { ...wire.health, publicExtra: true } }, secrets])).toThrow(
    "Unrecognized key",
  );
  expect(() => Reflect.apply(serializeCorpusWire, undefined, [{ ...wire, health: { ...wire.health, status: "invalid-public-status" } }, secrets])).toThrow(
    "Invalid discriminator value",
  );
  expect(serializeCorpusWire(wire, secrets)).toBe(clean);
});
