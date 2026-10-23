// The scheduled assets-gc workload on the real composition root: every reference kind keeps its blob, a
// truly unreferenced blob is reclaimed, and a reference the collector cannot read stops the sweep cold.
// @subject packages/server/src/domain/assets/verbs/collect-garbage.ts
// @subject packages/server/src/domain/assets/persistence/asset-refs.ts

import { mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, PLUGIN_UI_ASSETS_DIR, pluginManifestSchema } from "@orb/contracts/plugin";
import { themeBackgroundSchema } from "@orb/contracts/theme";
import { CADENCE_INTERVAL_MS } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import { assets, characters, chats, closeDb, documents, userSettings } from "@orb/db";
import { contentSpanRaw } from "@orb/kit/content";
import type { AssetId, CharacterHandle, ChatId, MessageId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { recordPluginFetchedAsset } from "@orb/server/domain/plugin";
import type { Cas } from "@orb/server/infra/storage/cas";
import { createCas } from "@orb/server/infra/storage/cas";
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import { CORPUS_EMBEDDING_VECTOR, CORPUS_PROVIDER_ENDPOINT, createCorpusProviderExecution } from "@orb/testkit/node/corpus-provider.ts";
import { seedCorpusConnections } from "@orb/testkit/node/corpus-seed.ts";
import { freshHeldDb } from "@orb/testkit/node/db.ts";
import { makeAssetBytes } from "@orb/testkit/node/factories/asset.ts";
import { seedChatInvite, seedInvitedChatParticipant } from "@orb/testkit/node/factories/chat.ts";
import { makePluginBundle, seedDistributedPlugin, seedInstalledPlugin } from "@orb/testkit/node/factories/plugin.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { eq, sql } from "drizzle-orm";
import { onTestFinished } from "vitest";

const PNG = "image/png";
const MS_PER_SECOND = 1000;
const ASSET_ROW_DELETE = /^delete from "assets"/i;
/** The purge's `(owner, hash)` index re-check: the statement that sits between the row delete and the unlink. */
const ASSET_HASH_LOOKUP = /^select "id" from "assets" where .*"assets"\."hash" = \?/i;
const WORKLOAD_DEADLINE_MS = 30_000;
const GC_IMAGE_MODEL = "gc-image-v1";
const GC_PLUGIN_IMAGE_PATH = `${PLUGIN_UI_ASSETS_DIR}cover.png`;
const GC_PLUGIN_SOURCE = "orb.host(1);";

function gcPluginBundle(slug: string, image: Uint8Array): Uint8Array {
  const manifest = pluginManifestSchema.parse({
    id: slug,
    name: "GC witness",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Ships one cover image and fetches another.",
    capabilities: ["net.fetch_asset"],
    netHosts: ["covers.example.invalid"],
  });
  return makePluginBundle(manifest, GC_PLUGIN_SOURCE, FROZEN_AT_MS, { [GC_PLUGIN_IMAGE_PATH]: image });
}

interface GcBox {
  readonly root: ServerTestHarness;
  readonly cas: Cas;
  readonly principal: Principal;
  readonly images: Uint8Array[];
}

interface StoredRef {
  readonly assetId: AssetId;
  readonly hash: string;
}

/** One harness on a scratch CAS; a supplied db is closed after the harness that used it. The scripted provider
 *  answers only an image generation, with whatever bytes a test pushes into `images` first. */
async function openBox(db?: Db): Promise<GcBox> {
  const dir = await mkdtemp(join(tmpdir(), "orb-assets-gc-"));
  const casDir = join(dir, "cas");
  const images: Uint8Array[] = [];
  const wire = createCorpusProviderExecution({
    modelIds: [GC_IMAGE_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images,
  });
  const root = await createServerHarness({ startJobs: false, casDir, providerFetch: wire.execute, ...(db === undefined ? {} : { db }) });
  onTestFinished(async () => {
    await root[Symbol.asyncDispose]();
    if (db !== undefined) {
      closeDb(db);
    }
    await rm(dir, { recursive: true, force: true });
  });
  const principal = await root.principalFor(root.ownerId);
  await root.services.settings.updateAppSettings({ principal, partial: { privateEndpointAllowlist: [new URL(CORPUS_PROVIDER_ENDPOINT).hostname] } });
  // A committed message resolves the room's chat connection even when nothing generates; nothing here calls it.
  await seedCorpusConnections(root, principal);
  return { root, cas: createCas(casDir), principal, images };
}

/** An asset a production writer stored on its own, resolved to the `(id, hash)` the sweep keys on. */
async function storedRow(box: GcBox, assetId: AssetId): Promise<StoredRef> {
  const row = await box.root.db.select({ hash: assets.hash }).from(assets).where(eq(assets.id, assetId)).get();
  if (row === undefined) {
    throw new Error("a production writer pointed at an asset with no index row");
  }
  return { assetId, hash: row.hash };
}

async function store(
  box: GcBox,
  kind: "attachment" | "avatar" | "background" | "gallery" | "generated",
  bytes: Uint8Array = makeAssetBytes(box.root.idSource.typeId(ID_PREFIX.asset)),
): Promise<StoredRef> {
  const stored = await box.root.services.assets.store({ principal: box.principal, bytes, kind, mime: PNG });
  return { assetId: stored.assetId, hash: stored.hash };
}

/** A week ago is one scheduled-GC period: far outside any grace window. */
function aWeekAgo(box: GcBox): number {
  return box.root.clock.now() - CADENCE_INTERVAL_MS.weekly;
}

/** Stamp every blob as last put at `atMs` (the lever `putBytes` pulls on every write and dedup hit). */
async function stampEveryBlob(box: GcBox, atMs: number): Promise<void> {
  const seconds = atMs / MS_PER_SECOND;
  for await (const owner of box.cas.listOwners()) {
    for await (const hash of box.cas.listHashes(castId<UserId>(owner))) {
      await utimes(box.cas.blobPath(castId<UserId>(owner), hash), seconds, seconds);
    }
  }
}

async function stampBlob(box: GcBox, ref: StoredRef, atMs: number): Promise<void> {
  const seconds = atMs / MS_PER_SECOND;
  await utimes(box.cas.blobPath(box.root.ownerId, ref.hash), seconds, seconds);
}

/** Only `refs` are past grace, so they are the only blobs the sweep can reach a destructive edge for. */
async function ageOnly(box: GcBox, ...refs: readonly StoredRef[]): Promise<void> {
  await stampEveryBlob(box, box.root.clock.now());
  for (const ref of refs) {
    await stampBlob(box, ref, aWeekAgo(box));
  }
}

/** Start and run the assets-gc workload the boot seed schedules, then read its recorded outcome. */
async function runScheduledGc(box: GcBox): ReturnType<ServerTestHarness["services"]["workloads"]["get"]> {
  const runAdmitted = box.root.runAdmittedWorkload;
  if (runAdmitted === undefined) {
    throw new Error("the harness owns its workload execution only with startJobs: false");
  }
  const started = await box.root.services.workloads.start({
    caller: box.principal,
    mode: "bulk",
    ownerId: box.root.ownerId,
    input: { kind: "assets-gc", params: {} },
  });
  await runAdmitted(started.id, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
  return await box.root.services.workloads.get({ caller: box.principal, id: started.id });
}

async function survives(box: GcBox, ref: StoredRef): Promise<boolean> {
  const rows = await box.root.db.select({ id: assets.id }).from(assets).where(eq(assets.id, ref.assetId));
  return rows.length === 1 && (await box.cas.exists(box.root.ownerId, ref.hash));
}

async function survival(box: GcBox, refs: Readonly<Record<string, StoredRef>>): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  for (const [name, ref] of Object.entries(refs)) {
    out[name] = await survives(box, ref);
  }
  return out;
}

function inlineImage(ref: StoredRef): string {
  return contentSpanRaw({ kind: "image", ref: { kind: "asset", assetId: ref.assetId }, alt: "kept" });
}

async function openRoom(box: GcBox, handle: CharacterHandle, principal: Principal = box.principal): Promise<ChatId> {
  const character = await box.root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle, name: "Keeper", description: "A keeper tends the orbital ledger." }),
  });
  const room = await box.root.services.chat.startChat({ principal, characterIds: [character.id], opening: "none" });
  return room.chat.id;
}

