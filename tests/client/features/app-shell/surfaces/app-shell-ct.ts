// Node-side helpers the app-shell component specs share: story ids, accessible names and routed procedures.
// In-page probes live in `@orb/testkit/browser/spec`, where their browser callbacks typecheck.
import type { TrpcRecorder } from "@orb/testkit/ct";
import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import type { CorpusWire } from "@orb/testkit/iso";
import type { Page } from "@playwright/test";

type ServedPath = Parameters<typeof serveCorpusProcedures>[1][number];

/** Every procedure a section, its context pane, the palette or the You sheet sends past Home's captures. */
export const SECTION_PROCEDURES = [
  "sessions.me",
  "notifications.markAllRead",
  "chat.listChats",
  "chat.countChats",
  "character.list",
  "character.count",
  "character.get",
  "tag.listPendingSuggestions",
  "regex.listForCharacter",
  "rosterPreset.list",
  "discovery.home",
  "discovery.characterFacets",
  "discovery.browseCharacters",
  "discovery.visualArchetypes",
  "discovery.forgottenGems",
  "discovery.archetypes",
  "discovery.catalog",
  "discovery.unusedCharacters",
  "discovery.themeDrift",
  "discovery.topKeywords",
  "discovery.modelRouting",
  "workloads.list",
  "connection.list",
  "connection.listBindings",
  "connection.resolveChatCapability",
  "plugin.list",
  "plugin.listSurfaces",
  "databank.listGlobal",
  "databank.list",
  "worldInfo.listBooks",
  "preset.list",
  "preset.get",
  "preset.resolveEffective",
  "refinery.listSessions",
  "settings.getUserSettings",
  "settings.getAppSettingsWithOverrides",
  "settings.listThemes",
  "settings.getTheme",
  "regex.countScripts",
  "regex.listScripts",
  "worldInfo.countBooks",
  "stats.freshness",
  "stats.byModel",
  "stats.leaderboard",
  "stats.wrapped",
  "stats.latency",
  "stats.timeseries",
  "stats.overview",
  "stats.momentum",
  "stats.personaUsage",
  "stats.character",
  "tag.listTagsWithUsage",
] as const satisfies readonly ServedPath[];

/** Home's captured reads, plus every listed procedure answered by `caller`, a corpus root's internal caller. */
export function routeShell(page: Page, corpus: CorpusWire, caller: object, served: readonly ServedPath[]): Promise<TrpcRecorder> {
  return routeTrpc(page, { ...createShellAmbientReads(corpus), ...serveCorpusProcedures(caller, served) });
}

/** Every procedure an open room sends past the section set, its own row included so a room the test changed reads live. */
export const ROOM_PROCEDURES = [
  "chat.getChat",
  "chat.getRuntimeVariables",
  "chat.checkSendAvailability",
  "chat.listMessages",
  "chat.listReactions",
  "chat.previewContextFit",
  "persona.listConnectedToCharacter",
  "regex.listRoomDisplayScripts",
  "plugin.listDisplayTransforms",
] as const satisfies readonly ServedPath[];

/** Home's captured reads plus the section set and an open room's reads, each answered by `caller`. */
export function routeRoom(page: Page, corpus: CorpusWire, caller: object): Promise<TrpcRecorder> {
  return routeTrpc(page, { ...createShellAmbientReads(corpus), ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES]) });
}

/** The first room of a `chat.listChats` page the user named, with more than one character seated. */
export function namedGroupRoom<const TRow extends { readonly title: string | null; readonly participantPortraits: readonly unknown[] }>(
  rows: readonly TRow[],
): TRow {
  const room = rows.find((row) => (row.title ?? "") !== "" && row.participantPortraits.length > 1);
  if (room === undefined) {
    throw new Error("The corpus has no named group room");
  }
  return room;
}

export const SHELL_STORIES = "tests/client/features/app-shell/surfaces/_app-shell-stories";

/** The ⌘K chip's accessible name leads with the word and carries the platform shortcut after it. */
export const JUMP_CHIP = /^Jump — the command menu \(/u;

export const PHONE = { width: 390, height: 844 } as const;

const TOUCH_DRAG_STEPS = 8;

/** A finger drag through Chromium's real touch pipeline, so a touch-scroll region scrolls the way a phone scrolls it. */
export async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let step = 1; step <= TOUCH_DRAG_STEPS; step += 1) {
    const x = from.x + ((to.x - from.x) * step) / TOUCH_DRAG_STEPS;
    const y = from.y + ((to.y - from.y) * step) / TOUCH_DRAG_STEPS;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}
