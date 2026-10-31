// The planes a library backup carries beside the cards: the owner's persona, world book, global databank
// document and settings values, and a room's prose injections, tag overlay and rpg campaign (game, sheets, hand
// journal, checkpoints). The campaign's cross-references are positions, so a restore into a fresh box re-anchors
// them to the restored rows, and a second restore of the same file writes nothing new.
// @subject packages/server/src/domain/import/loader/import-bundle.ts
// @subject packages/server/src/domain/import/verbs/import-chat-bundle.ts
// @subject packages/server/src/domain/export/verbs/export-chat-bundle.ts
// @subject packages/server/src/domain/rpg/persistence/portability-write.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import { importStartedSchema } from "@orb/contracts/import";
import { createPersonaSchema } from "@orb/contracts/persona";
import type { PortableKind } from "@orb/contracts/portability";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { rpgGameConfigSchema, rpgSnapshotStateSchema } from "@orb/contracts/rpg";
import type { CharacterHandle, ChatId, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PortableChat } from "@orb/server/primitives/serde/chat-bundle";
import { buildChatBundleFile, CHAT_BUNDLE_EXT } from "@orb/server/primitives/serde/chat-bundle";
import { createSeededIds, FROZEN_AT_MS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, seedRpgCheckpoint, seedRpgGame, seedTranscript } from "@orb/testkit/node/composed";

const EXPORT_ROUTE = PORTABILITY_ROUTES.exportLibrary;
const BUNDLE_ROUTE = PORTABILITY_ROUTES.importBundle;
/** Any signed-in request runs the first-login seed; this one reads nothing else. */
const SIGNED_IN_ROUTE = "/api/trpc/sessions.me";
const WORKLOAD_DEADLINE_MS = 60_000;
const SOURCE_ID_CURSOR = 2 ** 29;
const HANDLE = castId<CharacterHandle>("bridge-warden");
const TITLE = "The bridge fell";
const INJECTION = "Keep the tone wry and the stakes personal.";
const TAG = "campaign";
const CHECKPOINT = "before the bridge";
const JOURNAL = "The span gave way under the caravan.";

async function signedInBox(ids?: ReturnType<typeof createSeededIds>): Promise<ServerTestHarness> {
  const root = await createServerHarness({
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
    env: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "owner" },
    ...(ids === undefined ? {} : { ids }),
  });
  expect((await root.http.request(SIGNED_IN_ROUTE)).status).toBe(200);
  await root.settleBackground();
  return root;
}

async function exportLibrary(root: ServerTestHarness, kinds: readonly PortableKind[]): Promise<Uint8Array> {
  const response = await root.http.request(`${EXPORT_ROUTE}?kinds=${kinds.join(",")}`);
  expect(response.status).toBe(200);
  return new Uint8Array(await response.arrayBuffer());
}

