// domain/discovery/verbs/views — composed "page" views (owner-scoped reads). Each bundles the several reads
// ONE front-end surface needs into a single owner-resolved call. Was neo-tavern `corpus/verbs/views.ts`.
//
// CONTENT-only (Knowledge-Cluster fence): usage rollups (most-played / activity / per-model) are the `stats`
// domain, composed client-side alongside these content views. `home` = coverage + top themes + near-dup
// counts; `themeDetail` = the cluster + its story-time timeline + member characters.
//
// SUBSYSTEM reads arrive as INJECTED deps (wired at the composition root in service.ts) — a verb file may not
// reach sideways into a sibling subsystem folder (themes, duplicates) directly (depcruise
// domain-no-cross-subsystem); the type-only dep shape here is exempt. The root threads the standalone reads in.
//
// FLAG[PD-40]: `characterDossier` stays DEFERRED — it composes `similar` (search.findCharacters — the retrieval
// surface, `search-deferred-verbs.md`) + `portrait` (image-analytics cross-modal), neither of which discovery
// may compute here. Its content-only core (summary + keywords + per-character themes) can land when those two
// injected reads exist.

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

// How many top themes the home view surfaces per level + how many members a theme detail returns.
const HOME_TOP_THEMES = 8;
const THEME_DETAIL_MEMBERS = 15;

/** Bind the composed views over the DI bundle + the injected sibling reads. */
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

/** The corpus home: index coverage + top scene/arc themes + near-duplicate counts (the cleanup pile). */
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

/** One theme's detail: the cluster row + its story-time timeline + the characters most present in it. `null`
 *  when no cluster matches `(clusterIdx, level)` for the owner (the theme list is already owner-scoped). */
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
