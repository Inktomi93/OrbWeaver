// Imagery graph wiring; late-bound chat ops are dereferenced only when a request runs.

import type { DatabaseHandle } from "@orb/db/wiring";
import type { ProviderExecutor } from "@orb/inference";
import type { IdSource } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import type { Clock } from "@orb/kit/time";
import type { AssetsService } from "#domain/assets";
import { createGeneratedAssetStore, createImageryGalleryAdd } from "#domain/assets";
import type { CharacterService } from "#domain/character";
import type { ExtractQuietDeps, ImageryRoomAccessDeps, ResolveViewerVisibility } from "#domain/chat";
import { createImageryRoomAccess, createVisibleExtractQuiet } from "#domain/chat";
import type { ConnectionService } from "#domain/connection";
import type { CaptionImageDeps, ImageryContext, ImageryService } from "#domain/imagery";
import { createCaptionImage, createImageProviderOps, createImageryInstructions, createImageryService, imageryToolDefinitions } from "#domain/imagery";
import type { SettingsService } from "#domain/settings";
import { createStatsBatchWiring } from "#domain/stats";
import type { ToolUseService } from "#domain/tool-use";
import type { ScopedEgress } from "#infra/network";
import { minter } from "./minter.ts";

export interface ImageryComposeDeps {
  readonly fetchImageBytes: ScopedEgress["fetchImageBytes"];
  readonly idSource: IdSource;
  readonly db: DatabaseHandle;
  readonly now: Clock;
  readonly connection: Pick<ConnectionService, "resolve">;
  /** The compose-tier executor FENCE (§7.5-1a): imagery may reach exactly `generateImage`. */
  readonly executor: Pick<ProviderExecutor, "generateImage">;
  readonly assets: Pick<AssetsService, "store" | "readOwnedAssetBytes" | "addToGallery">;
  /** The owner-scoped character read the gallery add verb gates on — imagery's auto-add gate reads the same one. */
  readonly characterOwned: ImageryContext["ownsCharacter"];
  readonly character: Pick<CharacterService, "getCard" | "get">;
  /** The per-FUNDER role-client binder (§8.5b): the caption + extract-quiet side calls spend the run-as
   *  principal's own `summarize` row. */
  readonly roleClientsFor: CaptionImageDeps["roleClientsFor"];
  /** The chat's present host: the room a preview runs as (D298). */
  readonly resolveChatHostUserId: ImageryRoomAccessDeps["resolveChatHostUserId"];
  /** Is the character a present character seat of the chat? A preview's subject must be (chat's `isCharacterSeated`). */
  readonly isCharacterSeated: ImageryRoomAccessDeps["isCharacterSeated"];
  /** The row-derived host Principal (`createHostPrincipalResolver`), so a run-as principal carries its real role. */
  readonly resolveHostPrincipal: ImageryRoomAccessDeps["resolveHostPrincipal"];
  /** A user's Utility-role preset params (D299), for caption and extract-quiet. */
  readonly resolveUtilityPresetParams: ExtractQuietDeps["resolveUtilityPresetParams"];
  /** IMGMAC — late-bound (chat + rpg both compose after imagery): the chat's authored user-macro defs from
   *  BOTH homes, so an imagery mode template resolves `{{house_style}}` the way a turn does. Deref'd only at
   *  request time inside `extractQuiet`, exactly like `resolveViewerVisibility` below. */
  readonly resolveUserMacroDefs: ExtractQuietDeps["resolveUserMacroDefs"];
  /** ⑫ — the run-as principal's UserSettings read (the FOREIGN-inputs seam) for the per-mode
   *  prompt-template/caption overrides. Imagery resolves `override ?? shipped-catalog-default` off this. */
  readonly loadUserSettings: SettingsService["loadUserSettings"];
  readonly maxImageBytes: () => number;
  /** Late-bound: chat's `resolveViewerVisibility` (built after chat). Deref'd only at request time inside the
   *  `extractQuiet` gate — never during boot. */
  readonly resolveViewerVisibility: ResolveViewerVisibility;
  readonly toolUse: Pick<ToolUseService, "register">;
}

export function buildImagery(deps: ImageryComposeDeps): ImageryService {
  const { db, now, connection, executor, assets, character, roleClientsFor } = deps;
  const fetchImage = deps.fetchImageBytes;
  const imagery = createImageryService({
    db,
    now,
    newGenerationId: minter(ID_PREFIX.imageryGeneration, deps.idSource),
    newCallId: minter(ID_PREFIX.imageryCall, deps.idSource),
    ...createImageProviderOps({ resolve: (params) => connection.resolve(params), generateImage: (req) => executor.generateImage(req) }),
    ...createImageryRoomAccess(deps),
    ...createImageryInstructions(deps),
    fetchImage: (url) => fetchImage(url, deps.maxImageBytes()),
    resolveRunAs: deps.resolveHostPrincipal,
    storeAsset: createGeneratedAssetStore((params) => assets.store(params)),
    extractQuiet: createVisibleExtractQuiet({
      db,
      now,
      roleClientsFor,
      getCard: (params) => character.getCard(params),
      resolveHostPrincipal: deps.resolveHostPrincipal,
      resolveUtilityPresetParams: deps.resolveUtilityPresetParams,
      resolveUserMacroDefs: deps.resolveUserMacroDefs,
      resolveViewerVisibility: deps.resolveViewerVisibility,
    }),
    captionImage: createCaptionImage(deps),
    readAsset: (caller, assetId) => assets.readOwnedAssetBytes(caller, assetId),
    getCard: (caller, characterId) => character.get({ principal: caller, characterId }),
    ownsCharacter: deps.characterOwned,
    addToGallery: createImageryGalleryAdd((params) => assets.addToGallery(params)),
    applyStatsDelta: createStatsBatchWiring(deps.idSource).applyStatsDelta,
  });
  for (const def of imageryToolDefinitions({ generatePicture: imagery.generatePicture })) {
    deps.toolUse.register(def);
  }
  return imagery;
}