interface Post {
  readonly content: string;
  /** Rides the send's own attachment door, which writes the `message_assets` link. */
  readonly attached?: readonly StoredRef[];
  readonly as?: Principal;
}

/** Post without generating. */
async function say(box: GcBox, chatId: ChatId, post: Post): Promise<MessageId> {
  const outcome = await box.root.services.chat.commitMessage({
    principal: post.as ?? box.principal,
    chatId,
    content: post.content,
    attachmentAssetIds: (post.attached ?? []).map((ref) => ref.assetId),
  });
  const message = outcome.messages[0];
  if (message === undefined) {
    throw new Error("commitMessage returned no committed row");
  }
  return message.id;
}

async function attach(box: GcBox, chatId: ChatId, ref: StoredRef): Promise<MessageId> {
  return await say(box, chatId, { content: "", attached: [ref] });
}

function backgroundSource(ref: StoredRef): ReturnType<typeof themeBackgroundSchema.parse> {
  return themeBackgroundSchema.parse({ kind: "asset", assetId: ref.assetId, assetHash: ref.hash, mime: PNG });
}

/** Plant one reference of every kind production writes, each the ONLY reference its asset has. */
async function plantEveryReference(box: GcBox): Promise<Record<string, StoredRef>> {
  const { root, principal } = box;
  const refs: Record<string, StoredRef> = {};

  refs["characters.avatar_asset_id"] = await store(box, "avatar");
  await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: "gc-avatar", name: "Avatar", description: "", avatarAssetId: refs["characters.avatar_asset_id"].assetId }),
  });

  refs["personas.avatar_asset_id"] = await store(box, "avatar");
  await root.services.persona.create({ principal, input: { name: "Wanderer", description: "", avatarAssetId: refs["personas.avatar_asset_id"].assetId } });

  refs["gallery_items.asset_id"] = await store(box, "gallery");
  await root.services.assets.addToGallery({ principal, assetId: refs["gallery_items.asset_id"].assetId });

  const room = await openRoom(box, castId<CharacterHandle>("gc-room"));
  refs["message_assets.asset_id"] = await store(box, "attachment");
  await attach(box, room, refs["message_assets.asset_id"]);

  const document = await root.services.databank.upload({
    principal,
    bytes: new TextEncoder().encode("The keeper's ledger survives every sweep."),
    mime: "text/plain",
    name: "ledger.txt",
  });
  const documentRow = await root.db.select({ sourceAssetId: documents.sourceAssetId }).from(documents).where(eq(documents.id, document.document.id)).get();
  const sourceAssetId = documentRow?.sourceAssetId ?? null;
  if (sourceAssetId === null) {
    throw new Error("databank upload kept no source asset");
  }
  refs["documents.source_asset_id"] = await storedRow(box, sourceAssetId);

  const installed = await seedInstalledPlugin(root, {
    caller: principal,
    bundle: gcPluginBundle("gc-witness", makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))),
    grant: [],
  });
  refs["plugins.bundle_asset_id"] = await storedRow(box, installed.plugin.bundleAssetId);
  const shipped = installed.assets[0];
  if (shipped === undefined) {
    throw new Error("plugin install linked no bundle-shipped image");
  }
  refs["plugin_assets.asset_id (bundle image)"] = await storedRow(box, shipped.assetId);
  refs["plugin_assets.asset_id (fetched)"] = await store(box, "generated");
  await recordPluginFetchedAsset(root.db, installed.plugin.id, refs["plugin_assets.asset_id (fetched)"].assetId, root.clock.now());

  // Published to every user, then the publisher uninstalls their own copy: the publication is the bundle's only
  // reference, and the uninstall's no-grace reap already had to honor it.
  const published = await seedDistributedPlugin(root, {
    caller: principal,
    bundle: gcPluginBundle("gc-published", makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))),
  });
  const ownCopy = published.installs.find((install) => install.plugin.ownerId === root.ownerId);
  if (ownCopy === undefined) {
    throw new Error("publishing installed no copy for the publisher");
  }
  await root.services.plugin.uninstall({ caller: principal, pluginId: ownCopy.plugin.id });
  refs["admin_distributed_plugins.bundle_asset_id"] = await storedRow(box, published.distribution.bundleAssetId);

  const imageConnection = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: GC_IMAGE_MODEL,
    allowBackground: true,
    declared: {
      kind: "generation",
      generation: { context: { window: 32_000 }, output: { modalities: ["text", "image"] } },
      features: { images: "images-api", detectServer: false },
    },
  });
  await root.services.connection.setBinding({ principal, task: "generateImage", connectionId: imageConnection.id });
  box.images.push(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)));
  const picture = await root.services.imagery.generatePicture({ caller: principal, mode: "free", prompt: "The orbital ledger at dusk.", n: 1 });
  const generated = picture.images[0];
  if (generated === undefined) {
    throw new Error("the scripted image generation returned no picture");
  }
  refs["imagery_generations.asset_id"] = await storedRow(box, generated.assetId);

  refs["user_settings appearance.backgroundAssetId"] = await store(box, "background");
  refs["user_settings appearance.backgroundLibrary[]"] = await store(box, "background");
  const pick = refs["user_settings appearance.backgroundAssetId"];
  const library = refs["user_settings appearance.backgroundLibrary[]"];
  await root.services.settings.updateUserSettingsSection({
    principal,
    input: {
      section: "appearance",
      patch: {
        backgroundImageKind: "asset",
        backgroundAssetId: pick.assetId,
        backgroundAssetHash: pick.hash,
        backgroundAssetMime: PNG,
        backgroundLibrary: [{ entryId: "gc-library-entry", assetId: library.assetId, assetHash: library.hash, mime: PNG, name: "Library plate" }],
      },
    },
  });

  refs["user_settings profile.avatarAssetId"] = await store(box, "avatar");
  await root.services.settings.updateUserSettingsSection({
    principal,
    input: { section: "profile", patch: { avatarAssetId: refs["user_settings profile.avatarAssetId"].assetId } },
  });

  refs["characters.background_override"] = await store(box, "background");
  const carded = await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: "gc-card-background", name: "Carded", description: "" }),
  });
  await root.services.character.update({
    principal,
    characterId: carded.id,
    input: { backgroundOverride: backgroundSource(refs["characters.background_override"]) },
  });

  refs["chats.metadata.background"] = await store(box, "background");
  await root.services.chat.setChatBackground({ principal, chatId: room, background: backgroundSource(refs["chats.metadata.background"]) });

  // A fork copies the canon body; deleting the source leaves the fork's body as the image's only reference.
  refs["message body (fork of a deleted chat)"] = await store(box, "attachment");
  const forkSource = await openRoom(box, castId<CharacterHandle>("gc-fork-source"));
  await attach(box, forkSource, refs["message body (fork of a deleted chat)"]);
  await root.services.chat.forkChat({ principal, chatId: forkSource });
  await root.services.chat.delete({ principal, chatId: forkSource });

  // A duplicate copies the selected variant's body; deleting the original leaves the copy as the only reference.
  refs["message body (duplicate of a deleted message)"] = await store(box, "attachment");
  const original = await attach(box, room, refs["message body (duplicate of a deleted message)"]);
  await root.services.chat.duplicateMessage({ principal, chatId: room, messageId: original });
  await root.services.chat.deleteMessages({ principal, chatId: room, messageIds: [original] });

  // The author edits their own image into a message they already sent.
  refs["message body (author edit)"] = await store(box, "attachment");
  const plain = await say(box, room, { content: "The ledger, before the picture." });
  await root.services.chat.editMessage({
    principal,
    chatId: room,
    messageId: plain,
    content: `The ledger. ${inlineImage(refs["message body (author edit)"])}`,
  });

  return refs;
}

