// Every registered modal through the shell's one ModalHost: focus on open and on close, a locked document with the
// overflow inside the popup, Escape, and the theme, colorization and density the portal inherits from the shell.
import type { ModalSlotId } from "@orb/client/state";
import { MODAL_SLOT_IDS } from "@orb/client/state";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import type { AppShellModalStory, AppShellStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const MODAL_STORY = `${SHELL_STORIES}/AppShellModalStory`;
const POPUP = '[data-slot="dialog-popup"], [data-slot="drawer-popup"]';
// Past Home: the Chats section, every modal body and the shell's theme reads.
const SERVED = [
  "sessions.me",
  "chat.listChats",
  "chat.countChats",
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
] as const;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

function cssValue(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name).trim(), property);
}

/** Whether any box between the popup and the document scrolls, which would carry the title and close away with it. */
function outsideScroller(page: Page): Promise<string | null> {
  return page.evaluate((selector) => {
    const popup = document.querySelector(selector);
    if (popup === null) {
      return "no popup";
    }
    for (let node = popup.parentElement; node !== null; node = node.parentElement) {
      const style = getComputedStyle(node);
      if ((style.overflowY === "auto" || style.overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) {
        return node.tagName.toLowerCase() + (node.className === "" ? "" : `.${node.className.split(" ").join(".")}`);
      }
    }
    return null;
  }, POPUP);
}

/** Scroll the popup's own scroll region to its end; the header must not travel with it. */
function scrollPopupToEnd(page: Page): Promise<boolean> {
  return page.evaluate((selector) => {
    const popup = document.querySelector(selector);
    const region = [...(popup?.querySelectorAll("*") ?? [])].find((node) => {
      const style = getComputedStyle(node);
      return (style.overflowY === "auto" || style.overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1;
    });
    if (region === undefined) {
      return false;
    }
    region.scrollTop = region.scrollHeight;
    return true;
  }, POPUP);
}

test.describe("on the corpus owner's own settings", () => {
  let root: Root;

  test.beforeAll(async () => {
    root = await createCorpusHarness();
  });

  test.beforeEach(async ({ corpus, page }) => {
    await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SERVED);
  });

  test.afterAll(async () => {
    await root[Symbol.asyncDispose]();
  });

  test("closing New chat returns focus to the Chats list's New button that opened it", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    await page.locator(".shell-rail").getByRole("button", { name: "Chats", exact: true }).click();
    const opener = page.locator('.shell-panel[data-panel-side="list"]').getByRole("button", { name: "New", exact: true });
    await opener.focus();
    await opener.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("switching Add document's mode moves neither its mode strip nor its footer, every arm offers Cancel, and its teaching line reads at least label size", async ({
    mount,
    page,
  }) => {
    await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "addDocument" });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // The mode strip is the row of pressable modes directly above the region the arms swap through.
    const modes = await dialog.locator("button[aria-pressed]").evaluateAll((buttons) => {
      const strip = buttons.at(-1)?.parentElement;
      return buttons.filter((button) => button.parentElement === strip).map((button) => button.textContent);
    });
    expect(modes.length).toBe(3);
    const arms: { strip: number; footerGap: number; regionShort: number; cancels: number }[] = [];
    for (const label of modes) {
      await dialog.getByRole("button", { name: label, exact: true }).click();
      await expect(dialog.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
      arms.push(
        await dialog
          .locator("button[aria-pressed]")
          .last()
          .evaluate((button) => {
            const strip = button.parentElement;
            const region = strip?.nextElementSibling;
            const footer = region?.querySelector('[data-slot="dialog-footer"]');
            const regionBox = region?.getBoundingClientRect();
            const floor = region === null || region === undefined ? 0 : Number.parseFloat(getComputedStyle(region).minHeight);
            return {
              strip: strip?.getBoundingClientRect().y ?? Number.NaN,
              footerGap: (regionBox?.bottom ?? Number.NaN) - (footer?.getBoundingClientRect().bottom ?? Number.NaN),
              regionShort: floor - (regionBox?.height ?? Number.NaN),
              cancels: [...(region?.querySelectorAll("button") ?? [])].filter((candidate) => candidate.textContent === "Cancel").length,
            };
          }),
      );
    }
    const ys = arms.map((arm) => arm.strip);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(1);
    // Every arm hangs its footer at the same distance from the reserved floor, so a short arm leaves no void under Cancel.
    const gaps = arms.map((arm) => arm.footerGap);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
    expect(arms.map((arm) => ({ floorKept: arm.regionShort <= 1, cancels: arm.cancels }))).toStrictEqual(arms.map(() => ({ floorKept: true, cancels: 1 })));
    const teaching = dialog.locator('[data-slot="text"][data-voice="reading"]');
    const label = dialog.locator('[data-slot="field-label"]').first();
    await expect(teaching).toHaveCount(1);
    await expect(label).toBeVisible();
    const fontPx = (locator: Locator): Promise<number> => locator.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(await fontPx(teaching)).toBeGreaterThanOrEqual(await fontPx(label));
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });

  // Add document's body does not focus a control of its own, so the host's initial focus is what decides.
  test("a modal opens with focus in its body, never on Close, so the first Enter keeps it open", async ({ mount, page }) => {
    await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "addDocument" });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).not.toBeFocused();
    // The host's body anchor: inside the popup, not its frame, and out of the tab order so Tab still starts at the first control.
    await expect
      .poll(() =>
        page.evaluate((selector) => {
          const active = document.activeElement;
          const popup = document.querySelector(selector);
          if (!(active instanceof HTMLElement) || popup === null || !popup.contains(active) || active === popup) {
            return "outside";
          }
          return active.tabIndex;
        }, POPUP),
      )
      .toBe(-1);
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
  });

  test("at a short viewport the New chat body overflows inside its own popup", async ({ mount, page }) => {
    await page.setViewportSize({ width: 1024, height: 320 });
    await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "newChat" });
    await expect(page.getByRole("dialog")).toBeVisible();
    // The positive control for the loop below: a real body does overflow here, and only inside the popup.
    await expect.poll(() => scrollPopupToEnd(page)).toBe(true);
  });

  for (const modalId of MODAL_SLOT_IDS) {
    test(`the ${modalId} modal keeps the document still and its header put, whatever its body's height`, async ({ mount, page }) => {
      await page.setViewportSize({ width: 1024, height: 320 });
      await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId });
      const popup = page.locator(POPUP);
      await expect(popup).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() => {
            const html = document.documentElement;
            return ["clip", "hidden"].includes(getComputedStyle(html).overflowY) && html.scrollHeight <= html.clientHeight + 1;
          }),
        )
        .toBe(true);
      await expect.poll(() => outsideScroller(page)).toBeNull();
      const header = page.locator('[data-slot="dialog-header"]');
      const before = await header.boundingBox();
      await scrollPopupToEnd(page);
      await expect.poll(async () => Math.abs(((await header.boundingBox())?.y ?? Number.NaN) - (before?.y ?? Number.NaN))).toBeLessThan(1.5);
    });

    test(`Escape closes the ${modalId} modal`, async ({ mount, page }) => {
      await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId });
      const popup = page.locator(POPUP);
      await expect(popup).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(popup).toHaveCount(0);
    });
  }

  test("the You drawer's sticky header sits on the raised stratum and paints above its scrolled content", async ({ mount, page }) => {
    await page.setViewportSize({ width: 1024, height: 320 });
    await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "you" });
    const header = page.locator('[data-slot="drawer-popup"] [data-slot="dialog-header"]');
    await expect(header).toBeVisible();
    await expect(header).toHaveCSS("position", "sticky");
    await expect(header).toHaveCSS("z-index", TOKENS["z.raised"].value);
    expect(await scrollPopupToEnd(page)).toBe(true);
    await expect
      .poll(() =>
        header.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const winner = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return winner !== null && element.contains(winner);
        }),
      )
      .toBe(true);
  });
});

