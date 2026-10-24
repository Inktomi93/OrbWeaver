// A library export restored into a fresh box whose owner has signed in once, so the first-login seed has landed
// its plates, cards and rooms before the bundle arrives. The restore keeps every chat with its character and the
// owner's appearance, through the export and import routes and the import workload.
// @subject packages/server/src/domain/import/loader/import-bundle.ts
// @subject packages/server/src/domain/import/substrate/handle.ts
// @subject packages/server/src/domain/import/verbs/import-chat-bundle.ts
// @subject packages/server/src/domain/export/verbs/export-chat-bundle.ts
// @subject packages/server/src/domain/settings/verbs/import-user-settings.ts
// @subject packages/server/src/primitives/serde/card/index.ts
// @subject packages/server/src/domain/export/verbs/export-character.ts
// @subject packages/server/src/domain/assets/verbs/import-asset.ts
// @subject packages/server/src/domain/assets/verbs/import-gallery.ts

import { rm } from "node:fs/promises";
import type { OwnedAssetCursor } from "@orb/contracts/assets";
import { ASSET_LIST_LIMIT_MAX } from "@orb/contracts/assets";
import { CHARACTER_HANDLE_WIRE_KEY, characterCardV3Schema, characterHandleSchema, createCharacterSchema } from "@orb/contracts/character";
import { parseVariantMetadata } from "@orb/contracts/chat";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { portableImageryCallSchema } from "@orb/contracts/imagery";
import { importStartedSchema } from "@orb/contracts/import";
import type { PortableImportOutcome, PortableKind } from "@orb/contracts/portability";
import { PORTABLE_DIRECTORIES } from "@orb/contracts/portability";
import { themeBackgroundSchema } from "@orb/contracts/theme";
import { ASSET_SCHEME, assetIdsInContent } from "@orb/kit/content";
import type { AssetId, CharacterHandle, CharacterId, ChatId, UserId, WorkloadId } from "@orb/kit/ids";
import { castId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { slugifyHandle } from "@orb/kit/slug";
import { buildChatBundleFile, CHAT_BUNDLE_EXT, parseChatBundleFile } from "@orb/server/primitives/serde/chat-bundle";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  createCorpusProviderExecution,
  createServerHarness,
  extractZip,
  makeAssetBytes,
  seedTranscript,
} from "@orb/testkit/node/composed";
import { z } from "zod";

const EXPORT_ROUTE = "/api/export/library";
const BUNDLE_ROUTE = "/api/import/bundle";
/** Any signed-in request runs the first-login seed; this one reads nothing else. */
const SIGNED_IN_ROUTE = "/api/trpc/sessions.me";
const WORKLOAD_DEADLINE_MS = 60_000;
/** Asset ids restore verbatim, so the exporting box mints from its own band. */
const SOURCE_ID_CURSOR = 2 ** 29;
/** A second restore target, which also restores ids it did not mint. */
const THIRD_BOX_ID_CURSOR = 2 ** 30;
const PNG = "image/png";
/** A handle the owner chose, which is not the slug of the character's name. */
const CHOSEN_HANDLE = castId<CharacterHandle>("lantern-warden");
const CHARACTER_NAME = "Keeper";

/** A local box whose loopback requests act as its owner, after that owner's first-login seed has settled. */
async function signedInBox(ids?: ReturnType<typeof createSeededIds>, providerFetch?: typeof fetch): Promise<ServerTestHarness> {
  const root = await createServerHarness({
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
    env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "owner" },
    ...(ids === undefined ? {} : { ids }),
    ...(providerFetch === undefined ? {} : { providerFetch }),
  });
  expect((await root.http.request(SIGNED_IN_ROUTE)).status).toBe(200);
  await root.settleBackground();
  return root;
}

async function exportLibrary(root: ServerTestHarness, kinds?: readonly PortableKind[]): Promise<Uint8Array> {
  const response = await root.http.request(kinds === undefined ? EXPORT_ROUTE : `${EXPORT_ROUTE}?kinds=${kinds.join(",")}`);
  expect(response.status).toBe(200);
  return new Uint8Array(await response.arrayBuffer());
}

/** Upload the bundle and run its import workload to the end; the workload's own status and tallies. */
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

test("a chat restores with its character when the character's handle is not the slug of its name", async () => {
  await using source = await signedInBox(createSeededIds(SOURCE_ID_CURSOR));
  const owner = await source.principalFor(source.ownerId);
  await source.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ handle: CHOSEN_HANDLE, name: CHARACTER_NAME, description: "A keeper tends the orbital ledger." }),
  });
  const lines = [
    { role: "user", content: "Is the ledger balanced?" },
    { role: "assistant", speakerHandle: CHOSEN_HANDLE, content: "Every orbit is accounted for." },
  ] as const;
  await seedTranscript(source, { ownerId: source.ownerId, characterHandles: [CHOSEN_HANDLE], lines });
  const bundle = await exportLibrary(source, ["character", "chat"]);

  await using target = await signedInBox();
  const outcome = await restore(target, bundle);
  const caller = await target.internalCallerFor(target.ownerId);
  const restored = (await caller.character.list({})).items.filter((item) => item.name === CHARACTER_NAME);
  const [character] = restored;
  const rooms = character === undefined ? [] : (await caller.chat.listChats({ characterId: character.id })).items;
  const transcripts = await Promise.all(rooms.map(async (room) => (await caller.chat.listMessages({ chatId: room.id })).messages.map((m) => m.content)));

  expect({ outcome, handles: restored.map((c) => c.handle), transcripts }).toEqual({
    outcome: { status: "succeeded", failed: 0 },
    handles: [CHOSEN_HANDLE],
    transcripts: [lines.map((line) => line.content)],
  });
});

