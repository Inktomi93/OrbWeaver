import type { Locator, Page } from "@playwright/test";

/**
 * Where a shell modal puts arrival focus: the body anchor `ModalHost` gives every dialog, which is the element right after the dialog's
 * header. It is the one landing for a modal whose body places no focus of its own.
 */
export function dialogBodyAnchor(page: Page): Locator {
  return page.locator('[data-slot="dialog-popup"] > [data-slot="dialog-header"] + *');
}

/** The drawer a phone shows a modal in, which takes arrival focus itself. */
export function drawerPopup(page: Page): Locator {
  return page.locator('[data-slot="drawer-popup"]');
}