/** A corpus root whose owner has a custom theme selected, with the appearance patch applied over the owner's own. */
async function themedRoot(override: Record<string, string>, appearance: Record<string, unknown> = {}): Promise<{ root: Root; themeId: string }> {
  const root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const theme = await caller.settings.createTheme({
    name: "Shell CT theme",
    override,
    css: '[data-slot="dialog-header"] { outline: 2px solid var(--color-border); }',
  });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: theme.id } });
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
  return { root, themeId: theme.id };
}

const CUSTOM_DARK = { accent: "oklch(0.72 0.19 152)", background: "oklch(0.24 0.06 272)" };
const CUSTOM_LIGHT = { accent: "oklch(0.72 0.19 152)", background: "oklch(0.94 0.02 92)" };

for (const modalId of MODAL_SLOT_IDS) {
  test(`the ${modalId} modal paints the selected custom theme's background through the portal`, async ({ corpus, mount, page }) => {
    const { root } = await themedRoot(CUSTOM_DARK);
    await using _root = root;
    await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SERVED);
    await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId });
    const popup = page.locator(POPUP);
    await expect(popup).toBeVisible();
    await expect.poll(() => cssValue(popup, "--color-background")).toBe(CUSTOM_DARK.background);
  });
}

test("a custom light theme carries its palette and light polarity through the shell, the portal root and the popup", async ({ corpus, mount, page }) => {
  const { root } = await themedRoot(CUSTOM_LIGHT);
  await using _root = root;
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SERVED);
  await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "command" });
  const scope = page.locator('[data-slot="theme-scope"]:has(.shell-grid)');
  const portal = page.locator('[data-slot="portal-root"]');
  const popup = page.locator('[data-slot="dialog-popup"]');
  await expect(popup).toBeVisible();
  // A custom theme has no seed selector: what the live scope paints is the proof of what won.
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  for (const surface of [scope, portal, popup]) {
    await expect.poll(() => cssValue(surface, "--color-background")).toBe(CUSTOM_LIGHT.background);
    await expect.poll(() => cssValue(surface, "color-scheme")).toBe("light");
  }
  await expect(page.locator("style[data-orb-theme-css]")).toHaveCount(1);
});