async function restore(root: ServerTestHarness, bundle: Uint8Array): Promise<{ readonly status: string; readonly failed: number | undefined }> {
  const response = await root.http.request(BUNDLE_ROUTE, { method: "POST", headers: { [CSRF_HEADER]: "1" }, body: bundle });
  expect(response.status).toBe(202);
  const id: WorkloadId = importStartedSchema.parse(await response.json()).workloadId;
  const run = root.runAdmittedWorkload;
  if (run === undefined) {
    throw new Error("the harness owns workload execution only with startJobs: false");
  }
  await run(id, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
  const row = await root.services.workloads.get({ caller: await root.principalFor(root.ownerId), id });
  if (row.kind !== "import-bundle" || row.poison) {
    throw new Error("the bundle upload left no typed import-bundle workload");
  }
  return { status: row.status, failed: row.result?.failed };
}

/** Everything a restored room carries that the test seeded, read through the product's own verbs. */
async function planesOf(root: ServerTestHarness, chatId: ChatId): Promise<unknown> {
  const caller = await root.internalCallerFor(root.ownerId);
  const tags = await caller.tag.listTags();
  const chatTags = await Promise.all(
    tags.map(async (tag) => ({ name: tag.name, chats: await caller.tag.listAttachedEntities({ tagId: tag.id, targetType: "chat" }) })),
  );
  const game = await caller.rpg.getGame({ chatId });
  return {
    title: (await caller.chat.getChat({ chatId })).title,
    injections: (await caller.chat.listChatInjections({ chatId })).map((row) => row.content),
    chatTagNames: chatTags.filter((tag) => tag.chats.entities.some((entity) => entity.targetId === chatId)).map((tag) => tag.name),
    game: { mode: game.mode, status: game.status },
    checkpoints: (await caller.rpg.listCheckpoints({ chatId })).map((row) => row.label),
    journal: (await caller.rpg.listJournal({ chatId })).map((entry) => entry.title),
  };
}

async function roomsOf(root: ServerTestHarness): Promise<readonly ChatId[]> {
  const caller = await root.internalCallerFor(root.ownerId);
  return (await caller.chat.listChats({ limit: 50 })).items.filter((item) => item.title === TITLE).map((item) => item.id);
}

test("a room's injections, tags and rpg campaign restore into a fresh box, re-anchored to the restored rows, and a second restore adds nothing", async () => {
  await using source = await signedInBox(createSeededIds(SOURCE_ID_CURSOR));
  const owner = await source.principalFor(source.ownerId);
  await source.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ handle: HANDLE, name: "Warden", description: "A warden guards the bridge." }),
  });
  const { chatId } = await seedTranscript(source, {
    ownerId: source.ownerId,
    characterHandles: [HANDLE],
    lines: [
      { role: "user", content: "Do we cross?" },
      { role: "assistant", speakerHandle: HANDLE, content: "The bridge groans." },
    ],
    chat: { title: TITLE },
  });
  const sourceCaller = await source.internalCallerFor(source.ownerId);
  await sourceCaller.chat.setChatInjection({ chatId, position: "in_chat", depth: 4, role: "system", content: INJECTION, order: 2 });
  await source.services.tag.attachChatTagByName({ ownerId: source.ownerId, chatId, tagName: TAG });
  await seedRpgGame(source, { principal: owner, chatId, mode: "lite" });
  // A game has no snapshot until one is written; the hand edit mints the head a checkpoint bookmarks.
  await source.services.rpg.editSnapshot({ principal: owner, chatId, patch: { location: "the broken bridge" } });
  await source.services.rpg.addJournalEntry({ principal: owner, chatId, type: "event", title: JOURNAL, content: "Planks fell into the river." });
  const sourceCheckpoint = await seedRpgCheckpoint(source, { principal: owner, chatId, label: CHECKPOINT });
  const expected = await planesOf(source, chatId);
  expect(expected).toMatchObject({ injections: [INJECTION], chatTagNames: [TAG], checkpoints: [CHECKPOINT], journal: [JOURNAL] });
  const bundle = await exportLibrary(source, ["character", "chat"]);

  await using target = await signedInBox();
  expect(await restore(target, bundle)).toEqual({ status: "succeeded", failed: 0 });
  const [restoredRoom, ...extra] = await roomsOf(target);
  if (restoredRoom === undefined || extra.length > 0) {
    throw new Error("the restore did not land exactly one room");
  }

  expect(await planesOf(target, restoredRoom)).toEqual(expected);
  const targetCaller = await target.internalCallerFor(target.ownerId);
  const [checkpoint] = await targetCaller.rpg.listCheckpoints({ chatId: restoredRoom });
  expect(checkpoint?.id).not.toBe(sourceCheckpoint);
  // The checkpoint's snapshot reference is a position in the file: it only restores if it resolved to the game's own snapshot.
  await target.services.rpg.restoreCheckpoint({
    principal: await target.principalFor(target.ownerId),
    chatId: restoredRoom,
    checkpointId: castId(checkpoint?.id ?? ""),
  });

  expect(await restore(target, bundle)).toEqual({ status: "succeeded", failed: 0 });
  expect(await roomsOf(target)).toEqual([restoredRoom]);
  expect((await targetCaller.chat.listChatInjections({ chatId: restoredRoom })).map((row) => row.content)).toEqual([INJECTION]);
  expect((await targetCaller.rpg.listCheckpoints({ chatId: restoredRoom })).map((row) => row.label)).toEqual([CHECKPOINT]);
  expect((await targetCaller.rpg.listJournal({ chatId: restoredRoom })).map((entry) => entry.title)).toEqual([JOURNAL]);
});

const ANCHORED_TITLE = "The anchored campaign";
const ANCHORED_LOCATION = "the ferry landing";
const ANCHORED_JOURNAL = "The ferry was lost";
const SWIPED_LOCATION = "the bridge that held";
const HAND_EDIT_LOCATION = "the toll house";
// A real hand edit that v0.3.x reused as the checkpoint target, made a minute before the checkpoint.
const EDIT_BEFORE_CHECKPOINT_MS = 60_000;