function allTrue(refs: Readonly<Record<string, StoredRef>>): Record<string, boolean> {
  return Object.fromEntries(Object.keys(refs).map((name) => [name, true]));
}

test("the scheduled sweep keeps every referenced blob and reclaims only the truly unreferenced one", async () => {
  const box = await openBox();
  const refs = await plantEveryReference(box);
  const orphan = await store(box, "attachment");
  const inFlight = await store(box, "attachment");
  await stampEveryBlob(box, aWeekAgo(box));
  await stampBlob(box, inFlight, box.root.clock.now());

  const run = await runScheduledGc(box);

  expect(run.status).toBe("succeeded");
  expect(await survival(box, refs)).toEqual(allTrue(refs));
  // The put→link gap: an unreferenced blob stored within the grace window is not yet garbage.
  expect(await survives(box, inFlight)).toBe(true);
  // Positive control: the sweep really ran and really deletes; without it every survival above is vacuous.
  expect(await survives(box, orphan)).toBe(false);
});

test("a body quoting another owner's asset retains nothing, while the owner's own quote in their own room does", async () => {
  const box = await openBox();
  const foreign = await box.root.principalFor((await box.root.actor()).id);
  await seedCorpusConnections(box.root, foreign);
  const quotedByStranger = await store(box, "attachment");
  const quotedByOwner = await store(box, "attachment");
  await say(box, await openRoom(box, castId<CharacterHandle>("gc-stranger-room"), foreign), {
    content: `Borrowed. ${inlineImage(quotedByStranger)}`,
    as: foreign,
  });
  await say(box, await openRoom(box, castId<CharacterHandle>("gc-owner-room")), { content: `Mine. ${inlineImage(quotedByOwner)}` });
  await ageOnly(box, quotedByStranger, quotedByOwner);

  const run = await runScheduledGc(box);

  expect(run.status).toBe("succeeded");
  expect(await survives(box, quotedByOwner)).toBe(true);
  expect(await survives(box, quotedByStranger)).toBe(false);
});

