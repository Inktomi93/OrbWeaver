// domain/discovery/verbs/views — composed "page" views (owner-scoped reads), each bundling the several
// reads one front-end surface needs into a single owner-resolved call. Content-only (usage rollups are the
// stats domain, composed client-side). Subsystem reads arrive as injected deps (wired at the composition
// root) since a verb file may not reach sideways into a sibling subsystem folder directly. characterDossier
// composes discovery's OWN portrait alignment (in-RAM cosine) with the injected `similar` search seam.

import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { cosineSim } from "@orb/kit/vector-math";
import type { DiscoveryContext } from "../context.ts";
import type { ThemeLevel } from "../contract/params.ts";
import type { CharacterDossier, HomeView, ThemeDetail } from "../contract/results.ts";
import type { DiscoveryService, ViewsDeps } from "../contract/service.ts";
import {
  readCorpusCoverage,
  readOwnedCharacterHashes,
  readOwnedPortraitPairs,
  readThemeClusterMembers,
  readThemeClusterTimeline,
} from "../persistence/embed-store-reads.ts";
import { readOwnedCardFacet } from "../persistence/summary-reads.ts";
import { collapsedPairCount } from "../substrate/collapse.ts";

const THEME_DETAIL_MEMBERS = 15;
const DOSSIER_SIMILAR_TOP_N = 8;

export function createViews(ctx: DiscoveryContext, deps: ViewsDeps): Pick<DiscoveryService, "home" | "themeDetail" | "characterDossier"> {
  return {
    home: (userId) => home(ctx.db, userId, deps),
    themeDetail: (userId, clusterIdx, level) => themeDetail(ctx.db, deps, { ownerId: userId, clusterIdx, level }),
    characterDossier: (userId, characterId) => characterDossier(ctx.db, deps, { ownerId: userId, characterId }),
  };
}

async function home(db: Db, ownerId: UserId, deps: ViewsDeps): Promise<HomeView> {
  const [coverage, sceneThemes, arcThemes, dupChars, dupChats, cardHashes] = await Promise.all([
    readCorpusCoverage(db, ownerId),
    deps.themes(ownerId, "scene"),
    deps.themes(ownerId, "arc"),
    deps.duplicateCharacters(ownerId),
    deps.duplicateChats(ownerId, { relation: "duplicate" }),
    readOwnedCharacterHashes(db, ownerId),
  ]);
  return {
    coverage,
    // COMPLETE, not top-N — the interactive rows are the only place a theme is met now (see HomeView).
    sceneThemes,
    arcThemes,
    duplicateCounts: {
      characters: dupChars.length,
      chats: dupChats.length,
      // What the pass structurally cannot report (§5.2) — never folded into `characters`, which is what the
      // pass DID find; two numbers, two meanings, so the rail can say both without either becoming a lie.
      identicalCharacterPairs: collapsedPairCount(
        cardHashes,
        (r) => r.contentHash,
        (r) => r.characterId,
      ),
    },
  };
}

/** null when no cluster matches (clusterIdx, level) for the owner. */
async function themeDetail(db: Db, deps: ViewsDeps, args: { ownerId: UserId; clusterIdx: number; level: ThemeLevel }): Promise<ThemeDetail | null> {
  const { ownerId, clusterIdx, level } = args;
  const list = await deps.themes(ownerId, level);
  const theme = list.find((t) => t.clusterIdx === clusterIdx && t.level === level);
  if (theme === undefined) {
    return null;
  }
  const [timeline, members] = await Promise.all([
    readThemeClusterTimeline(db, ownerId, theme.id),
    readThemeClusterMembers(db, ownerId, theme.id, THEME_DETAIL_MEMBERS),
  ]);
  return { ...theme, timeline, members };
}

/** null when the character isn't owned/distilled. Composes the distilled headline facets, the in-RAM
 *  portrait↔card cosine (null when there's no paired vector), and the injected `similar` neighbours. */
async function characterDossier(db: Db, deps: ViewsDeps, args: { ownerId: UserId; characterId: CharacterId }): Promise<CharacterDossier | null> {
  const { ownerId, characterId } = args;
  const card = await readOwnedCardFacet(db, ownerId, characterId);
  if (card === undefined) {
    return null;
  }
  const [pairs, similar] = await Promise.all([readOwnedPortraitPairs(db, ownerId), deps.similar(ownerId, characterId, DOSSIER_SIMILAR_TOP_N)]);
  const pair = pairs.find((p) => p.characterId === characterId);
  const portrait = pair === undefined ? null : { avatarHash: pair.avatarHash, alignment: cosineSim(pair.cardVec, pair.imageVec) };
  return {
    characterId,
    name: card.name,
    genre: card.genre,
    tone: card.tone,
    elevatorPitch: card.elevatorPitch,
    tags: card.tags,
    portrait,
    refineryScore: card.refineryScore,
    similar,
  };
}