function line(role: "user" | "assistant", content: string): PortableChat["messages"][number] {
  return {
    role,
    kind: "standard",
    speakerHandle: role === "assistant" ? HANDLE : null,
    personaName: null,
    createdAt: FROZEN_AT_MS,
    selectedIdx: 0,
    variants: [
      {
        idx: 0,
        content,
        model: null,
        provider: null,
        tokensIn: null,
        tokensOut: null,
        tokenProvenance: "unrecorded",
        reasoning: null,
        ttftMs: null,
        genStartedAt: null,
        genFinishedAt: null,
        variableDelta: null,
        metadata: null,
      },
    ],
  };
}

type PortableGame = NonNullable<PortableChat["rpg"]>;

/** One committed turn snapshot at `messages[messageIndex]`'s variant `variantIdx`, recording `location`. */
function turnSnapshot(messageIndex: number, variantIdx: number, location: string): PortableGame["snapshots"][number] {
  return {
    messageIndex,
    variantIdx,
    asOfMessageIndex: null,
    bookmark: false,
    committed: true,
    createdAt: FROZEN_AT_MS,
    state: rpgSnapshotStateSchema.parse({ clock: null, calendarDate: null, weather: null, fieldLocks: null, location }),
  };
}

/** The anchored room around the given transcript and campaign planes. */
function roomBundle(messages: PortableChat["messages"], rpg: Pick<PortableGame, "snapshots" | "journal" | "turnToolCalls" | "checkpoints">): Uint8Array {
  return buildChatBundleFile({
    title: ANCHORED_TITLE,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
    starred: false,
    archived: false,
    compactSummary: null,
    compactedAtSeq: null,
    metadata: null,
    variableValues: null,
    userMacroValues: null,
    anchorPersonaName: null,
    characterHandles: [HANDLE],
    tagNames: [],
    injections: [],
    messages,
    rpg: { mode: "lite", status: "active", sessionNumber: 1, config: rpgGameConfigSchema.parse({}), createdAt: FROZEN_AT_MS, sheets: [], ...rpg },
  });
}

/** A four-message room whose campaign rows are all anchored to `messages[turn]`'s first variant. */
function anchoredBundle(turn: number): Uint8Array {
  const anchor = { messageIndex: turn, variantIdx: 0 };
  return roomBundle(
    [line("user", "Do we cross?"), line("assistant", "The bridge groans."), line("user", "Then the ferry."), line("assistant", "The ferry waits.")],
    {
      snapshots: [turnSnapshot(turn, 0, ANCHORED_LOCATION)],
      journal: [{ type: "event", label: "", title: ANCHORED_JOURNAL, content: "Lost.", ...anchor, sourceMessageIndex: turn, createdAt: FROZEN_AT_MS }],
      turnToolCalls: [{ ...anchor, calls: [{ name: "update_scene", args: "{}", verdict: "applied", issues: [] }], createdAt: FROZEN_AT_MS }],
      checkpoints: [{ snapshotIndex: 0, label: CHECKPOINT, trigger: "manual", createdAt: FROZEN_AT_MS }],
    },
  );
}

/** A committed hand snapshot stamped at `messages[asOfMessageIndex]`, as a file written before bookmarks carries it. */
function handSnapshot(asOfMessageIndex: number, location: string, createdAt: number): PortableGame["snapshots"][number] {
  return { ...turnSnapshot(asOfMessageIndex, 0, location), messageIndex: null, variantIdx: null, asOfMessageIndex, createdAt };
}

/** A two-message room whose assistant turn was swiped: the first variant recorded the saved location, the second
 *  (selected) one the swiped location, plus any `extra` rows; the checkpoint, made at `FROZEN_AT_MS`, names `pinned`. */
function swipedRoomBundle(extra: PortableGame["snapshots"], pinned: number): Uint8Array {
  const first = line("assistant", "The bridge groans.");
  const [variant] = first.variants;
  if (variant === undefined) {
    throw new Error("the assistant line has no variant");
  }
  const swiped = { ...first, selectedIdx: 1, variants: [variant, { ...variant, idx: 1, content: "The bridge holds." }] };
  return roomBundle([line("user", "Do we cross?"), swiped], {
    snapshots: [turnSnapshot(1, 0, ANCHORED_LOCATION), turnSnapshot(1, 1, SWIPED_LOCATION), ...extra],
    journal: [],
    turnToolCalls: [],
    checkpoints: [{ snapshotIndex: pinned, label: CHECKPOINT, trigger: "manual", createdAt: FROZEN_AT_MS }],
  });
}