/** A real exported card of a fresh character, as JSON, with its carried handle replaced by `handle`. */
async function cardCarrying(
  root: ServerTestHarness,
  input: { readonly handle: string; readonly name: string; readonly description: string },
  carried: string,
): Promise<Uint8Array> {
  const created = await root.services.character.create({
    principal: await root.principalFor(root.ownerId),
    input: createCharacterSchema.parse({ handle: input.handle, name: input.name, description: input.description }),
  });
  const response = await root.http.request(`/api/export/character/${created.id}?format=json`);
  expect(response.status).toBe(200);
  const card = characterCardV3Schema.parse(await response.json());
  return new TextEncoder().encode(JSON.stringify({ ...card, data: { ...card.data, [CHARACTER_HANDLE_WIRE_KEY]: carried } }));
}

/** Restore one card file through the production character descriptor the bundle loader routes it to. */
async function restoreCard(root: ServerTestHarness, filename: string, bytes: Uint8Array): Promise<PortableImportOutcome> {
  const descriptor = root.app.portability.find((entity) => entity.kind === "character");
  if (descriptor === undefined) {
    throw new Error("production composition has no character portability descriptor");
  }
  return await descriptor.importFile(root.ownerId, { filename, bytes });
}

test("a carried handle that is not a minted slug restores under the name slug, and the next library export still succeeds", async () => {
  await using source = await signedInBox(createSeededIds(SOURCE_ID_CURSOR));
  const card = await cardCarrying(source, { handle: "wanderer", name: "Wanderer", description: "A wanderer maps the outer rings." }, "..");

  await using target = await signedInBox();
  const outcome = await restoreCard(target, "wanderer.json", card);
  const caller = await target.internalCallerFor(target.ownerId);
  const handles = (await caller.character.list({})).items.filter((item) => item.name === "Wanderer").map((item) => item.handle);
  expect({ outcome, handles }).toEqual({ outcome: { ok: true, created: true }, handles: ["wanderer"] });
  await seedTranscript(target, {
    ownerId: target.ownerId,
    characterHandles: [castId<CharacterHandle>("wanderer")],
    lines: [{ role: "user", content: "Where does the ring end?" }],
  });
  expect((await exportLibrary(target, ["character", "chat"])).byteLength).toBeGreaterThan(0);
});

test("two different cards carrying one over-long handle both restore inside the handle cap", async () => {
  const cap = characterHandleSchema.in.maxLength;
  if (cap === null) {
    throw new Error("the handle contract states no length cap");
  }
  await using source = await signedInBox(createSeededIds(SOURCE_ID_CURSOR));
  // At the cap exactly: a collision suffix appended to it would overflow the contract.
  const longHandle = "a".repeat(cap);
  const first = await cardCarrying(source, { handle: "twin", name: "Twin", description: "The elder twin keeps the lamps." }, longHandle);
  const second = await cardCarrying(source, { handle: "twin-b", name: "Twin", description: "The younger twin trims the wicks." }, longHandle);

  await using target = await signedInBox();
  const outcomes = [await restoreCard(target, "twin.json", first), await restoreCard(target, "twin-b.json", second)];
  const handles = (await (await target.internalCallerFor(target.ownerId)).character.list({})).items
    .filter((item) => item.name === "Twin")
    .map((item) => item.handle);

  expect({
    outcomes,
    keptCarried: handles.includes(longHandle),
    distinct: new Set(handles).size,
    withinCap: handles.every((handle) => characterHandleSchema.safeParse(handle).success),
  }).toEqual({
    outcomes: [
      { ok: true, created: true },
      { ok: true, created: true },
    ],
    keptCarried: true,
    distinct: 2,
    withinCap: true,
  });
});

/** The transcript of every room the owner holds with `characterId`, as message contents. */
async function transcriptsOf(root: ServerTestHarness, characterId: CharacterId): Promise<readonly (readonly string[])[]> {
  const caller = await root.internalCallerFor(root.ownerId);
  const rooms = (await caller.chat.listChats({ characterId })).items;
  return await Promise.all(rooms.map(async (room) => (await caller.chat.listMessages({ chatId: room.id })).messages.map((m) => m.content)));
}

/** The owner's characters named `name`, as handle and id, oldest first. */
async function charactersNamed(root: ServerTestHarness, name: string): Promise<readonly { readonly id: CharacterId; readonly handle: string }[]> {
  const items = (await (await root.internalCallerFor(root.ownerId)).character.list({})).items;
  return items.filter((item) => item.name === name).map((item) => ({ id: item.id, handle: item.handle }));
}

test("a chat re-links to a character whose handle slugifyHandle minted, however long or case-folded the name", async () => {
  await using root = await signedInBox();
  const owner = await root.principalFor(root.ownerId);
  // Past the fold's code-point ceiling (a `-<tag>` handle), and an NFKD letter that folds to uppercase.
  const names = ["The Extraordinarily Long-Winded Archivist of the Seventeenth Orbital Library", "ℌello"];
  const handles = names.map((name) => slugifyHandle(name));
  for (const [i, name] of names.entries()) {
    await root.services.character.create({
      principal: owner,
      input: createCharacterSchema.parse({ handle: handles[i], name, description: "A minted handle." }),
    });
  }
  const lines = [{ role: "user", content: "Who keeps the index?" }] as const;
  for (const handle of handles) {
    await seedTranscript(root, { ownerId: root.ownerId, characterHandles: [castId<CharacterHandle>(handle)], lines });
  }
  const restored = await Promise.all(names.map(async (name) => (await charactersNamed(root, name))[0]));

  expect(await Promise.all(restored.map(async (c) => (c === undefined ? null : { handle: c.handle, transcripts: await transcriptsOf(root, c.id) })))).toEqual(
    handles.map((handle) => ({ handle, transcripts: [lines.map((line) => line.content)] })),
  );
});

