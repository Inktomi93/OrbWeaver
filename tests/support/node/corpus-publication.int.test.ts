// @subject tests/support/iso/corpus.ts
// @subject tests/support/node/corpus-seed.ts
import "@orb/testkit/node/composed-real.ts";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createCharacterSchema } from "@orb/contracts/character";
import { healthResponseSchema } from "@orb/contracts/diagnostics";
import { closeDb } from "@orb/db";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { createCorpusReadResponder, createCorpusViewerReadResponder } from "@orb/testkit/browser/corpus-read-responder.ts";
import type { CorpusWire } from "@orb/testkit/iso/corpus.ts";
import { hydrateCorpusWire, parseCorpusWire, serializeCorpusWire } from "@orb/testkit/iso/corpus.ts";
import { captureCookieAuth, captureCorpusReads, seedCorpusActors } from "@orb/testkit/node/corpus-seed.ts";
import { seedUserCredential } from "@orb/testkit/node/factories/credentials.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { captureCorpusMemberMessages, seedCorpusChatLifecycle } from "./corpus-chat-lifecycle.ts";
import { CORPUS_CHAT_MODEL, CORPUS_CHAT_REPLY, createCorpusChatWire } from "./corpus-chat-wire.ts";
import { CORPUS_NOTIFICATION_RULE_MESSAGE, seedCorpusNotifications } from "./corpus-notifications.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "./corpus-provider.ts";
import { freshHeldDb } from "./db.ts";

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

test("notification corpus preserves seven actual viewer and lifecycle snapshots in portable bytes", async () => {
  await using root = await createServerHarness({
    secretBoxKey: randomBytes(32),
    authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny" },
    pluginSpawn: spawn,
  });
  const principal = await root.principalFor(root.ownerId);
  await root.services.settings.updateAppSettings({ principal, partial: { privateEndpointAllowlist: [new URL(CORPUS_PROVIDER_ENDPOINT).hostname] } });
  const wire = await publication(root);
  const result = await seedCorpusNotifications(root);
  const secrets = [OWNER_PASSWORD, ...result.secrets];
  const extended = { ...wire, notificationInbox: result.publication };
  const decoded = parseCorpusWire(serializeCorpusWire(extended, secrets));
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
    expect(snapshot.read.input).toBeUndefined();
    expect(createCorpusViewerReadResponder("notifications.list", viewer, snapshot)(undefined)).toEqual(output);
  }
  expect(snapshots.readerRaised.read.output).not.toEqual(snapshots.readerRead.read.output);
  expect(() => createCorpusViewerReadResponder("notifications.list", result.foreign.userId, snapshots.readerRaised)).toThrow("snapshot viewer does not match");
  expect(() => createCorpusReadResponder("notifications.list", [snapshots.readerRaised.read, snapshots.readerRead.read])).toThrow(
    "Conflicting corpus captures",
  );
  const respond = createCorpusViewerReadResponder("notifications.list", result.reader.userId, snapshots.readerRaised);
  expect(() => Reflect.apply(respond, undefined, [null])).toThrow("Uncaptured corpus read");
  const mixed = structuredClone(snapshots);
  Object.assign(mixed.readerRaised, { read: mixed.foreignBefore.read });
  expect(() => serializeCorpusWire({ ...wire, notificationInbox: mixed }, secrets)).toThrow("recipient mismatch");
  const malformed = structuredClone(snapshots);
  Object.assign(malformed.readerRaised.read, { input: null });
  expect(() => serializeCorpusWire(hydrateCorpusWire({ ...wire, notificationInbox: malformed }), secrets)).toThrow("publication recipe");
  const drifted = structuredClone(snapshots);
  Reflect.deleteProperty(drifted.readerFinal.read.output, "nextCursor");
  expect(() => serializeCorpusWire({ ...wire, notificationInbox: drifted }, secrets)).toThrow("nextCursor");
  const credential = await seedUserCredential(root.db, root.services.credentials.add, {
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
    authConfig: { ...authConfigFromEnv(), mode: "local" },
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
  const credential = await seedUserCredential(root.db, root.services.credentials.add, { principal, provider: "custom-openai", key: CORPUS_CHAT_REPLY });
  const secrets = [OWNER_PASSWORD, CORPUS_CHAT_REPLY, credential.row.ciphertext, credential.row.iv, credential.row.tag];
  expect(parseCorpusWire(serializeCorpusWire(base, secrets))).toEqual(base);
  expect(() => serializeCorpusWire(extended, secrets)).toThrow("Corpus publication contains private material");
  expect(wire.remaining()).toBe(0);
});

test("native member publication capture excludes host-only content and below-floor history before fixture selection", async () => {
  await using root = await createServerHarness({ authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny" } });
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
  await using root = await createServerHarness({ secretBoxKey: randomBytes(32), authConfig: { ...authConfigFromEnv(), mode: "local" } });
  const principal = await root.principalFor(root.ownerId);
  const credential = await seedUserCredential(root.db, root.services.credentials.add, { principal, provider: "custom-openai", key: PRIVATE_KEY });
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
  await using root = await createServerHarness({ secretBoxKey: randomBytes(32), authConfig: { ...authConfigFromEnv(), mode: "local" } });
  const principal = await root.principalFor(root.ownerId);
  await seedUserCredential(root.db, root.services.credentials.add, { principal, provider: "custom-openai", key: PRIVATE_KEY });
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
  await using root = await createServerHarness({ secretBoxKey: randomBytes(32), authConfig: { ...authConfigFromEnv(), mode: "local" } });
  const principal = await root.principalFor(root.ownerId);
  await seedUserCredential(root.db, root.services.credentials.add, { principal, provider: "custom-openai", key: PRIVATE_KEY });
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
