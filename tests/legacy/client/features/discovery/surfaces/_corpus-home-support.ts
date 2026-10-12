import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { corpusGroupingProvenance } from "@orb/testkit/node/corpus-source.ts";
import { makeCatalogStats, makeHomeView, makeThemeRow } from "@orb/testkit/node/factories/discovery-view.ts";
import type { TrpcRoutes, TrpcWireOutput } from "@orb/testkit/node/route-trpc.ts";
import { userSettingsView } from "@orb/testkit/node/user-settings-view.ts";
import { UTILITY_RUNNING_ROUTES } from "@orb/testkit/node/utility-role.ts";
import { expect } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";

const FAMILIES = [
  {
    ...corpusGroupingProvenance("mixed"),
    label: "mixed",
    genre: null,
    tone: null,
    analysedMembers: 2,
    artStyle: null,
    palette: null,
    mood: null,
    size: 2,
    members: [
      { characterId: "character_jfc", name: "JFC", avatarHash: null },
      { characterId: "character_elias", name: "Elias Thorn", avatarHash: null },
    ],
    model: "Qwen/Qwen3-VL-Embedding-2B",
  },
  {
    ...corpusGroupingProvenance("mixed"),
    label: "mixed",
    genre: null,
    tone: null,
    analysedMembers: 1,
    artStyle: null,
    palette: null,
    mood: null,
    size: 1,
    members: [{ characterId: "character_orphan", name: "Morgatha", avatarHash: null }],
    model: "Qwen/Qwen3-VL-Embedding-2B",
  },
] satisfies TrpcWireOutput<"discovery.visualArchetypes">;

/** The viewer-identity read (#649) — spread FIRST into every `routeTrpc` call in this file. The corpus
 *  surface's run-the-pass door resolves the viewer off it, and it is nobody's subject here. Unfed it
 *  answered `routeTrpc`'s null, so this mount's viewer resolved through its no-data branch and nothing in
 *  thirty-three mounts exercised the identity-dependent path. The `userId` matches the settings row the
 *  route bags below already carry, so the two ambient reads describe ONE viewer rather than two. */
export const CORPUS_VIEWER_ROUTE: TrpcRoutes<"sessions.me" | "connection.list" | "connection.listBindings"> = {
  "sessions.me": { userId: "user_me", handle: "me", globalRole: "user" },
  // The understanding pass's Utility note reads the viewer's Utility model: a running one, so the door stays live.
  ...UTILITY_RUNNING_ROUTES,
};

export const UNANALYSED_HOME = makeHomeView({
  coverage: { characters: 10, digests: 0, segments: 0 },
  sceneThemes: [],
  arcThemes: [],
  duplicateCounts: { characters: 0, chats: 0, identicalCharacterPairs: 0 },
});
export const ANALYSED_HOME = makeHomeView({
  coverage: { characters: 10, digests: 40, segments: 12 },
  sceneThemes: [makeThemeRow({ id: "theme_1", clusterIdx: 0, level: "scene", name: "The long road", size: 7 })],
  arcThemes: [],
  duplicateCounts: { characters: 0, chats: 0, identicalCharacterPairs: 0 },
});

/** A library with characters and a finished VISUAL pass only — the invitation holds the focal. */
export const UNANALYSED: TrpcRoutes<
  | "discovery.home"
  | "discovery.catalog"
  | "discovery.visualArchetypes"
  | "discovery.forgottenGems"
  | "discovery.unusedCharacters"
  | "discovery.modelRouting"
  | "discovery.topKeywords"
  | "discovery.themeDrift"
  | "settings.getUserSettings"
  | "workloads.list"
> = {
  "discovery.home": UNANALYSED_HOME,
  "discovery.catalog": makeCatalogStats({ totalDistilled: 0, genres: [], tones: [], topTags: [] }),
  "discovery.visualArchetypes": FAMILIES,
  "discovery.forgottenGems": [],
  "discovery.unusedCharacters": [],
  "discovery.modelRouting": [],
  "discovery.topKeywords": [],
  "discovery.themeDrift": [],
  "settings.getUserSettings": userSettingsView({ memory: { enabled: true } }, { userId: castId<UserId>("user_me"), updatedAt: 1 }),
  "workloads.list": [],
};

/** …and the same library after the semantic pass — the map reclaims the focal and the rail carries the
 *  surface's one remaining door. */
export const ANALYSED: TrpcRoutes<"discovery.home" | "discovery.catalog"> = {
  ...UNANALYSED,
  "discovery.home": ANALYSED_HOME,
  "discovery.catalog": makeCatalogStats({ totalDistilled: 6, genres: [{ value: "fantasy", count: 6 }], tones: [], topTags: [] }),
};

/** The settled above-fold barrier — the focal island, which only a resolved `discovery.*` batch produces. */
export async function settled(page: Page): Promise<void> {
  await expect(page.locator('[data-corpus-focal="familyMap"]')).toBeVisible();
}