test("a restored chat binds to its own card when another character already holds that card's handle", async () => {
  await using source = await signedInBox(createSeededIds(SOURCE_ID_CURSOR));
  await source.services.character.create({
    principal: await source.principalFor(source.ownerId),
    input: createCharacterSchema.parse({ handle: CHOSEN_HANDLE, name: CHARACTER_NAME, description: "A keeper tends the orbital ledger." }),
  });
  const lines = [
    { role: "user", content: "Is the ledger balanced?" },
    { role: "assistant", speakerHandle: CHOSEN_HANDLE, content: "Every orbit is accounted for." },
  ] as const;
  await seedTranscript(source, { ownerId: source.ownerId, characterHandles: [CHOSEN_HANDLE], lines });
  const bundle = await exportLibrary(source, ["character", "chat"]);

  await using target = await signedInBox();
  await target.services.character.create({
    principal: await target.principalFor(target.ownerId),
    input: createCharacterSchema.parse({ handle: CHOSEN_HANDLE, name: CHARACTER_NAME, description: "A different keeper, already here." }),
  });
  const outcome = await restore(target, bundle);
  const keepers = await charactersNamed(target, CHARACTER_NAME);

  expect({
    outcome,
    keepers: await Promise.all(keepers.map(async (c) => ({ suffixed: c.handle !== CHOSEN_HANDLE, transcripts: await transcriptsOf(target, c.id) }))),
  }).toEqual({
    outcome: { status: "succeeded", failed: 0 },
    keepers: expect.arrayContaining([
      { suffixed: false, transcripts: [] },
      { suffixed: true, transcripts: [lines.map((line) => line.content)] },
    ]),
  });
  expect(keepers).toHaveLength(2);
});

test("a restored chat binds to the existing character its card deduped onto, under that character's handle", async () => {
  await using source = await signedInBox(createSeededIds(SOURCE_ID_CURSOR));
  const owner = await source.principalFor(source.ownerId);
  const created = await source.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ handle: "warden", name: "Warden", description: "The warden counts the gates." }),
  });
  const card = await source.http.request(`/api/export/character/${created.id}`);
  expect(card.status).toBe(200);
  const firstCard = new Uint8Array(await card.arrayBuffer());
  // Renaming the handle is not a content edit, so the next export still dedups onto the first restore.
  await source.services.character.update({ principal: owner, characterId: created.id, input: { handle: castId<CharacterHandle>("gatekeeper") } });
  const lines = [{ role: "user", content: "How many gates tonight?" }] as const;
  await seedTranscript(source, { ownerId: source.ownerId, characterHandles: [castId<CharacterHandle>("gatekeeper")], lines });
  const bundle = await exportLibrary(source, ["character", "chat"]);

  await using target = await signedInBox();
  expect(await restoreCard(target, "Warden.png", firstCard)).toEqual({ ok: true, created: true });
  const outcome = await restore(target, bundle);
  const wardens = await charactersNamed(target, "Warden");

  expect({
    outcome,
    wardens: await Promise.all(wardens.map(async (c) => ({ handle: c.handle, transcripts: await transcriptsOf(target, c.id) }))),
  }).toEqual({
    outcome: { status: "succeeded", failed: 0 },
    wardens: [{ handle: "warden", transcripts: [lines.map((line) => line.content)] }],
  });
});

test("a chat bundle written before seats carried their card still re-links by handle", async () => {
  await using source = await signedInBox(createSeededIds(SOURCE_ID_CURSOR));
  const owner = await source.principalFor(source.ownerId);
  const keeperAtSource = await source.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ handle: CHOSEN_HANDLE, name: CHARACTER_NAME, description: "A keeper tends the orbital ledger." }),
  });
  const lines = [{ role: "user", content: "Is the ledger balanced?" }] as const;
  await seedTranscript(source, { ownerId: source.ownerId, characterHandles: [CHOSEN_HANDLE], lines });
  const [room] = (await (await source.internalCallerFor(source.ownerId)).chat.listChats({ characterId: keeperAtSource.id })).items;
  const exported = room === undefined ? null : await source.app.exportService.exportChatBundle({ principal: owner, chatId: room.id });
  const parsed = exported === null ? null : parseChatBundleFile(exported.bytes);
  if (parsed === null || !parsed.ok) {
    throw new Error("the production exporter wrote no readable chat bundle");
  }
  const { seatCards, ...older } = parsed.value;
  const cards = await exportLibrary(source, ["character"]);

  await using target = await signedInBox();
  await restore(target, cards);
  const chat = target.app.portability.find((entity) => entity.kind === "chat");
  if (chat === undefined) {
    throw new Error("production composition has no chat portability descriptor");
  }
  const outcome = await chat.importFile(target.ownerId, { filename: `${CHOSEN_HANDLE}/older${CHAT_BUNDLE_EXT}`, bytes: buildChatBundleFile(older) });
  const [keeper] = await charactersNamed(target, CHARACTER_NAME);

  expect({ carried: seatCards?.length, outcome, transcripts: keeper === undefined ? null : await transcriptsOf(target, keeper.id) }).toEqual({
    carried: 1,
    outcome: expect.objectContaining({ ok: true, created: true }),
    transcripts: [lines.map((line) => line.content)],
  });
});

