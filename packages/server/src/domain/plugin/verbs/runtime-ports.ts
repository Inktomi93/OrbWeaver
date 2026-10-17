// The plugin owns guest result/refusal policy; canon writes still pass through their owning injected ops.

import { generateImageActionArgsSchema } from "@orb/contracts/imagery";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { PluginNotFoundError } from "../contract/errors.ts";
import type { PluginRuntimeDeps, PluginRuntimeOps, PluginSuggestionExecutor } from "../contract/runtime-ports.ts";
import { recordPluginFetchedAsset } from "../persistence/plugin-assets.ts";
import { createShowcaseVersionReader } from "../substrate/showcase-version.ts";

/** Bind typed effects without changing the installer, origin or fetched-asset link ordering. */

export function createPluginRuntimeOps(input: DbAssemblyInput<PluginRuntimeDeps>): PluginRuntimeOps {
  const deps: PluginRuntimeDeps = { ...input, db: databaseForOwner(input.db) };
  const { db, now, imagery, assets, resolveOwnerPrincipal } = deps;
  return {
    ingestDatabank: async ({ installerUserId, name, text }): ReturnType<PluginRuntimeOps["ingestDatabank"]> => {
      const principal = await resolveOwnerPrincipal(installerUserId);
      const { document } = await deps.databankCreateFromText({ principal, name, text });
      return { documentId: document.id };
    },
    requestTurn: async ({ triggeredBy, chatId, automationDepth, speakerCharacterId, guided }): ReturnType<PluginRuntimeOps["requestTurn"]> => {
      await deps.requestTurn({
        chatId,
        initiator: "plugin",
        triggeredBy,
        automationDepth,
        // A plugin's turn has no viewer and its installer stamped no clock, so it reads the no-viewer zone.
        timeZone: UTC_TIME_ZONE,
        ...(speakerCharacterId !== undefined ? { speakerCharacterId: castId<CharacterId>(speakerCharacterId) } : {}),
        ...(guided !== undefined ? { guided: { action: "response", input: guided } } : {}),
      });
    },
    generatePicture: async ({ authorUserId, chatId, args }): ReturnType<PluginRuntimeOps["generatePicture"]> => {
      const p = generateImageActionArgsSchema.parse(args);
      const caller = await resolveOwnerPrincipal(authorUserId);
      const picture = await imagery.generatePicture({
        caller,
        chatId,
        mode: p.mode,
        n: p.n,
        useAvatarReference: p.useAvatarReference,
        reuse: p.reuse,
        ...(p.prompt !== undefined ? { prompt: p.prompt } : {}),
        ...(p.negative !== undefined ? { negative: p.negative } : {}),
        ...(p.size !== undefined ? { size: p.size } : {}),
        ...(p.subjectCharacterId !== undefined ? { subjectCharacterId: p.subjectCharacterId } : {}),
      });
      const first = picture.images[0];
      if (first === undefined) {
        throw new Error("plugin imagery: generation produced no image");
      }
      return { assetId: first.assetId };
    },
    cardState: {
      setCardData: async ({ installerUserId, slug, characterId, data }): ReturnType<PluginRuntimeOps["cardState"]["setCardData"]> => {
        const written = await deps.writeCardData({ characterId: castId<CharacterId>(characterId), ownerId: installerUserId, slug }, data);
        if (!written) {
          throw new PluginNotFoundError(characterId);
        }
      },
      getCardData: async ({ installerUserId, slug, characterId }): ReturnType<PluginRuntimeOps["cardState"]["getCardData"]> => {
        const read = await deps.readCardData({ characterId: castId<CharacterId>(characterId), ownerId: installerUserId, slug });
        if (!read.found) {
          throw new PluginNotFoundError(characterId);
        }
        return read.data;
      },
    },
    storeFetched: async ({ pluginId, installerUserId, bytes, mime }): ReturnType<PluginRuntimeOps["storeFetched"]> => {
      const caller = await resolveOwnerPrincipal(installerUserId);
      const stored = await assets.store({ principal: caller, bytes, kind: "generated", mime, enforceMagic: true });
      await recordPluginFetchedAsset(db, pluginId, stored.assetId, now());
      return { assetId: stored.assetId };
    },
    showcaseVersion: createShowcaseVersionReader((slug) => deps.readShowcaseManifest(slug)),
  };
}
/** A confirmed act cannot silently succeed before its plugin enforcement runner is connected. */
export function createPluginSuggestionExecutor(): PluginSuggestionExecutor {
  let confirmedActRunner: PluginSuggestionExecutor["run"] | undefined;
  return {
    bind: (run): ReturnType<PluginSuggestionExecutor["bind"]> => {
      confirmedActRunner = run;
    },
    run: (req): ReturnType<PluginSuggestionExecutor["run"]> => {
      const run = confirmedActRunner;
      if (run === undefined) {
        // Unreachable after boot and a THROW rather than a silent no-op: a confirm can only arrive over the
        // transport, which is served long after this file finishes. A silent no-op here would tell a host
        // their answer was taken while nothing happened.
        throw new Error("compose: the plugin confirmed-act runner is not wired yet");
      }
      return run(req);
    },
  };
}