/** The checkpoint names the first variant's turn snapshot. */
function swipedPinBundle(): Uint8Array {
  return swipedRoomBundle([], 0);
}

/** A v0.3.x file: the checkpoint names its saved copy, a hand row at the turn created with the checkpoint. */
function v03CopyBundle(): Uint8Array {
  return swipedRoomBundle([handSnapshot(1, ANCHORED_LOCATION, FROZEN_AT_MS)], 2);
}

/** The control: the checkpoint names a real hand edit made before it. */
function earlierHandEditBundle(): Uint8Array {
  return swipedRoomBundle([handSnapshot(1, HAND_EDIT_LOCATION, FROZEN_AT_MS - EDIT_BEFORE_CHECKPOINT_MS)], 2);
}

/** Import `bytes` as the owner's only anchored room and return the room's read params. */
async function importAnchoredRoom(root: ServerTestHarness, bytes: Uint8Array): Promise<{ readonly principal: Principal; readonly chatId: ChatId }> {
  const principal = await root.principalFor(root.ownerId);
  await root.services.character.create({ principal, input: createCharacterSchema.parse({ handle: HANDLE, name: "Warden", description: "A warden." }) });
  const chat = root.app.portability.find((entity) => entity.kind === "chat");
  if (chat === undefined) {
    throw new Error("production composition has no chat portability descriptor");
  }
  expect(await chat.importFile(root.ownerId, { filename: `${HANDLE}/legacy${CHAT_BUNDLE_EXT}`, bytes })).toMatchObject({ ok: true, created: true });
  const caller = await root.internalCallerFor(root.ownerId);
  const [room] = (await caller.chat.listChats({ limit: 50 })).items.filter((item) => item.title === ANCHORED_TITLE);
  if (room === undefined) {
    throw new Error("the anchored room did not restore");
  }
  return { principal, chatId: room.id };
}

/** The location the room shows now, then after restoring its only checkpoint. */
async function locationsAroundRestore(
  root: ServerTestHarness,
  params: { readonly principal: Principal; readonly chatId: ChatId },
): Promise<readonly (string | undefined)[]> {
  const current = (await root.services.rpg.getTrackerView(params)).ambient?.location;
  const [checkpoint] = await root.services.rpg.listCheckpoints(params);
  if (checkpoint === undefined) {
    throw new Error("the checkpoint did not restore");
  }
  await root.services.rpg.restoreCheckpoint({ ...params, checkpointId: castId(checkpoint.id) });
  return [current, (await root.services.rpg.getTrackerView(params)).ambient?.location];
}

test("a campaign's turn-anchored rows land on the restored variant of the turn they were exported under, not on another turn's", async () => {
  await using root = await signedInBox();
  const owner = await root.principalFor(root.ownerId);
  await root.services.character.create({ principal: owner, input: createCharacterSchema.parse({ handle: HANDLE, name: "Warden", description: "A warden." }) });
  // The campaign belongs to the second assistant turn (messages[3]); the first assistant turn (messages[1]) is the control.
  const bundle = anchoredBundle(3);
  const chat = root.app.portability.find((entity) => entity.kind === "chat");
  if (chat === undefined) {
    throw new Error("production composition has no chat portability descriptor");
  }

  expect(await chat.importFile(root.ownerId, { filename: `${HANDLE}/anchored${CHAT_BUNDLE_EXT}`, bytes: bundle })).toMatchObject({ ok: true, created: true });

  const caller = await root.internalCallerFor(root.ownerId);
  const [room] = (await caller.chat.listChats({ limit: 50 })).items.filter((item) => item.title === ANCHORED_TITLE);
  if (room === undefined) {
    throw new Error("the anchored room did not restore");
  }
  const params = { principal: owner, chatId: room.id };
  const assistants = (await root.services.chat.listMessages(params)).messages.filter((message) => message.role === "assistant");
  const [first, second] = assistants;
  if (first === undefined || second === undefined) {
    throw new Error("the restored room has no two assistant turns");
  }
  expect(first.selectedVariantId).not.toBe(second.selectedVariantId);

  expect((await root.services.rpg.listTurnToolCalls(params)).map((record) => ({ messageId: record.messageId, variantId: record.variantId }))).toEqual([
    { messageId: second.id, variantId: second.selectedVariantId },
  ]);
  // The snapshot is the head only while its own turn is the selected one, so the read proves it pinned to that variant.
  expect((await root.services.rpg.getTrackerView(params)).ambient).toMatchObject({ location: ANCHORED_LOCATION });
  expect((await root.services.rpg.listJournal(params)).map((entry) => entry.title)).toEqual([ANCHORED_JOURNAL]);
  const [checkpoint] = await root.services.rpg.listCheckpoints(params);
  expect(checkpoint).toMatchObject({ label: CHECKPOINT });
});