test("a chat bundle naming a synthetic group character's handle never binds to that row", async () => {
  await using root = await signedInBox();
  const owner = await root.principalFor(root.ownerId);
  const hostCard = await root.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ handle: "host", name: "Host", description: "Hosts a room." }),
  });
  await seedTranscript(root, { ownerId: root.ownerId, characterHandles: [castId<CharacterHandle>("host")], lines: [{ role: "user", content: "hello" }] });
  const [room] = (await (await root.internalCallerFor(root.ownerId)).chat.listChats({ characterId: hostCard.id })).items;
  if (room === undefined) {
    throw new Error("the transcript import landed no room");
  }
  const group = await root.services.character.mintSyntheticGroupCharacter({ ownerId: root.ownerId, chatId: room.id });
  const groupHandle = (await root.services.character.get({ principal: owner, characterId: group.characterId })).handle;
  const chat = root.app.portability.find((entity) => entity.kind === "chat");
  const exported = await root.app.exportService.exportChatBundle({ principal: owner, chatId: room.id });
  const parsed = exported === null ? null : parseChatBundleFile(exported.bytes);
  if (chat === undefined || parsed === null || !parsed.ok) {
    throw new Error("the production graph produced no chat bundle or chat descriptor");
  }
  const { seatCards: _seatCards, ...unseated } = parsed.value;
  const bytes = buildChatBundleFile({ ...unseated, title: "group squat", characterHandles: [groupHandle] });

  const outcome = await chat.importFile(root.ownerId, { filename: `${groupHandle}/squat${CHAT_BUNDLE_EXT}`, bytes });
  expect({ ok: outcome.ok, groupRooms: await transcriptsOf(root, group.characterId) }).toEqual({ ok: false, groupRooms: [] });
});

test("a seat's card identity resolves only inside the importing account", async () => {
  await using source = await signedInBox(createSeededIds(SOURCE_ID_CURSOR));
  const made = await source.services.character.create({
    principal: await source.principalFor(source.ownerId),
    input: createCharacterSchema.parse({ handle: CHOSEN_HANDLE, name: CHARACTER_NAME, description: "A keeper tends the orbital ledger." }),
  });
  const card = await source.http.request(`/api/export/character/${made.id}`);
  expect(card.status).toBe(200);
  const cardBytes = new Uint8Array(await card.arrayBuffer());
  await seedTranscript(source, { ownerId: source.ownerId, characterHandles: [CHOSEN_HANDLE], lines: [{ role: "user", content: "theirs" }] });
  const [room] = (await (await source.internalCallerFor(source.ownerId)).chat.listChats({ characterId: made.id })).items;
  const exported =
    room === undefined ? null : await source.app.exportService.exportChatBundle({ principal: await source.principalFor(source.ownerId), chatId: room.id });

  // The owner restores the card the bundle's seat names, so an unscoped identity lookup would find it.
  await using root = await signedInBox();
  expect(await restoreCard(root, "Keeper.png", cardBytes)).toEqual({ ok: true, created: true });
  const [keeper] = await charactersNamed(root, CHARACTER_NAME);
  const chat = root.app.portability.find((entity) => entity.kind === "chat");
  if (keeper === undefined || exported === null || chat === undefined) {
    throw new Error("the production graph produced no seated chat bundle or chat descriptor");
  }
  // The member holds a character, under another handle, so a leaked identity match would have a room to land in.
  const member = await root.actor();
  await root.services.character.create({
    principal: await root.principalFor(member.id),
    input: createCharacterSchema.parse({ handle: "member-card", name: "Member", description: "The member's own card." }),
  });

  const outcome = await chat.importFile(member.id, { filename: `elsewhere/stolen${CHAT_BUNDLE_EXT}`, bytes: exported.bytes });
  // Positive control: the same bundle binds for the owner who holds that card, by identity alone once the
  // owner's copy no longer carries the seat's handle.
  await root.services.character.update({
    principal: await root.principalFor(root.ownerId),
    characterId: keeper.id,
    input: { handle: castId<CharacterHandle>("keeper-elsewhere") },
  });
  const ownCopy = await chat.importFile(root.ownerId, { filename: `elsewhere/own${CHAT_BUNDLE_EXT}`, bytes: exported.bytes });
  expect({
    member: outcome.ok,
    // A lookup that crossed the account would hand the owner's character id to the member's write, whose own
    // ownership belt then names it in the member's report.
    namesOwnerCard: !outcome.ok && outcome.error.includes(keeper.id),
    owner: ownCopy.ok,
    ownerRooms: (await transcriptsOf(root, keeper.id)).length,
  }).toEqual({ member: false, namesOwnerCard: false, owner: true, ownerRooms: 1 });
});

/** A SillyTavern card its author starred, whose embedded book carries a description. */
const ARCHIVIST = "Archivist";
// The SillyTavern wire spells its keys in snake_case, so the card is written as the bytes a user would drop in.
const STARRED_CARD = `{"spec":"chara_card_v3","spec_version":"3.0","data":{"name":"${ARCHIVIST}","description":"An archivist of the outer stacks.","first_mes":"Welcome to the stacks.","alternate_greetings":["Mind the dust."],"extensions":{"fav":true,"talkativeness":"0.7"},"character_book":{"name":"Archive Book","description":"What the archivist remembers.","entries":[{"keys":["lantern"],"content":"The lantern burns amber.","insertion_order":10,"enabled":true,"id":0,"extensions":{}}]}}}`;

