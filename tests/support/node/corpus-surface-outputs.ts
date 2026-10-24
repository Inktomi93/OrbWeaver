// Native surface captures retain actual admin/owner reads, corpus identities and externally funded greeting results.

import { createCharacterSchema } from "@orb/contracts/character";
import { ID_PREFIX } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { UPSTREAM_ANSWER_TTL_MS } from "../../../packages/server/src/domain/settings/verbs/upstream-probes.ts";
import { seedCorpusActors } from "./corpus-actors.ts";
import type { createSurfaceOutputWire } from "./corpus-surface-wire.ts";
import { SURFACE_BACKGROUND_URL, SURFACE_UPDATE_STEPS } from "./corpus-surface-wire.ts";
import { makeAssetBytes } from "./factories/asset.ts";
import type { ServerTestHarness } from "./server.ts";

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
type SettingsOutput<K extends keyof Caller["settings"]> = Awaited<ReturnType<Caller["settings"][K]>>;
type CharacterOutput<K extends keyof Caller["character"]> = Awaited<ReturnType<Caller["character"][K]>>;
type AssetOutput<K extends keyof Caller["assets"]> = Awaited<ReturnType<Caller["assets"][K]>>;
interface SurfaceOutputs {
  readonly otherUserId: ServerTestHarness["ownerId"];
  readonly settings: {
    readonly version: SettingsOutput<"getVersion">;
    readonly updates: readonly SettingsOutput<"checkForUpdate">[];
    readonly before: SettingsOutput<"getAppSettingsWithOverrides">;
    readonly patched: SettingsOutput<"updateAppSettings">;
    readonly pinned: SettingsOutput<"getAppSettingsWithOverrides">;
    readonly cleared: SettingsOutput<"updateAppSettings">;
    readonly after: SettingsOutput<"getAppSettingsWithOverrides">;
    readonly missing: SettingsOutput<"getGlobalSetting">;
    readonly written: SettingsOutput<"setGlobalSetting">;
    readonly replaced: SettingsOutput<"setGlobalSetting">;
    readonly readback: SettingsOutput<"getGlobalSetting">;
    readonly background: SettingsOutput<"addExternalBackground">;
  };
  readonly characters: {
    readonly cards: readonly CharacterOutput<"create">[];
    readonly foreign: CharacterOutput<"create">;
    readonly empty: CharacterOutput<"listTagGroups">;
    readonly added: CharacterOutput<"bulkAddCardTag">;
    readonly repeated: CharacterOutput<"bulkAddCardTag">;
    readonly tagged: CharacterOutput<"listTagGroups">;
    readonly capped: CharacterOutput<"list">;
    readonly filtered: CharacterOutput<"listTagGroups">;
    readonly filteredPage: CharacterOutput<"list">;
    readonly removed: CharacterOutput<"bulkRemoveCardTag">;
    readonly removedAgain: CharacterOutput<"bulkRemoveCardTag">;
    readonly beforeGreeting: CharacterOutput<"get">;
    readonly generated: CharacterOutput<"generateGreeting">;
    readonly rewritten: CharacterOutput<"rewriteGreeting">;
    readonly afterGreeting: CharacterOutput<"get">;
  };
  readonly assets: {
    readonly stored: Awaited<ReturnType<ServerTestHarness["app"]["assets"]["store"]>>;
    readonly pages: readonly AssetOutput<"listOwned">[];
    readonly gallery: readonly AssetOutput<"addToGallery">[];
    readonly oldest: AssetOutput<"listGallery">;
    readonly newest: AssetOutput<"listGallery">;
    readonly continued: AssetOutput<"listGallery">;
    readonly exhausted: AssetOutput<"listGallery">;
    readonly repeated: AssetOutput<"addToGallery">;
    readonly candidates: AssetOutput<"listOwned">;
    readonly foreignOwned: AssetOutput<"listOwned">;
    readonly foreignGallery: AssetOutput<"listGallery">;
  };
}

export const SURFACE_GLOBAL_KEY = "corpus.surface.marker";
export const SURFACE_TAG_ALPHA = "Surface alpha";
export const SURFACE_TAG_BETA = "Surface beta";
export const SURFACE_GREETING_CUE = "Preserve the surface greeting witness.";
export const SURFACE_GREETING_REPLY = "The keeper opens the orbital ledger.";
const ORIGINAL_GREETING = "The original surface greeting.";