test("deleting the turn a restored checkpoint was exported under succeeds, and the checkpoint still restores its saved state", async () => {
  await using root = await signedInBox();
  const owner = await root.principalFor(root.ownerId);
  await root.services.character.create({ principal: owner, input: createCharacterSchema.parse({ handle: HANDLE, name: "Warden", description: "A warden." }) });
  const chat = root.app.portability.find((entity) => entity.kind === "chat");
  if (chat === undefined) {
    throw new Error("production composition has no chat portability descriptor");
  }
  // Every campaign row, the bookmarked snapshot included, is anchored to the first assistant turn (messages[1]).
  expect(await chat.importFile(root.ownerId, { filename: `${HANDLE}/anchored${CHAT_BUNDLE_EXT}`, bytes: anchoredBundle(1) })).toMatchObject({
    ok: true,
    created: true,
  });
  const caller = await root.internalCallerFor(root.ownerId);
  const [room] = (await caller.chat.listChats({ limit: 50 })).items.filter((item) => item.title === ANCHORED_TITLE);
  if (room === undefined) {
    throw new Error("the anchored room did not restore");
  }
  const params = { principal: owner, chatId: room.id };
  const [anchor] = (await root.services.chat.listMessages(params)).messages.filter((message) => message.role === "assistant");
  if (anchor === undefined) {
    throw new Error("the restored room has no assistant turn");
  }

  await root.services.chat.deleteMessages({ ...params, messageIds: [anchor.id] });

  expect((await root.services.chat.listMessages(params)).messages.map((message) => message.id)).not.toContain(anchor.id);
  const [checkpoint] = await root.services.rpg.listCheckpoints(params);
  if (checkpoint === undefined) {
    throw new Error("the checkpoint was lost with its turn");
  }
  await root.services.rpg.restoreCheckpoint({ ...params, checkpointId: castId(checkpoint.id) });
  expect((await root.services.rpg.getTrackerView(params)).ambient).toMatchObject({ location: ANCHORED_LOCATION });
});

test("a restored checkpoint pinned to a swiped-away variant leaves the selected swipe's state current and still restores", async () => {
  await using root = await signedInBox();
  const owner = await root.principalFor(root.ownerId);
  await root.services.character.create({ principal: owner, input: createCharacterSchema.parse({ handle: HANDLE, name: "Warden", description: "A warden." }) });
  const chat = root.app.portability.find((entity) => entity.kind === "chat");
  if (chat === undefined) {
    throw new Error("production composition has no chat portability descriptor");
  }
  expect(await chat.importFile(root.ownerId, { filename: `${HANDLE}/swiped${CHAT_BUNDLE_EXT}`, bytes: swipedPinBundle() })).toMatchObject({
    ok: true,
    created: true,
  });
  const caller = await root.internalCallerFor(root.ownerId);
  const [room] = (await caller.chat.listChats({ limit: 50 })).items.filter((item) => item.title === ANCHORED_TITLE);
  if (room === undefined) {
    throw new Error("the swiped room did not restore");
  }
  const params = { principal: owner, chatId: room.id };

  expect((await root.services.rpg.getTrackerView(params)).ambient).toMatchObject({ location: SWIPED_LOCATION });
  const [checkpoint] = await root.services.rpg.listCheckpoints(params);
  if (checkpoint === undefined) {
    throw new Error("the checkpoint did not restore");
  }
  await root.services.rpg.restoreCheckpoint({ ...params, checkpointId: castId(checkpoint.id) });
  expect((await root.services.rpg.getTrackerView(params)).ambient).toMatchObject({ location: ANCHORED_LOCATION });
});

test("a v0.3.x bundle's checkpoint copy imports as the bookmark, so the later swipe shows and restore brings the copy back", async () => {
  await using root = await signedInBox();
  const params = await importAnchoredRoom(root, v03CopyBundle());
  expect(await locationsAroundRestore(root, params)).toEqual([SWIPED_LOCATION, ANCHORED_LOCATION]);
});

test("a v0.3.x bundle's checkpoint on an earlier hand edit keeps that edit as the room's state", async () => {
  await using root = await signedInBox();
  const params = await importAnchoredRoom(root, earlierHandEditBundle());
  expect(await locationsAroundRestore(root, params)).toEqual([HAND_EDIT_LOCATION, HAND_EDIT_LOCATION]);
});