for (const modalId of ["command", "you"] as const satisfies readonly ModalSlotId[]) {
  test(`colorization follows the shell into the ${modalId} portal without a remount, and a nested theme scope keeps its own`, async ({
    corpus,
    mount,
    page,
  }) => {
    const { root } = await themedRoot(CUSTOM_DARK, { enableThemeColorization: false });
    await using _root = root;
    await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SERVED);
    await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId });
    const grid = page.locator(".shell-grid");
    const portal = page.locator('[data-slot="portal-root"]');
    const popup = page.locator(POPUP);
    const header = page.locator('[data-slot="dialog-header"]');
    await expect(popup).toBeVisible();
    await expect.poll(() => cssValue(page.locator('[data-slot="theme-scope"]:has(.shell-grid)'), "--color-primary")).toBe(CUSTOM_DARK.accent);
    await popup.evaluate((element) => element.setAttribute("data-colorization-node", "same-node"));
    const borders = (): Promise<string[]> =>
      Promise.all([cssValue(grid, "--color-border"), cssValue(portal, "--color-border"), cssValue(popup, "--color-border")]);

    // The root effect's own stamp, driven directly so the same popup node is observed in both arms.
    await page.evaluate(() => document.documentElement.removeAttribute("data-theme-colorization"));
    const off = await borders();
    expect(new Set(off).size).toBe(1);
    const offHeaderOutline = await header.evaluate((element) => getComputedStyle(element).outlineColor);

    await page.evaluate(() => document.documentElement.setAttribute("data-theme-colorization", ""));
    await expect.poll(() => cssValue(grid, "--color-border")).not.toBe(off[0]);
    const on = await borders();
    expect(on[1]).toBe(on[0]);
    expect(on[2]).toBe(on[0]);
    await expect(popup).toHaveAttribute("data-colorization-node", "same-node");
    // The selected theme's own CSS consumes the inherited token, so it follows too.
    await expect.poll(() => header.evaluate((element) => getComputedStyle(element).outlineColor)).not.toBe(offHeaderOutline);

    await page.evaluate(() => document.documentElement.removeAttribute("data-theme-colorization"));
    await expect.poll(() => cssValue(popup, "--color-border")).toBe(off[0]);
  });
}