test("a reference written after the sweep's snapshot still wins the destructive edge, for each body and JSON source", async () => {
  const { db, hold } = await freshHeldDb();
  const box = await openBox(db);
  const room = await openRoom(box, castId<CharacterHandle>("gc-race-room"));
  const plain = await say(box, room, { content: "The ledger, before the picture." });
  const late = {
    "message body": async (ref: StoredRef): Promise<void> => {
      await box.root.services.chat.editMessage({ principal: box.principal, chatId: room, messageId: plain, content: `Late. ${inlineImage(ref)}` });
    },
    "profile avatar": async (ref: StoredRef): Promise<void> => {
      await box.root.services.settings.updateUserSettingsSection({
        principal: box.principal,
        input: { section: "profile", patch: { avatarAssetId: ref.assetId } },
      });
    },
    // Positive control: the held delete really is the destructive edge, and with nothing written it frees the blob.
    nothing: (): Promise<void> => Promise.resolve(),
    // Last on purpose: once stored, this kind refuses every later snapshot. Written after this one, it must keep the asset.
    "room background of an unknown kind": async (ref: StoredRef): Promise<void> => {
      await plantRoomBackground(box, room, { kind: "library", assetId: ref.assetId });
    },
  } as const;
  const outcome: Record<string, boolean> = {};
  for (const [source, write] of Object.entries(late)) {
    const target = await store(box, "attachment");
    await ageOnly(box, target);
    const deletion = hold(ASSET_ROW_DELETE);
    const sweeping = runScheduledGc(box);
    await deletion.reached;
    await write(target);
    deletion.release();
    expect((await sweeping).status).toBe("succeeded");
    outcome[source] = await survives(box, target);
  }

  expect(outcome).toEqual({ "message body": true, "profile avatar": true, nothing: false, "room background of an unknown kind": true });
});