test("importing a campaign bundle again after the room lost a later message keeps the game and reports nothing lost", async () => {
  await using root = await signedInBox();
  const owner = await root.principalFor(root.ownerId);
  await root.services.character.create({ principal: owner, input: createCharacterSchema.parse({ handle: HANDLE, name: "Warden", description: "A warden." }) });
  // Every campaign row is anchored to messages[1], so the last message (messages[3]) carries none of them.
  const bundle = anchoredBundle(1);
  const chat = root.app.portability.find((entity) => entity.kind === "chat");
  if (chat === undefined) {
    throw new Error("production composition has no chat portability descriptor");
  }
  const file = { filename: `${HANDLE}/anchored${CHAT_BUNDLE_EXT}`, bytes: bundle };
  expect(await chat.importFile(root.ownerId, file)).toMatchObject({ ok: true, created: true });
  const caller = await root.internalCallerFor(root.ownerId);
  const [room] = (await caller.chat.listChats({ limit: 50 })).items.filter((item) => item.title === ANCHORED_TITLE);
  if (room === undefined) {
    throw new Error("the anchored room did not restore");
  }
  const params = { principal: owner, chatId: room.id };
  // The unchanged file lands on its own identity: nothing is created and nothing is noted.
  expect(await chat.importFile(root.ownerId, file)).toEqual({ ok: true, created: false });

  const last = (await root.services.chat.listMessages(params)).messages.at(-1);
  if (last === undefined) {
    throw new Error("the restored room has no messages");
  }
  await caller.chat.deleteMessages({ chatId: room.id, messageIds: [last.id] });

  // The slots no longer align with the file, so the campaign cannot be re-placed; the room still holds its game,
  // so that is not a loss and the import says nothing about one.
  expect(await chat.importFile(root.ownerId, file)).toEqual({ ok: true, created: false });
  expect((await root.services.rpg.listJournal(params)).map((entry) => entry.title)).toEqual([ANCHORED_JOURNAL]);
});

test("an owner's persona, world book, global databank document and settings value restore into a fresh box, and a second restore adds none", async () => {
  await using source = await signedInBox(createSeededIds(SOURCE_ID_CURSOR));
  const owner = await source.principalFor(source.ownerId);
  const sourceCaller = await source.internalCallerFor(source.ownerId);
  await source.services.persona.create({
    principal: owner,
    input: createPersonaSchema.parse({ name: "Backup Persona", description: "Travels in the backup." }),
  });
  await source.services.worldInfo.createBook({ principal: owner, input: { name: "Backup World" } });
  const { document } = await source.services.databank.createFromText({ principal: owner, name: "Field Notes", text: "The kingdom's dusk lasts nine hours." });
  await source.services.databank.attachGlobal({ principal: owner, documentId: document.id });
  // A value off its default, so a restored read proves the value travelled and not only the section.
  await source.services.settings.updateUserSettingsSection({ principal: owner, input: { section: "chat", patch: { continueOnSend: false } } });
  expect((await sourceCaller.settings.getUserSettings()).config.chat.continueOnSend).toBe(false);
  const bundle = await exportLibrary(source, ["persona", "world-info", "databank", "user-settings"]);

  await using target = await signedInBox();
  const targetCaller = await target.internalCallerFor(target.ownerId);
  expect((await targetCaller.settings.getUserSettings()).config.chat.continueOnSend).not.toBe(false);
  const landed = async (): Promise<unknown> => ({
    personas: (await targetCaller.persona.list()).map((persona) => persona.name).filter((name) => name === "Backup Persona"),
    books: (await targetCaller.worldInfo.listBooks()).map((book) => book.name).filter((name) => name === "Backup World"),
    documents: (await targetCaller.databank.list({})).items.map((item) => item.name).filter((name) => name === "Field Notes"),
    globalDocuments: (await targetCaller.databank.listGlobal()).length,
    continueOnSend: (await targetCaller.settings.getUserSettings()).config.chat.continueOnSend,
  });

  expect(await restore(target, bundle)).toEqual({ status: "succeeded", failed: 0 });
  const first = await landed();
  expect(first).toEqual({ personas: ["Backup Persona"], books: ["Backup World"], documents: ["Field Notes"], globalDocuments: 1, continueOnSend: false });
  expect(await restore(target, bundle)).toEqual({ status: "succeeded", failed: 0 });
  expect(await landed()).toEqual(first);
});
