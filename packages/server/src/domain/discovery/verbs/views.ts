// domain/discovery/verbs/views — composed "page" views (owner-scoped reads), each bundling the several
// reads one front-end surface needs into a single owner-resolved call. Content-only (usage rollups are the
// stats domain, composed client-side). Subsystem reads arrive as injected deps (wired at the composition
// root) since a verb file may not reach sideways into a sibling subsystem folder directly.
//
// FLAG[PD-40]: characterDossier stays deferred — composes similar + portrait, neither computable here yet.

import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { ThemeLevel } from "../contract/params";
import type { HomeView, ThemeDetail } from "../contract/results";
import type { DiscoveryContext, DiscoveryService, ViewsDeps } from "../contract/service";
import {
  readCorpusCoverage,
  readThemeClusterMembers,
  readThemeClusterTimeline,
} from "../persistence/embed-store-reads";

const HOME_TOP_THEMES = 8;
const THEME_DETAIL_MEMBERS = 15;

export function createViews(
  ctx: DiscoveryContext,
  deps: ViewsDeps,
): Pick<DiscoveryService, "home" | "themeDetail"> {
  return {
    home: (userId) => home(ctx.db, userId, deps),
    themeDetail: (userId, clusterIdx, level) =>
      themeDetail(ctx.db, deps, { ownerId: userId, clusterIdx, level }),
  };
}

export async function home(db: Db, ownerId: UserId, deps: ViewsDeps): Promise<HomeView> {
  const [coverage, sceneThemes, arcThemes, dupChars, dupChats] = await Promise.all([
    readCorpusCoverage(db, ownerId),
    deps.themes(ownerId, "scene"),
    deps.themes(ownerId, "arc"),
    deps.duplicateCharacters(ownerId),
    deps.duplicateChats(ownerId, { relation: "duplicate" }),
  ]);
  return {
    coverage,
    topSceneThemes: sceneThemes.slice(0, HOME_TOP_THEMES),
    topArcThemes: arcThemes.slice(0, HOME_TOP_THEMES),
    duplicateCounts: { characters: dupChars.length, chats: dupChats.length },
  };
}

/** null when no cluster matches (clusterIdx, level) for the owner. */
export async function themeDetail(
  db: Db,
  deps: ViewsDeps,
  args: { ownerId: UserId; clusterIdx: number; level: ThemeLevel },
): Promise<ThemeDetail | null> {
  const { ownerId, clusterIdx, level } = args;
  const list = await deps.themes(ownerId, level);
  const theme = list.find((t) => t.clusterIdx === clusterIdx && t.level === level);
  if (theme === undefined) {
    return null;
  }
  const [timeline, members] = await Promise.all([
    readThemeClusterTimeline(db, theme.id),
    readThemeClusterMembers(db, theme.id, THEME_DETAIL_MEMBERS),
  ]);
  return { ...theme, timeline, members };
}
