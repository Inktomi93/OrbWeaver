// A library export restored into a fresh box whose owner has signed in once, so the first-login seed has landed
// its plates, cards and rooms before the bundle arrives. The restore keeps every chat with its character and the
// owner's appearance, through the export and import routes and the import workload.
// @subject packages/server/src/domain/import/loader/import-bundle.ts
// @subject packages/server/src/domain/import/substrate/handle.ts
// @subject packages/server/src/domain/import/verbs/import-chat-bundle.ts
// @subject packages/server/src/domain/export/verbs/export-chat-bundle.ts
// @subject packages/server/src/domain/settings/verbs/import-user-settings.ts

import { CHARACTER_HANDLE_WIRE_KEY, characterCardV3Schema, characterHandleSchema, createCharacterSchema } from "@orb/contracts/character";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { importStartedSchema } from "@orb/contracts/import";
import type { PortableImportOutcome, PortableKind } from "@orb/contracts/portability";
import type { CharacterHandle, CharacterId, WorkloadId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { slugifyHandle } from "@orb/kit/slug";
import { buildChatBundleFile, CHAT_BUNDLE_EXT, parseChatBundleFile } from "@orb/server/primitives/serde/chat-bundle";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makeAssetBytes, seedTranscript } from "@orb/testkit/node/composed";

const EXPORT_ROUTE = "/api/export/library";
const BUNDLE_ROUTE = "/api/import/bundle";
/** Any signed-in request runs the first-login seed; this one reads nothing else. */
const SIGNED_IN_ROUTE = "/api/trpc/sessions.me";
const WORKLOAD_DEADLINE_MS = 60_000;
/** Asset ids restore verbatim, so the exporting box mints from its own band. */
const SOURCE_ID_CURSOR = 2 ** 29;
const PNG = "image/png";
/** A handle the owner chose, which is not the slug of the character's name. */
const CHOSEN_HANDLE = castId<CharacterHandle>("lantern-warden");
const CHARACTER_NAME = "Keeper";

/** A local box whose loopback requests act as its owner, after that owner's first-login seed has settled. */
async function signedInBox(ids?: ReturnType<typeof createSeededIds>): Promise<ServerTestHarness> {
  const root = await createServerHarness({
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
    env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "owner" },
    ...(ids === undefined ? {} : { ids }),
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
