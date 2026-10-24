// Node-side helpers the app-shell component specs share: story ids, accessible names and in-page probes.
import type { TrpcRecorder } from "@orb/testkit/ct";
import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import type { CorpusWire } from "@orb/testkit/iso";
import type { Locator, Page } from "@playwright/test";

type ServedPath = Parameters<typeof serveCorpusProcedures>[1][number];

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
