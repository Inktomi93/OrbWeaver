// Node-side helpers the app-shell component specs share: story ids, accessible names and in-page probes.
import type { Page } from "@playwright/test";

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