test("a co-member's quote keeps nothing once the owner's own attachment message is gone", async () => {
  const box = await openBox();
  const member = await box.root.principalFor((await box.root.actor()).id);
  await seedCorpusConnections(box.root, member);
  const room = await openRoom(box, castId<CharacterHandle>("gc-shared-room"));
  const invite = await seedChatInvite(box.root, {
    principal: box.principal,
    chatId: room,
    input: { invitedHandle: member.handle },
  });
  await seedInvitedChatParticipant(box.root, { principal: member, inviteId: invite.id });
  const attached = await store(box, "attachment");
  const posted = await attach(box, room, attached);
  await say(box, room, { content: `Quoting the host. ${inlineImage(attached)}`, as: member });
  await box.root.services.chat.deleteMessages({ principal: box.principal, chatId: room, messageIds: [posted] });
  await ageOnly(box, attached);

  const run = await runScheduledGc(box);

  expect(run.status).toBe("succeeded");
  expect(await survives(box, attached)).toBe(false);
});

test("a same-bytes upload indexed between the row delete and the unlink keeps its bytes", async () => {
  const { db, hold } = await freshHeldDb();
  const box = await openBox(db);
  const bytes = makeAssetBytes(box.root.idSource.typeId(ID_PREFIX.asset));
  const target = await store(box, "attachment", bytes);
  await ageOnly(box, target);
  const recheck = hold(ASSET_HASH_LOOKUP);
  const sweeping = runScheduledGc(box);
  const reachedRecheck = await Promise.race([recheck.reached.then(() => true), sweeping.then(() => false)]);
  if (!reachedRecheck) {
    recheck.disarm();
  }
  expect(reachedRecheck).toBe(true);
  const again = await store(box, "attachment", bytes);
  recheck.release();
  expect((await sweeping).status).toBe("succeeded");

  expect(again.assetId).not.toBe(target.assetId);
  expect(await survives(box, again)).toBe(true);
});