/** Every content hash the owner holds, through the owned-asset read the library uses. */
async function ownedAssetHashes(root: ServerTestHarness): Promise<Set<string>> {
  const caller = await root.internalCallerFor(root.ownerId);
  const hashes = new Set<string>();
  let cursor: OwnedAssetCursor | undefined;
  for (;;) {
    const page = await caller.assets.listOwned({ limit: ASSET_LIST_LIMIT_MAX, ...(cursor === undefined ? {} : { cursor }) });
    for (const item of page) {
      hashes.add(item.hash);
    }
    const last = page.at(-1);
    if (page.length < ASSET_LIST_LIMIT_MAX || last === undefined) {
      return hashes;
    }
    cursor = { uploadedAt: last.uploadedAt, assetId: last.assetId };
  }
}

// A restore into a box that already holds the card dedups onto it only when the two identities match, so one
// character per box after every crossing is the identity holding across exports.
test("a restored card keeps its import identity through the next export and restore, whatever its star", async () => {
  await using source = await signedInBox(createSeededIds(SOURCE_ID_CURSOR));
  expect(await restoreCard(source, "archivist.json", new TextEncoder().encode(STARRED_CARD))).toEqual({ ok: true, created: true });
  const sourceBundle = await exportLibrary(source);

  await using target = await signedInBox();
  await restore(target, sourceBundle);
  const [restored] = await charactersNamed(target, ARCHIVIST);
  if (restored === undefined) {
    throw new Error("the restore landed no archivist");
  }
  // A star is the owner's mark on the library, not card content.
  await target.services.character.update({ principal: await target.principalFor(target.ownerId), characterId: restored.id, input: { starred: true } });
  const targetBundle = await exportLibrary(target);

  await using third = await signedInBox(createSeededIds(THIRD_BOX_ID_CURSOR));
  await restore(third, targetBundle);
  const [sourceAssets, targetAssets, thirdAssets] = [await ownedAssetHashes(source), await ownedAssetHashes(target), await ownedAssetHashes(third)];
  // The target's own re-export, now starred, back into the target.
  await restore(target, targetBundle);
  await restore(source, targetBundle);

  expect({
    charactersPerBox: [
      (await charactersNamed(source, ARCHIVIST)).length,
      (await charactersNamed(target, ARCHIVIST)).length,
      (await charactersNamed(third, ARCHIVIST)).length,
    ],
    assetsLost: [[...sourceAssets].filter((hash) => !targetAssets.has(hash)), [...targetAssets].filter((hash) => !thirdAssets.has(hash))],
  }).toEqual({ charactersPerBox: [1, 1, 1], assetsLost: [[], []] });
});

test("user settings restore onto the background art the fresh box already seeded", async () => {
  await using source = await signedInBox(createSeededIds(SOURCE_ID_CURSOR));
  const owner = await source.principalFor(source.ownerId);
  const seeded = (await source.services.settings.getUserSettings({ principal: owner })).config.appearance.backgroundLibrary;
  const [plate] = seeded;
  if (plate === undefined) {
    throw new Error("the first-login seed landed no background plate");
  }
  // Positive control: art the target never seeded restores under its exported id.
  const upload = await source.services.assets.store({
    principal: owner,
    kind: "background",
    mime: PNG,
    bytes: makeAssetBytes(source.idSource.typeId(ID_PREFIX.asset)),
  });
  const ownEntry = { entryId: "own-upload", assetId: upload.assetId, assetHash: upload.hash, mime: PNG, name: "Own upload" };
  await source.services.settings.updateUserSettingsSection({
    principal: owner,
    input: {
      section: "appearance",
      patch: {
        backgroundImageKind: "asset",
        backgroundAssetId: plate.assetId,
        backgroundAssetHash: plate.assetHash,
        backgroundAssetMime: plate.mime,
        backgroundLibrary: [...seeded, ownEntry],
      },
    },
  });
  const exported = (await source.services.settings.getUserSettings({ principal: owner })).config.appearance;
  const bundle = await exportLibrary(source);

  await using target = await signedInBox();
  const outcome = await restore(target, bundle);
  const appearance = (await target.services.settings.getUserSettings({ principal: await target.principalFor(target.ownerId) })).config.appearance;
  /** The bytes an id names on the target, or null when it names no asset there. */
  const hashOf = async (assetId: string): Promise<string | null> => (await target.services.assets.assetCasRefById(castId(assetId)))?.hash ?? null;

  expect({
    status: outcome.status,
    picked: { kind: appearance.backgroundImageKind, hash: appearance.backgroundAssetHash, resolves: await hashOf(appearance.backgroundAssetId) },
    library: await Promise.all(appearance.backgroundLibrary.map(async (entry) => ({ hash: entry.assetHash, resolves: await hashOf(entry.assetId) }))),
    ownUploadId: appearance.backgroundLibrary.find((entry) => entry.entryId === ownEntry.entryId)?.assetId,
  }).toEqual({
    status: "succeeded",
    picked: { kind: "asset", hash: plate.assetHash, resolves: plate.assetHash },
    library: exported.backgroundLibrary.map((entry) => ({ hash: entry.assetHash, resolves: entry.assetHash })),
    ownUploadId: upload.assetId,
  });
});

/** Whether the keeper room's opening signature snapshot, as the target re-exports it, still signs the restored
 *  content and names the restored attachment ids. */
