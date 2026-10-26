// In-page probes the app-shell specs drive the mounted shell with. The callbacks run in the browser, so this file
// compiles in the DOM program that owns the browser support tree.

import type { Rgb } from "@orb/kit/theme-derivation";
import type { Locator, Page } from "@playwright/test";

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
export function resolvedLength(page: Page, expression: string, scope: Locator = page.locator(".shell-grid")): Promise<number> {
  return scope.evaluate((grid, value) => {
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
