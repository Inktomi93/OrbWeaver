// Node-side helpers the app-shell component specs share: story ids, accessible names and in-page probes.
import type { Rgb } from "@orb/kit/theme-derivation";
import type { TrpcRecorder } from "@orb/testkit/ct";
import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import type { CorpusWire } from "@orb/testkit/iso";
import type { CDPSession, Locator, Page } from "@playwright/test";

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

interface ShortcutInit {
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly key?: string;
  readonly metaKey?: boolean;
  readonly repeat?: boolean;
  readonly shiftKey?: boolean;
}

const SETTLE_FRAMES = 120;

/** A rendered box once two reads a painted frame apart agree, so an entering transition is never measured mid-flight. */
export async function settledBox(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  await locator.waitFor({ state: "visible" });
  const page = locator.page();
  let previous = await locator.boundingBox();
  for (let frame = 0; frame < SETTLE_FRAMES; frame += 1) {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    const current = await locator.boundingBox();
    if (current !== null && JSON.stringify(current) === JSON.stringify(previous)) {
      return current;
    }
    previous = current;
  }
  throw new Error(`the box never settled: last ${JSON.stringify(previous)}`);
}

/**
 * Drag and drop a synthetic transfer onto `target` and report whether the drop's default was cancelled, which is
 * what stops the browser navigating the tab to a dropped file. The probe listens on window after the shell's own guard.
 */
export async function dropOn(target: Locator, transfer: { readonly file: string; readonly type: string } | { readonly text: string }): Promise<boolean> {
  const page = target.page();
  await page.evaluate(() => {
    document.body.removeAttribute("data-drop-prevented");
    globalThis.addEventListener("drop", (event) => document.body.setAttribute("data-drop-prevented", String(event.defaultPrevented)), { once: true });
  });
  const dataTransfer = await page.evaluateHandle((data) => {
    const dt = new DataTransfer();
    if ("file" in data) {
      dt.items.add(new File(["dropped-bytes"], data.file, { type: data.type }));
    } else {
      dt.setData("text/plain", data.text);
    }
    return dt;
  }, transfer);
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
  return page.evaluate(() => document.body.getAttribute("data-drop-prevented") === "true");
}

// The persisted shell store's key before any viewer binds the namespace, and its version. No door exports either;
// the panels spec polls the persisted overrides after a toggle, so a drifted key or version fails there.
const UNBOUND_SHELL_KEY = "orb:shell";
const SHELL_STORE_VERSION = 2;

/** Seed the shell store's storage before the app's modules run, the way a returning boot rehydrates it. */
export async function seedShellState(page: Page, state: { readonly activeSection: string; readonly panelOverrides?: object }): Promise<void> {
  await page.addInitScript(
    ({ key, blob }) => {
      globalThis.localStorage.setItem(key, blob);
    },
    { key: UNBOUND_SHELL_KEY, blob: JSON.stringify({ state: { panelOverrides: {}, ...state }, version: SHELL_STORE_VERSION }) },
  );
}

/** The shell store's persisted panel overrides, or `null` before its first write. */
export function persistedOverrides(page: Page): Promise<unknown> {
  return page.evaluate((key) => {
    const raw = globalThis.localStorage.getItem(key);
    return raw === null ? null : ((JSON.parse(raw) as { state?: { panelOverrides?: unknown } }).state?.panelOverrides ?? null);
  }, UNBOUND_SHELL_KEY);
}

/** A length custom property resolved to px by laying a box out at it; a computed custom property is only its token stream. */
export function resolvedLength(page: Page, expression: string): Promise<number> {
  return page.locator(".shell-grid").evaluate((grid, value) => {
    const probe = grid.ownerDocument.createElement("div");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.width = value;
    grid.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  }, expression);
}

/** rail | list | content | context, in px, off the grid's own resolved template. */
export async function shellTracks(page: Page): Promise<readonly number[]> {
  const columns = await page.locator(".shell-grid").evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  return columns.split(" ").map((track) => Number.parseFloat(track));
}

/** One framebuffer pixel, decoded in the page; a translucent border over glass has no computed-style answer. */
export async function pixel(page: Page, x: number, y: number): Promise<Rgb> {
  const shot = await page.screenshot({ clip: { height: 1, width: 1, x, y } });
  return page.evaluate(
    async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d");
      context?.drawImage(image, 0, 0);
      const [r = 0, g = 0, b = 0] = context?.getImageData(0, 0, 1, 1).data ?? [];
      return { b, g, r };
    },
    `data:image/png;base64,${shot.toString("base64")}`,
  );
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

/** Dispatch one synthetic `k` keydown and report whether the shell cancelled its default. */
export function dispatchCommandKey(page: Page, init: ShortcutInit, targetSelector?: string): Promise<boolean> {
  return page.evaluate(
    ({ eventInit, selector }) => {
      const target = selector === undefined ? document : document.querySelector(selector);
      if (target === null) {
        throw new Error(`missing shortcut target: ${String(selector)}`);
      }
      const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "k", ...eventInit });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    },
    { eventInit: init, selector: targetSelector },
  );
}

/** The user media preferences a case states; each one it leaves out is emulated as `no-preference`. */
export interface MediaState {
  readonly contrast?: "more" | "no-preference";
  readonly transparency?: "reduce" | "no-preference";
  readonly motion?: "reduce" | "no-preference";
}

const mediaSessions = new WeakMap<Page, CDPSession>();

/**
 * State the whole emulated media list in one CDP call. Playwright models no reduced-transparency, and its own
 * `emulateMedia` replaces the CDP feature list, so a spec using this emulates media only here. The session stays
 * attached until {@link releaseEmulatedMedia}: its overrides end when it detaches.
 */
export async function emulateMedia(page: Page, media: MediaState): Promise<void> {
  const session = mediaSessions.get(page) ?? (await page.context().newCDPSession(page));
  mediaSessions.set(page, session);
  const features = [
    { name: "prefers-color-scheme", value: "dark" },
    { name: "prefers-reduced-motion", value: media.motion ?? "no-preference" },
    { name: "prefers-contrast", value: media.contrast ?? "no-preference" },
    { name: "prefers-reduced-transparency", value: media.transparency ?? "no-preference" },
  ];
  await session.send("Emulation.setEmulatedMedia", { features });
  const missed = await page.evaluate((list) => list.filter(({ name, value }) => !matchMedia(`(${name}: ${value})`).matches), features);
  if (missed.length > 0) {
    throw new Error(`Chromium did not take the emulated media ${JSON.stringify(missed)}`);
  }
}

/**
 * Detach the media session, ending its overrides. The gallery keeps one page per worker, so a session left attached
 * outlives its test and overrides a later spec's own `page.emulateMedia` (a print case stays on screen media).
 */
export async function releaseEmulatedMedia(page: Page): Promise<void> {
  const session = mediaSessions.get(page);
  mediaSessions.delete(page);
  await session?.detach();
}