test("a seed theme keeps one border token across the root, the shell and the portal in both colorization arms", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SERVED);
  await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "command" });
  await expect(page.locator('[data-slot="dialog-popup"]')).toBeVisible();
  const surfaces = [page.locator("html"), page.locator(".shell-grid"), page.locator('[data-slot="portal-root"]'), page.locator('[data-slot="dialog-popup"]')];
  const borders = (): Promise<string[]> => Promise.all(surfaces.map((surface) => cssValue(surface, "--color-border")));
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme-colorization"));
  const off = await borders();
  expect(new Set(off).size).toBe(1);
  await page.evaluate(() => document.documentElement.setAttribute("data-theme-colorization", ""));
  await expect.poll(borders).not.toEqual(off);
  expect(new Set(await borders()).size).toBe(1);
});

const SPACING_INTENTS = ["--spacing-field", "--spacing-row", "--spacing-block", "--spacing-section"] as const;

function spacingIntents(locator: Locator): Promise<readonly string[]> {
  return locator.evaluate((element, names) => names.map((name) => getComputedStyle(element).getPropertyValue(name).trim()), SPACING_INTENTS);
}

/** The spacing a bare element under `density` resolves to, read off the page's own sheet. */
function canonicalSpacing(page: Page, density: string): Promise<readonly string[]> {
  return page.evaluate(
    ({ value, names }) => {
      const probe = document.createElement("div");
      probe.setAttribute("data-density", value);
      document.body.append(probe);
      const values = names.map((name) => getComputedStyle(probe).getPropertyValue(name).trim());
      probe.remove();
      return values;
    },
    { value: density, names: SPACING_INTENTS },
  );
}

for (const density of ["comfortable", "compact"] as const) {
  test(`the ${density} density lives on the one scope above the shell and the portal, so a dialog spaces like the shell`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: { density } });
    await routeShell(page, corpus, caller, SERVED);
    await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "newChat" });
    const scope = page.locator('[data-slot="theme-scope"]:has(.shell-grid)');
    const popup = page.locator('[data-slot="dialog-popup"]');
    await expect(scope).toHaveAttribute("data-density", density);
    await expect(popup).toBeVisible();
    expect(await spacingIntents(popup)).toEqual(await spacingIntents(page.locator(".shell-grid")));
    expect(await spacingIntents(popup)).toEqual(await canonicalSpacing(page, density));
    await expect(page.locator(".shell-grid")).not.toHaveAttribute("data-density");
    await expect(page.locator('[data-slot="portal-root"] [data-slot="dialog-popup"]')).toHaveCount(1);
  });
}

test("a custom theme's own density wins over the viewer's appearance density, in the shell and its portal alike", async ({ corpus, mount, page }) => {
  const { root } = await themedRoot({ density: "compact" }, { density: "comfortable" });
  await using _root = root;
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SERVED);
  await mount<typeof AppShellModalStory>(MODAL_STORY, { modalId: "newChat" });
  await expect(page.locator('[data-slot="theme-scope"]:has(.shell-grid)')).toHaveAttribute("data-density", "compact");
  const popup = page.locator('[data-slot="dialog-popup"]');
  await expect(popup).toBeVisible();
  await expect.poll(() => spacingIntents(popup)).toEqual(await canonicalSpacing(page, "compact"));
});