/** Supply missing surface outputs through their real public graph; prior library/settings cohorts stay independent. */
export async function seedCorpusSurfaceOutputs(root: ServerTestHarness, wire: ReturnType<typeof createSurfaceOutputWire>): Promise<SurfaceOutputs> {
  const actors = await seedCorpusActors(root);
  const caller = await root.internalCallerFor(root.ownerId);
  const other = await root.internalCallerFor(actors.secondUserId);
  const version = await caller.settings.getVersion();
  wire.configure(version, makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)));
  const updates: SettingsOutput<"checkForUpdate">[] = [];
  for (let index = 0; index < SURFACE_UPDATE_STEPS.length; index++) {
    if (index > 0) {
      root.clock.advance(UPSTREAM_ANSWER_TTL_MS + 1);
    }
    updates.push(await caller.settings.checkForUpdate());
  }
  const before = await caller.settings.getAppSettingsWithOverrides();
  const patched = await caller.settings.updateAppSettings({ partial: { forbidExternalMedia: !before.resolved.forbidExternalMedia } });
  const pinned = await caller.settings.getAppSettingsWithOverrides();
  const cleared = await caller.settings.updateAppSettings({ partial: { forbidExternalMedia: null } });
  const after = await caller.settings.getAppSettingsWithOverrides();
  const missing = await caller.settings.getGlobalSetting({ key: SURFACE_GLOBAL_KEY });
  const written = await caller.settings.setGlobalSetting({ key: SURFACE_GLOBAL_KEY, value: { enabled: true, labels: ["native surface"] } });
  root.clock.advance(1);
  const replaced = await caller.settings.setGlobalSetting({ key: SURFACE_GLOBAL_KEY, value: "replaced native surface" });
  const readback = await caller.settings.getGlobalSetting({ key: SURFACE_GLOBAL_KEY });
  const background = await caller.settings.addExternalBackground({ url: SURFACE_BACKGROUND_URL });

  const first = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "surface-first",
      name: "Surface keeper",
      description: "A keeper protects the surface ledger.",
      greetings: [{ text: ORIGINAL_GREETING }],
    }),
  });
  const second = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "surface-second", name: "Surface archivist", description: "A separate surface witness." }),
  });
  const third = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "surface-untagged", name: "Surface unclassified", description: "A witness without a tag." }),
  });
  const foreign = await other.character.create({
    input: createCharacterSchema.parse({ handle: "surface-foreign", name: "Surface foreign", description: "A different owner's witness." }),
  });
  const empty = await caller.character.listTagGroups();
  const addInput = { tagName: SURFACE_TAG_ALPHA, characterIds: [first.id, second.id, foreign.id] };
  const added = await caller.character.bulkAddCardTag(addInput);
  const repeated = await caller.character.bulkAddCardTag(addInput);
  await caller.character.bulkAddCardTag({ tagName: SURFACE_TAG_BETA, characterIds: [first.id] });
  const tagged = await caller.character.listTagGroups();
  const alpha = tagged.groups.find((group) => group.name === SURFACE_TAG_ALPHA);
  const beta = tagged.groups.find((group) => group.name === SURFACE_TAG_BETA);
  if (alpha === undefined || beta === undefined) {
    throw new Error("native card tag writes produced no matching visible census groups");
  }
  const capped = await caller.character.list({ limit: 1 });
  const filter = { includeTagIds: [alpha.id], excludeTagIds: [beta.id] };
  const filtered = await caller.character.listTagGroups(filter);
  const filteredPage = await caller.character.list({ ...filter, limit: 1 });
  const removeInput = { tagName: SURFACE_TAG_ALPHA, characterIds: [first.id, foreign.id] };
  const removed = await caller.character.bulkRemoveCardTag(removeInput);
  const removedAgain = await caller.character.bulkRemoveCardTag(removeInput);
  const beforeGreeting = await caller.character.get({ characterId: first.id });
  const generated = await caller.character.generateGreeting({ characterId: first.id, steer: SURFACE_GREETING_CUE, timeZone: UTC_TIME_ZONE });
  const rewritten = await caller.character.rewriteGreeting({
    characterId: first.id,
    greeting: ORIGINAL_GREETING,
    steer: SURFACE_GREETING_CUE,
    timeZone: UTC_TIME_ZONE,
  });
  const afterGreeting = await caller.character.get({ characterId: first.id });

  root.clock.advance(1);
  const stored = await root.app.assets.store({
    principal: actors.owner,
    kind: "background",
    bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)),
    mime: "image/png",
  });
  const firstPage = await caller.assets.listOwned({ kind: "background", limit: 1 });
  const tail = firstPage[0];
  if (tail === undefined) {
    throw new Error("native background capture has no owned asset page");
  }
  const secondPage = await caller.assets.listOwned({ kind: "background", limit: 1, cursor: { uploadedAt: tail.uploadedAt, assetId: tail.assetId } });
  const last = secondPage[0];
  if (last === undefined) {
    throw new Error("native background capture lost the materialized image");
  }
  const exhaustedPage = await caller.assets.listOwned({ kind: "background", limit: 1, cursor: { uploadedAt: last.uploadedAt, assetId: last.assetId } });
  const firstGallery = await caller.assets.addToGallery({ assetId: background.assetId, subjectCharacterId: first.id });
  root.clock.advance(1);
  const secondGallery = await caller.assets.addToGallery({ assetId: stored.assetId, subjectCharacterId: first.id });
  const repeatedGallery = await caller.assets.addToGallery({ assetId: background.assetId, subjectCharacterId: first.id });
  const galleryInput = { subjectCharacterId: first.id, limit: 1 };
  const oldest = await caller.assets.listGallery({ ...galleryInput, sort: "oldest" });
  const newest = await caller.assets.listGallery({ ...galleryInput, sort: "newest" });
  const continued = await caller.assets.listGallery({
    ...galleryInput,
    sort: "oldest",
    cursor: { createdAt: firstGallery.createdAt, galleryItemId: firstGallery.galleryItemId },
  });
  const exhausted = await caller.assets.listGallery({
    ...galleryInput,
    sort: "oldest",
    cursor: { createdAt: secondGallery.createdAt, galleryItemId: secondGallery.galleryItemId },
  });
  return {
    otherUserId: actors.secondUserId,
    settings: { version, updates, before, patched, pinned, cleared, after, missing, written, replaced, readback, background },
    characters: {
      cards: [first, second, third],
      foreign,
      empty,
      added,
      repeated,
      tagged,
      capped,
      filtered,
      filteredPage,
      removed,
      removedAgain,
      beforeGreeting,
      generated,
      rewritten,
      afterGreeting,
    },
    assets: {
      stored,
      pages: [firstPage, secondPage, exhaustedPage],
      gallery: [firstGallery, secondGallery],
      oldest,
      newest,
      continued,
      exhausted,
      repeated: repeatedGallery,
      candidates: await caller.assets.listOwned({ kind: "background", limit: 10, galleryCandidatesFor: first.id }),
      foreignOwned: await other.assets.listOwned({ kind: "background", limit: 10 }),
      foreignGallery: await other.assets.listGallery(galleryInput),
    },
  };
}