async function restoredSignatures(
  root: ServerTestHarness,
  content: string,
  attached: readonly string[],
): Promise<{ readonly matchesContent: boolean; readonly imagesResolve: boolean } | null> {
  const staged = await extractZip(await exportLibrary(root, ["character", "chat"]));
  try {
    const entry = staged.entries.find((candidate) => candidate.path.startsWith(`${PORTABLE_DIRECTORIES.chat}${CHOSEN_HANDLE}/`));
    const parsed = entry === undefined ? null : parseChatBundleFile(await entry.read());
    const snapshot = parsed?.ok === true ? parseVariantMetadata(parsed.value.messages[0]?.variants[0]?.metadata ?? null).contentSignatures : undefined;
    return snapshot === undefined
      ? null
      : { matchesContent: snapshot.content === content, imagesResolve: snapshot.images.every((image) => attached.includes(image.assetId)) };
  } finally {
    await staged.dispose();
  }
}

async function galleryHashes(root: ServerTestHarness): Promise<string[]> {
  const page = await (await root.internalCallerFor(root.ownerId)).assets.listGallery({ limit: ASSET_LIST_LIMIT_MAX });
  if (page.length === ASSET_LIST_LIMIT_MAX) {
    throw new Error("the gallery outgrew one page; read it by cursor");
  }
  return page.map((item) => item.hash).toSorted();
}

// The fresh box already holds the seeded plates and avatars under its own ids, so each one the source library
// refers to restores onto those bytes and every referrer re-links by content.
test("a full library restore into a fresh box reports no failures and leaves no reference dangling", async () => {
  await using source = await signedInBox(createSeededIds(SOURCE_ID_CURSOR));
  const owner = await source.principalFor(source.ownerId);
  const [plate] = (await source.services.settings.getUserSettings({ principal: owner })).config.appearance.backgroundLibrary;
  if (plate === undefined) {
    throw new Error("the first-login seed landed no background plate");
  }
  await source.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ handle: CHOSEN_HANDLE, name: CHARACTER_NAME, description: "A keeper tends the orbital ledger." }),
  });
  await source.services.assets.addToGallery({ principal: owner, assetId: plate.assetId });
  const background = { kind: "asset", assetId: plate.assetId, assetHash: plate.assetHash, mime: plate.mime, externalUrl: "", provenanceUrl: "" };
  const opening = `The ledger at dusk: ![plate](${ASSET_SCHEME}${plate.assetId})`;
  // Replay provenance signs the exact content and its image ids, so it must re-link with them.
  const signatures = { content: opening, text: [], images: [{ assetId: plate.assetId, thoughtSignature: "signed-plate" }] };
  await seedTranscript(source, {
    ownerId: source.ownerId,
    characterHandles: [CHOSEN_HANDLE],
    lines: [
      { role: "user", content: opening, metadata: { contentSignatures: signatures } },
      { role: "assistant", speakerHandle: CHOSEN_HANDLE, content: "Every orbit is accounted for." },
    ],
    chat: { metadata: { background } },
  });
  const sourceGallery = await galleryHashes(source);
  const bundle = await exportLibrary(source);

  await using target = await signedInBox();
  const outcome = await restore(target, bundle);
  const caller = await target.internalCallerFor(target.ownerId);
  const [character] = (await caller.character.list({})).items.filter((item) => item.name === CHARACTER_NAME);
  const [room] = character === undefined ? [] : (await caller.chat.listChats({ characterId: character.id })).items;
  const hashOf = async (assetId: string | undefined): Promise<string | null> =>
    assetId === undefined ? null : ((await target.services.assets.assetCasRefById(castId(assetId)))?.hash ?? null);
  /** What the restored room's background and inline attachment resolve to on the target, or nulls without a room. */
  const restoredRoom = async (
    chatId: ChatId,
  ): Promise<{ readonly background: string | null; readonly attachment: readonly string[]; readonly signed: unknown }> => {
    const [first] = (await caller.chat.listMessages({ chatId })).messages;
    const restoredContent = first?.content ?? "";
    const attached = assetIdsInContent(restoredContent);
    return {
      background: await hashOf((await caller.chat.getChat({ chatId })).background?.assetId),
      // The render grant reads the message's structural link, so a pair here is the attachment resolving.
      attachment: (await caller.assets.resolveChatBlobRefs({ chatId, assetIds: attached })).map((ref) => ref.hash),
      signed: await restoredSignatures(target, restoredContent, attached),
    };
  };

  expect({
    outcome,
    room: room === undefined ? null : await restoredRoom(room.id),
    gallery: await galleryHashes(target),
  }).toEqual({
    outcome: { status: "succeeded", failed: 0 },
    room: { background: plate.assetHash, attachment: [plate.assetHash], signed: { matchesContent: true, imagesResolve: true } },
    gallery: sourceGallery,
  });
});

/** Every character the owner holds, by name, sorted. */
async function characterNames(root: ServerTestHarness): Promise<string[]> {
  return (await (await root.internalCallerFor(root.ownerId)).character.list({})).items.map((item) => item.name).toSorted();
}

test("a seeded library restored into a fresh box keeps one copy of each starter card", async () => {
  await using source = await signedInBox(createSeededIds(SOURCE_ID_CURSOR));
  const sourceNames = await characterNames(source);
  const bundle = await exportLibrary(source);

  await using target = await signedInBox();
  const outcome = await restore(target, bundle);

  expect({ outcome, names: await characterNames(target) }).toEqual({ outcome: { status: "succeeded", failed: 0 }, names: sourceNames });
});

