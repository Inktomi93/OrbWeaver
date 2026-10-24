// A library export restored into a fresh box whose owner has signed in once, so the first-login seed has landed
// its plates, cards and rooms before the bundle arrives. The restore keeps every chat with its character and the
// owner's appearance, through the export and import routes and the import workload.
// @subject packages/server/src/domain/import/loader/import-bundle.ts
// @subject packages/server/src/domain/import/substrate/handle.ts
// @subject packages/server/src/domain/settings/verbs/import-user-settings.ts
// @subject packages/server/src/primitives/serde/card/index.ts
// @subject packages/server/src/domain/export/verbs/export-character.ts
// @subject packages/server/src/domain/assets/verbs/import-asset.ts
// @subject packages/server/src/domain/assets/verbs/import-gallery.ts
// @subject packages/server/src/domain/import/verbs/import-chat-bundle.ts

import type { OwnedAssetCursor } from "@orb/contracts/assets";
import { ASSET_LIST_LIMIT_MAX } from "@orb/contracts/assets";
import { CHARACTER_HANDLE_WIRE_KEY, characterCardV3Schema, characterHandleSchema, createCharacterSchema } from "@orb/contracts/character";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { importStartedSchema } from "@orb/contracts/import";
import type { PortableImportOutcome, PortableKind } from "@orb/contracts/portability";
import { ASSET_SCHEME, assetIdsInContent } from "@orb/kit/content";
import type { CharacterHandle, CharacterId, ChatId, WorkloadId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
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
/** A second restore target, which also restores ids it did not mint. */
const THIRD_BOX_ID_CURSOR = 2 ** 30;
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

  expect({ outcomes, handles: handles.toSorted(), withinCap: handles.every((handle) => characterHandleSchema.safeParse(handle).success) }).toEqual({
    outcomes: [
      { ok: true, created: true },
      { ok: true, created: true },
    ],
    handles: ["twin", "twin-2"],
    withinCap: true,
  });
});

/** A SillyTavern card its author starred, whose embedded book carries a description. */
const ARCHIVIST = "Archivist";
// The SillyTavern wire spells its keys in snake_case, so the card is written as the bytes a user would drop in.
const STARRED_CARD = `{"spec":"chara_card_v3","spec_version":"3.0","data":{"name":"${ARCHIVIST}","description":"An archivist of the outer stacks.","first_mes":"Welcome to the stacks.","alternate_greetings":["Mind the dust."],"extensions":{"fav":true,"talkativeness":"0.7"},"character_book":{"name":"Archive Book","description":"What the archivist remembers.","entries":[{"keys":["lantern"],"content":"The lantern burns amber.","insertion_order":10,"enabled":true,"id":0,"extensions":{}}]}}}`;

async function charactersNamed(root: ServerTestHarness, name: string): Promise<CharacterId[]> {
  const caller = await root.internalCallerFor(root.ownerId);
  return (await caller.character.list({})).items.filter((item) => item.name === name).map((item) => item.id);
}

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
  await target.services.character.update({ principal: await target.principalFor(target.ownerId), characterId: restored, input: { starred: true } });
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
  await seedTranscript(source, {
    ownerId: source.ownerId,
    characterHandles: [CHOSEN_HANDLE],
    lines: [
      { role: "user", content: `The ledger at dusk: ![plate](${ASSET_SCHEME}${plate.assetId})` },
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
  const restoredRoom = async (chatId: ChatId): Promise<{ readonly background: string | null; readonly attachment: readonly string[] }> => {
    const [opening] = (await caller.chat.listMessages({ chatId })).messages;
    const attached = assetIdsInContent(opening?.content ?? "");
    return {
      background: await hashOf((await caller.chat.getChat({ chatId })).background?.assetId),
      // The render grant reads the message's structural link, so a pair here is the attachment resolving.
      attachment: (await caller.assets.resolveChatBlobRefs({ chatId, assetIds: attached })).map((ref) => ref.hash),
    };
  };

  expect({
    outcome,
    room: room === undefined ? null : await restoredRoom(room.id),
    gallery: await galleryHashes(target),
  }).toEqual({
    outcome: { status: "succeeded", failed: 0 },
    room: { background: plate.assetHash, attachment: [plate.assetHash] },
    gallery: sourceGallery,
  });
});
