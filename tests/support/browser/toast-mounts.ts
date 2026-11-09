// The toast-mount counter a no-toast case reads. A toast closes on a timer and a modal hides the toaster from role queries,
// so a count of the toasts on screen at one moment can miss one the case must catch.

import type { Page } from "@playwright/test";

const TOAST_ROOT = '[data-slot="toast-root"]';
const TOAST_MOUNTS_KEY = "__ctToastMounts";

/**
 * Counts every toast the page mounts from the next navigation on, including one already closed or held behind a modal.
 * A no-toast case reads it after a later control toast shows: the toaster mounts notices in the order they are raised, so
 * a toast the watched failure raised has mounted by then. Call it before `mount()`, which navigates.
 */
export async function watchToastMounts(page: Page): Promise<() => Promise<number>> {
  await page.addInitScript(
    ({ selector, key }) => {
      if (globalThis.top !== globalThis.self) {
        return;
      }
      const seen = new WeakSet<Element>();
      Reflect.set(globalThis, key, 0);
      const note = (element: Element): void => {
        for (const toast of [element, ...element.querySelectorAll(selector)]) {
          if (toast.matches(selector) && !seen.has(toast)) {
            seen.add(toast);
            Reflect.set(globalThis, key, Number(Reflect.get(globalThis, key)) + 1);
          }
        }
      };
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node instanceof Element) {
              note(node);
            }
          }
        }
      }).observe(document, { childList: true, subtree: true });
    },
    { selector: TOAST_ROOT, key: TOAST_MOUNTS_KEY },
  );
  return (): Promise<number> => page.evaluate((key) => Number(Reflect.get(globalThis, key)), TOAST_MOUNTS_KEY);
}
