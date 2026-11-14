// Node-side helpers the app-shell component specs share: story ids, accessible names and routed procedures.
// In-page probes live in `@orb/testkit/browser/spec`, where their browser callbacks typecheck.
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import type { TrpcRecorder } from "@orb/testkit/ct";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { COMMAND_CHIP_NAME_LEAD } from "#client/features/app-shell/lib/app-shell-names.ts";

type ServedPath = Parameters<typeof serveCorpusProcedures>[1][number];
type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

/** Home's captured reads, plus every listed procedure answered by `caller`, a corpus root's internal caller. */
export async function routeShell(page: Page, corpus: CorpusPlayback, caller: Caller, served: readonly ServedPath[]): Promise<TrpcRecorder> {
  const viewer = await caller.sessions.me();
  return routeTrpc(page, { ...createShellAmbientReads(corpus, viewer.userId), ...serveCorpusProcedures(caller, served) });
}

/** Home's captured reads plus the section set and an open room's reads, each answered by `caller`. */
export async function routeRoom(page: Page, corpus: CorpusPlayback, caller: Caller): Promise<TrpcRecorder> {
  const viewer = await caller.sessions.me();
  return routeTrpc(page, { ...createShellAmbientReads(corpus, viewer.userId), ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES]) });
}

/** The corpus viewer's first saved wallpaper, as the appearance fields that select it. */
export function wallpaper(corpus: CorpusPlayback): Partial<AppearanceSettings> {
  const entry = corpus.reads["settings.getUserSettings"][0]?.output.config.appearance.backgroundLibrary[0];
  if (entry === undefined) {
    throw new Error("The corpus viewer has no saved wallpaper");
  }
  return { backgroundImageKind: "asset", backgroundAssetId: entry.assetId, backgroundAssetHash: entry.assetHash, backgroundAssetMime: entry.mime };
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

/** Past Home: the Chats section, the reads the Add document and imagine modal bodies make, and the shell's theme reads. */
export const MODAL_SHELL_READS = [
  "sessions.me",
  "chat.listChats",
  "chat.countChats",
  "chat.getChat",
  "character.list",
  "rosterPreset.list",
  "databank.listGlobal",
  "worldInfo.listBooks",
  "settings.getUserSettings",
  "settings.listThemes",
  "settings.getTheme",
  "notifications.markAllRead",
  "plugin.list",
  "plugin.listSurfaces",
] as const satisfies readonly ServedPath[];

/** The ⌘K chip's accessible name leads with the word and carries the platform shortcut after it. */
export const JUMP_CHIP = new RegExp(`^${RegExp.escape(COMMAND_CHIP_NAME_LEAD)} \\(`, "u");

export const PHONE = { width: 390, height: 844 } as const;

/**
 * Which regime a dialog is in: a landscape phone's dialog rests its header against the top of the sheet and holds its title to one line; any other
 * dialog, short or not, lets the header scroll and the title wrap. A test that needs a short screen to reach its controls asserts this too, so it
 * fails when the regime is lost and not only when a control is.
 */
export async function expectLandscapeRegime(dialog: Locator, title: string, landscape: boolean): Promise<void> {
  await expect(dialog.locator('[data-slot="dialog-header"]')).toHaveCSS("position", landscape ? "sticky" : "static");
  await expect(dialog.getByRole("heading", { name: title, exact: true })).toHaveCSS("text-overflow", landscape ? "ellipsis" : "clip");
}

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