/** Stored shapes no current writer produces — a newer build's row, a hand edit, or corruption — written
 *  straight into the JSON column, because the refusal path is exactly what a production writer cannot reach.
 *  Each plant answers the primary key of the row it broke: the refusal must name it for the owner to repair. */
const UNREADABLE_REFERENCES = {
  "a room background of a source kind this build does not know": async (box: GcBox, ref: StoredRef): Promise<string> => {
    const room = await openRoom(box, castId<CharacterHandle>("gc-unknown-room-kind"));
    await plantRoomBackground(box, room, { kind: "library", assetId: ref.assetId });
    return room;
  },
  "a room background that is not an object": async (box: GcBox, ref: StoredRef): Promise<string> => {
    const room = await openRoom(box, castId<CharacterHandle>("gc-encoded-room-background"));
    await plantRoomBackground(box, room, JSON.stringify({ kind: "asset", assetId: ref.assetId }));
    return room;
  },
  "a card background of a source kind this build does not know": async (box: GcBox, ref: StoredRef): Promise<string> =>
    await plantCardBackground(box, castId<CharacterHandle>("gc-unknown-card-kind"), { kind: "library", assetId: ref.assetId }),
  "a card background override that is not an object": async (box: GcBox, ref: StoredRef): Promise<string> =>
    await plantCardBackground(box, castId<CharacterHandle>("gc-encoded-card-background"), JSON.stringify({ kind: "asset", assetId: ref.assetId })),
  "a background-library entry whose assetId is not a string": async (box: GcBox, ref: StoredRef): Promise<string> =>
    await rewriteSettings(box, "$.appearance.backgroundLibrary", [{ entryId: "gc-entry", assetId: { id: ref.assetId } }]),
  "a background-library entry that is not an object": async (box: GcBox, ref: StoredRef): Promise<string> =>
    await rewriteSettings(box, "$.appearance.backgroundLibrary", [ref.assetId]),
  "a background pick that is not a string": async (box: GcBox, ref: StoredRef): Promise<string> =>
    await rewriteSettings(box, "$.appearance.backgroundAssetId", { id: ref.assetId }),
  "an appearance section that is not an object": async (box: GcBox, ref: StoredRef): Promise<string> =>
    await rewriteSettings(box, "$.appearance", JSON.stringify({ backgroundAssetId: ref.assetId })),
  "a profile avatar that is not a string": async (box: GcBox, ref: StoredRef): Promise<string> =>
    await rewriteSettings(box, "$.profile.avatarAssetId", [ref.assetId]),
  "a profile section that is not an object": async (box: GcBox, ref: StoredRef): Promise<string> =>
    await rewriteSettings(box, "$.profile", JSON.stringify({ avatarAssetId: ref.assetId })),
  "a settings blob that is not JSON at all": async (box: GcBox, ref: StoredRef): Promise<string> => {
    await settingsRow(box);
    await box.root.db
      .update(userSettings)
      .set({ config: sql`${`{"profile":{"avatarAssetId":"${ref.assetId}"`}` })
      .where(eq(userSettings.userId, box.root.ownerId));
    return box.root.ownerId;
  },
} as const;

/** Write `value` at the room's `background` key as stored JSON (a string value stores a JSON string). */
async function plantRoomBackground(box: GcBox, room: ChatId, value: unknown): Promise<void> {
  await box.root.db
    .update(chats)
    .set({ metadata: sql`json_set(coalesce(${chats.metadata}, '{}'), '$.background', json(${JSON.stringify(value)}))` })
    .where(eq(chats.id, room));
}

async function plantCardBackground(box: GcBox, handle: CharacterHandle, value: unknown): Promise<string> {
  const card = await box.root.services.character.create({
    principal: box.principal,
    input: createCharacterSchema.parse({ handle, name: "Unreadable", description: "" }),
  });
  await box.root.db
    .update(characters)
    .set({ backgroundOverride: sql`json(${JSON.stringify(value)})` })
    .where(eq(characters.id, card.id));
  return card.id;
}

/** The owner's settings row, written once through the real section verb so a raw rewrite has a row to edit. */
async function settingsRow(box: GcBox): Promise<void> {
  await box.root.services.settings.updateUserSettingsSection({ principal: box.principal, input: { section: "profile", patch: { flankCollapsed: true } } });
}

async function rewriteSettings(box: GcBox, path: string, value: unknown): Promise<string> {
  await settingsRow(box);
  await box.root.db
    .update(userSettings)
    .set({ config: sql`json_set(${userSettings.config}, ${path}, json(${JSON.stringify(value)}))` })
    .where(eq(userSettings.userId, box.root.ownerId));
  return box.root.ownerId;
}

test.each(Object.entries(UNREADABLE_REFERENCES))("%s refuses the whole sweep, names the row and deletes nothing", async (_shape, plant) => {
  const box = await openBox();
  const named = await store(box, "background");
  const orphan = await store(box, "attachment");
  const brokenRow = await plant(box, named);
  await ageOnly(box, named, orphan);

  const run = await runScheduledGc(box);

  expect(run.status).toBe("failed");
  expect(run.error).toContain(brokenRow);
  expect(await survival(box, { named, orphan })).toEqual({ named: true, orphan: true });
});
