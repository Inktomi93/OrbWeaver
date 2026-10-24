// Node-side helpers the app-shell component specs share: story ids, accessible names and in-page probes.
import type { TrpcRecorder } from "@orb/testkit/ct";
import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import type { CorpusWire } from "@orb/testkit/iso";
import type { Locator, Page } from "@playwright/test";

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
] as const satisfies readonly ServedPath[];

/** Home's captured reads, plus every listed procedure answered by `caller`, a corpus root's internal caller. */
export function routeShell(page: Page, corpus: CorpusWire, caller: object, served: readonly ServedPath[]): Promise<TrpcRecorder> {
  return routeTrpc(page, { ...createShellAmbientReads(corpus), ...serveCorpusProcedures(caller, served) });
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

// The persisted shell store's key before any viewer binds the namespace, and its version.
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