test("an imported card keeps its star, alone and through a library restore", async () => {
  await using source = await signedInBox(createSeededIds(SOURCE_ID_CURSOR));
  expect(await restoreCard(source, "archivist.json", new TextEncoder().encode(STARRED_CARD))).toEqual({ ok: true, created: true });
  const bundle = await exportLibrary(source, ["character"]);

  await using target = await signedInBox();
  await restore(target, bundle);
  const starredOn = async (root: ServerTestHarness): Promise<boolean[]> => {
    const caller = await root.internalCallerFor(root.ownerId);
    const found = await charactersNamed(root, ARCHIVIST);
    return await Promise.all(found.map(async (c) => (await caller.character.get({ characterId: c.id })).starred));
  };

  expect({ source: await starredOn(source), target: await starredOn(target) }).toEqual({ source: [true], target: [true] });
});

const DOCUMENT_TEXT = "The orbital ledger keeps its own counsel.";
const TEXT_MIME = "text/plain";
const documentFileSchema = z.object({ sourceAssetId: typeIdSchema(ID_PREFIX.asset).nullable() }).loose();

const IMAGE_MODEL = "ledger-image-v1";

/** A provider that answers each image generation with the next of `pictures`, over the loopback corpus endpoint. */
function imageProvider(pictures: Uint8Array[]): typeof fetch {
  return createCorpusProviderExecution({
    modelIds: [IMAGE_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: pictures,
  }).execute;
}

/** Generate one picture through the owner's own image binding, so the box holds native imagery history. */
async function generateOnePicture(root: ServerTestHarness): Promise<AssetId> {
  const owner = await root.principalFor(root.ownerId);
  await root.services.settings.updateAppSettings({ principal: owner, partial: { privateEndpointAllowlist: [new URL(CORPUS_PROVIDER_ENDPOINT).hostname] } });
  const connection = await root.services.connection.create({
    principal: owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: IMAGE_MODEL,
    allowBackground: true,
    declared: {
      kind: "generation",
      generation: { context: { window: 32_000 }, output: { modalities: ["text", "image"] } },
      features: { images: "images-api", detectServer: false },
    },
  });
  await root.services.connection.setBinding({ principal: owner, task: "generateImage", connectionId: connection.id });
  const picture = await root.services.imagery.generatePicture({ caller: owner, mode: "free", prompt: "A keeper at the ledger.", n: 1 });
  const [image] = picture.images;
  if (image === undefined) {
    throw new Error("the image generation returned no picture");
  }
  return image.assetId;
}

/** The bytes each of the owner's databank source blobs and imagery outputs names, read off the owner's own export. */
async function referrerHashes(
  root: ServerTestHarness,
  ownerId: UserId,
): Promise<{ readonly documents: readonly (string | null)[]; readonly imagery: readonly (string | null)[] }> {
  const hashOf = async (assetId: string | null): Promise<string | null> =>
    assetId === null ? null : ((await root.services.assets.assetCasRefById(castId(assetId)))?.hash ?? null);
  const files = async (kind: PortableKind): Promise<unknown[]> => {
    const descriptor = root.app.portability.find((entity) => entity.kind === kind);
    if (descriptor === undefined) {
      throw new Error(`production composition has no ${kind} portability descriptor`);
    }
    const out: unknown[] = [];
    for await (const file of descriptor.exportAll(ownerId)) {
      out.push(JSON.parse(new TextDecoder().decode(file.bytes)));
    }
    return out;
  };
  const documents = (await files("databank")).map((file) => documentFileSchema.parse(file).sourceAssetId);
  const imagery = (await files("imagery")).flatMap((file) =>
    portableImageryCallSchema
      .loose()
      .parse(file)
      .images.map((image) => image.assetId),
  );
  return { documents: await Promise.all(documents.map(hashOf)), imagery: await Promise.all(imagery.map(hashOf)) };
}

/** Restore every non-asset file of `bundle` for `ownerId`, each through its own production descriptor. */
async function restoreReferrersOnly(root: ServerTestHarness, ownerId: UserId, bundle: Uint8Array): Promise<readonly PortableImportOutcome[]> {
  const staged = await extractZip(bundle);
  try {
    const outcomes: PortableImportOutcome[] = [];
    for (const entry of staged.entries) {
      const descriptor = root.app.portability.find((entity) => entity.kind !== "assets" && entry.path.startsWith(PORTABLE_DIRECTORIES[entity.kind]));
      if (descriptor !== undefined) {
        outcomes.push(await descriptor.importFile(ownerId, { filename: entry.path, bytes: await entry.read() }));
      }
    }
    return outcomes;
  } finally {
    await staged.dispose();
  }
}

test("databank documents and imagery history restore onto bytes the owner holds under another id, never another account's", async () => {
  const pictures: Uint8Array[] = [];
  await using source = await signedInBox(createSeededIds(SOURCE_ID_CURSOR), imageProvider(pictures));
  pictures.push(makeAssetBytes(source.idSource.typeId(ID_PREFIX.asset)));
  const owner = await source.principalFor(source.ownerId);
  const documentBytes = new TextEncoder().encode(DOCUMENT_TEXT);
  await source.services.databank.upload({ principal: owner, bytes: documentBytes, mime: TEXT_MIME, name: "Ledger" });
  const [sourceDocument] = await source.services.assets.listOwned({ principal: owner, kind: "document", limit: 1 });
  const generated = await generateOnePicture(source);
  const image = await source.services.assets.assetCasRefById(generated);
  const imageBytes = await source.services.assets.loadAssetBytes(generated);
  if (sourceDocument === undefined || image === undefined || imageBytes === null) {
    throw new Error("the upload kept no source blob, or the generated picture stored no bytes");
  }
  const bundle = await exportLibrary(source, ["assets", "databank", "imagery"]);

  await using target = await signedInBox();
  // The member holds the same bytes, so a hash lookup that crossed accounts would find them for the owner.
  const member = await target.actor();
  const memberPrincipal = await target.principalFor(member.id);
  await target.services.assets.store({ principal: memberPrincipal, kind: "document", mime: TEXT_MIME, bytes: documentBytes });
  await target.services.assets.store({ principal: memberPrincipal, kind: "generated", mime: PNG, bytes: imageBytes });
  const unheld = await restoreReferrersOnly(target, target.ownerId, bundle);
  const unheldReferrers = await referrerHashes(target, target.ownerId);

  // Positive control: an owner who already holds the bytes under its own ids gets the full restore re-linked onto them.
  await using held = await signedInBox();
  const heldOwner = await held.principalFor(held.ownerId);
  const heldDocument = await held.services.assets.store({ principal: heldOwner, kind: "document", mime: TEXT_MIME, bytes: documentBytes });
  const heldImage = await held.services.assets.store({ principal: heldOwner, kind: "generated", mime: PNG, bytes: imageBytes });
  const outcome = await restore(held, bundle);

  expect({
    heldUnderOwnIds: heldDocument.assetId !== sourceDocument.assetId && heldImage.assetId !== generated,
    unheldRefused: unheld.filter((result) => !result.ok).length,
    unheldReferrers,
    outcome,
    referrers: await referrerHashes(held, held.ownerId),
  }).toEqual({
    heldUnderOwnIds: true,
    unheldRefused: 1,
    unheldReferrers: { documents: [null], imagery: [] },
    outcome: { status: "succeeded", failed: 0 },
    referrers: { documents: [sourceDocument.hash], imagery: [image.hash] },
  });
});

test("a card's background travels in its export and re-links by content, never onto another account's bytes", async () => {
  await using source = await signedInBox(createSeededIds(SOURCE_ID_CURSOR));
  const owner = await source.principalFor(source.ownerId);
  const [plate] = (await source.services.settings.getUserSettings({ principal: owner })).config.appearance.backgroundLibrary;
  if (plate === undefined) {
    throw new Error("the first-login seed landed no background plate");
  }
  const keeper = await source.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ handle: CHOSEN_HANDLE, name: CHARACTER_NAME, description: "A keeper tends the orbital ledger." }),
  });
  const background = themeBackgroundSchema.parse({ kind: "asset", assetId: plate.assetId, assetHash: plate.assetHash, mime: plate.mime });
  await source.services.character.update({ principal: owner, characterId: keeper.id, input: { backgroundOverride: background } });
  const card = await source.http.request(`/api/export/character/${keeper.id}`);
  expect(card.status).toBe(200);
  const cardBytes = new Uint8Array(await card.arrayBuffer());
  const bundle = await exportLibrary(source);

  await using target = await signedInBox();
  /** The keeper's restored background on `root` for `userId`, and the bytes it names there. */
  const keeperBackground = async (userId: UserId): Promise<{ readonly kind: string; readonly resolves: string | null } | null> => {
    const caller = await target.internalCallerFor(userId);
    const [restored] = (await caller.character.list({})).items.filter((item) => item.name === CHARACTER_NAME);
    const override = restored === undefined ? null : (await caller.character.get({ characterId: restored.id })).backgroundOverride;
    return override === null ? null : { kind: override.kind, resolves: (await target.services.assets.assetCasRefById(castId(override.assetId)))?.hash ?? null };
  };
  // The member never signed in, so holds no plates; the owner's seeded copy of the plate must stay out of reach.
  const member = await target.actor();
  const characterDescriptor = target.app.portability.find((entity) => entity.kind === "character");
  const memberRestore = await characterDescriptor?.importFile(member.id, { filename: "Keeper.png", bytes: cardBytes });
  const outcome = await restore(target, bundle);

  expect({
    member: { ok: memberRestore?.ok, background: await keeperBackground(member.id) },
    outcome,
    keepers: (await charactersNamed(target, CHARACTER_NAME)).length,
    background: await keeperBackground(target.ownerId),
  }).toEqual({
    member: { ok: true, background: null },
    outcome: { status: "succeeded", failed: 0 },
    keepers: 1,
    background: { kind: "asset", resolves: plate.assetHash },
  });
});

