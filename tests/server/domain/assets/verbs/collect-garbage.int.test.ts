// The scheduled assets-gc workload on the real composition root: every reference kind keeps its blob and a
// truly unreferenced blob is reclaimed. A stored reference the collector cannot read is the persistence-tier suite.
// @subject packages/server/src/domain/assets/verbs/collect-garbage.ts
// @subject packages/server/src/domain/assets/persistence/asset-refs.ts

import type { AssetListItem } from "@orb/contracts/assets";
import { ASSET_LIST_LIMIT_MAX } from "@orb/contracts/assets";
import { createCharacterSchema } from "@orb/contracts/character";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, PLUGIN_UI_ASSETS_DIR, pluginManifestSchema } from "@orb/contracts/plugin";
import { themeBackgroundSchema } from "@orb/contracts/theme";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { recordPluginFetchedAsset } from "@orb/server/domain/plugin";
import { FROZEN_AT_MS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_PROVIDER_ENDPOINT,
  freshHeldDb,
  makeAssetBytes,
  makePluginBundle,
  plantForeignRoomBackground,
  seedChatInvite,
  seedCorpusConnections,
  seedDistributedPlugin,
  seedInstalledPlugin,
  seedInvitedChatParticipant,
} from "@orb/testkit/node/composed";
import type { GcBox, StoredRef } from "../gc-box.ts";
import {
  ageOnly,
  attach,
  aWeekAgo,
  GC_IMAGE_MODEL,
  inlineImage,
  openBox,
  openRoom,
  PNG,
  runScheduledGc,
  say,
  stampBlob,
  stampEveryBlob,
  store,
  storedRow,
  survival,
  survives,
} from "../gc-box.ts";

const ASSET_ROW_DELETE = /^delete from "assets"/i;
/** The purge's `(owner, hash)` index re-check: the statement that sits between the row delete and the unlink. */
const ASSET_HASH_LOOKUP = /^select "id" from "assets" where .*"assets"\."hash" = \?/i;
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

  await root.services.databank.upload({
    principal,
    bytes: new TextEncoder().encode("The keeper's ledger survives every sweep."),
    mime: "text/plain",
    name: "ledger.txt",
  });
  // The upload is this box's only document-kind asset, so the one the owner's library lists is its source blob.
  const [source, ...extra] = await root.services.assets.listOwned({ principal, kind: "document", limit: 2 });
  if (source === undefined || extra.length > 0) {
    throw new Error("databank upload kept no single source asset");
  }
  refs["documents.source_asset_id"] = { assetId: source.assetId, hash: source.hash };

  // The owner's plugin-kind library gains exactly the bundle zip and its shipped image on install.
  const pluginAssets = async (): Promise<readonly AssetListItem[]> =>
    await root.services.assets.listOwned({ principal, kind: "plugin", limit: ASSET_LIST_LIMIT_MAX });
  const beforeInstall = new Set((await pluginAssets()).map(({ assetId }) => assetId));
  const installed = await seedInstalledPlugin(root, {
    caller: principal,
    bundle: gcPluginBundle("gc-witness", makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))),
    grant: [],
  });
  const installedAssets = (await pluginAssets()).filter(({ assetId }) => !beforeInstall.has(assetId));
  // The bundle-shipped image is the image; the bundle is the other.
  const shipped = installedAssets.find(({ mime }) => mime.startsWith("image/"));
  const bundle = installedAssets.find(({ mime }) => !mime.startsWith("image/"));
  if (bundle === undefined || shipped === undefined || installedAssets.length !== 2) {
    throw new Error("plugin install stored no single bundle and bundle-shipped image");
  }
  refs["plugins.bundle_asset_id"] = { assetId: bundle.assetId, hash: bundle.hash };
  refs["plugin_assets.asset_id (bundle image)"] = { assetId: shipped.assetId, hash: shipped.hash };
  refs["plugin_assets.asset_id (fetched)"] = await store(box, "generated");
  await recordPluginFetchedAsset(root.db, installed.outcome.id, refs["plugin_assets.asset_id (fetched)"].assetId, root.clock.now());

  // Published to every user, then the publisher uninstalls their own copy: the publication is the bundle's only
  // reference, and the uninstall's no-grace reap already had to honor it.
  const beforePublish = new Set((await pluginAssets()).map(({ assetId }) => assetId));
  const published = await seedDistributedPlugin(root, {
    caller: principal,
    bundle: gcPluginBundle("gc-published", makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))),
  });
  const publishedBundle = (await pluginAssets()).find(({ assetId, mime }) => !(beforePublish.has(assetId) || mime.startsWith("image/")));
  const ownCopy = (await root.services.plugin.list({ caller: principal })).find(({ slug }) => slug === published.outcome.slug);
  if (publishedBundle === undefined || ownCopy === undefined) {
    throw new Error("publishing stored no bundle or installed no copy for the publisher");
  }
  await root.services.plugin.uninstall({ caller: principal, pluginId: ownCopy.id });
  refs["admin_distributed_plugins.bundle_asset_id"] = { assetId: publishedBundle.assetId, hash: publishedBundle.hash };

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
      await plantForeignRoomBackground(box.root, room, { kind: "library", assetId: ref.assetId });
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
  await seedInvitedChatParticipant(box.root, { principal: member, inviteId: invite.invite.id });
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