test("restoring bytes the owner holds under another id repairs that asset when its stored file is gone", async () => {
  await using source = await signedInBox(createSeededIds(SOURCE_ID_CURSOR));
  const owner = await source.principalFor(source.ownerId);
  const bytes = makeAssetBytes(source.idSource.typeId(ID_PREFIX.asset));
  // A backup carries only the assets the library refers to.
  const upload = await source.services.assets.store({ principal: owner, kind: "background", mime: PNG, bytes });
  await source.services.assets.addToGallery({ principal: owner, assetId: upload.assetId });
  const bundle = await exportLibrary(source, ["assets"]);

  await using target = await signedInBox();
  const held = await target.services.assets.store({ principal: await target.principalFor(target.ownerId), kind: "background", mime: PNG, bytes });
  await rm(target.app.cas.blobPath(target.ownerId, held.hash));
  const outcome = await restore(target, bundle);
  const stored = await target.app.cas.exists(target.ownerId, held.hash);
  const restored = stored ? await target.services.assets.loadAssetBytes(held.assetId) : null;

  expect({ outcome, stored, readable: restored !== null && Buffer.from(restored).equals(Buffer.from(bytes)) }).toEqual({
    outcome: { status: "succeeded", failed: 0 },
    stored: true,
    readable: true,
  });
});
