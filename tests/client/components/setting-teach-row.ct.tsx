// CT: the SettingRow's §3.4 ROW CHROME (#866, the deferred leg un-deferred — config-revamp-design.md
// §7.7): the modified stripe, the reveal-on-hover ⋯ (Reset · Copy id · Copy link), and the aesthetic bar
// the owner set — rest byte-identical, ZERO layout shift on reveal, coarse pointers get NO rest-invisible
// control (About is their Reset door; the teacher CT pins that half).
//
// Driven through the PRODUCTION seam — `ConfigHostStory` mounts the real appearance group, whose
// message-style rows carry real `key` bindings — with `settings.getUserSettings` stubbed so exactly ONE
// row differs from the contract default. Both stripe directions are therefore planted: the modified row
// must wear it AND its unmodified sibling must not (a stripe that paints everywhere would pass a
// presence-only pin).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../support/ct/route-trpc.ts";
import { ConfigHostStory } from "../features/config/_ct-stories.tsx";

const DEFAULT_QUOTED = DEFAULT_USER_SETTINGS.appearance.colorQuotedSpeech;
const MODIFIED_ROW = '[data-setting="color-quoted-speech"]';
const UNMODIFIED_ROW = '[data-setting="chat-style"]';
const RAIL = '[data-slot="setting-modified-rail"]';
const MENU = '[data-slot="setting-row-menu"]';
const SAVE_PROC = "settings.updateUserSettingsSection";

/** Real defaults EXCEPT `appearance.colorQuotedSpeech`, flipped — the one planted difference. */
function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => ({
      userId: "user_ct_rowchrome",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, appearance: { ...DEFAULT_USER_SETTINGS.appearance, colorQuotedSpeech: !DEFAULT_QUOTED } },
      updatedAt: 0,
    }),
    "settings.listThemes": () => [],
    "rosterPreset.list": [],
    "sessions.me": { userId: "user_ct_rowchrome", handle: "ct_rowchrome", globalRole: "user" },
    "worldInfo.listBooksWithUsage": () => [],
    // The LIST pane's collection counts — fed empty (this file is about the CONTENT rows).
    "tag.listTagsWithUsage": () => [],
    "regex.listScripts": () => [],
    "persona.list": () => [],
    "character.list": () => ({ items: [], nextCursor: null }),
    [SAVE_PROC]: () => ({}),
  });
}

/** Every arm mounts the same appearance landing; the rows under test are its plain sections. */
async function awaitRows(page: Page): Promise<void> {
  await expect(page.locator(MODIFIED_ROW)).toBeVisible();
}

test("the modified STRIPE paints on the differing row and ONLY there — with its sr-only telling", async ({ mount, page }) => {
  await stub(page);
  await mount(<ConfigHostStory target="appearance" />);
  await awaitRows(page);

  const modified = page.locator(MODIFIED_ROW);
  await expect(modified).toHaveAttribute("data-modified", "");
  await expect(modified.locator(RAIL)).toHaveCount(1);
  await expect(modified.getByText("Modified from its default.")).toHaveCount(1);

  const unmodified = page.locator(UNMODIFIED_ROW);
  await expect(unmodified).not.toHaveAttribute("data-modified", "");
  await expect(unmodified.locator(RAIL)).toHaveCount(0);
  await expect(unmodified.getByText("Modified from its default.")).toHaveCount(0);
});

test("the ⋯ is INVISIBLE at rest, fades in on hover, and the row does not move a pixel — the zero-shift bar", async ({ mount, page }) => {
  await stub(page);
  await mount(<ConfigHostStory target="appearance" />);
  await awaitRows(page);

  const row = page.locator(MODIFIED_ROW);
  const menu = row.locator(MENU);
  // Scroll the row into view BEFORE the rest capture: `boundingBox()` is viewport-relative, and the
  // §7.8 chat-style card grid pushed this row below the story fold — a `hover()`-triggered auto-scroll
  // would read as a phantom "shift" (measured: y 739 → 277, pure scroll, zero layout change).
  await row.scrollIntoViewIfNeeded();
  // REST: the slot is reserved (a real box — that is what makes the reveal shiftless) but paints nothing.
  await expect.poll(() => menu.evaluate((el: HTMLElement) => getComputedStyle(el).opacity)).toBe("0");

  const restRow = await row.boundingBox();
  const restControl = await row.getByRole("switch").boundingBox();

  await row.getByRole("switch").hover();
  await expect.poll(() => menu.evaluate((el: HTMLElement) => getComputedStyle(el).opacity)).toBe("1");

  // ZERO LAYOUT SHIFT (the owner's bar): the row's box and its control's box are byte-identical across
  // the reveal — the slot was reserved, nothing widened, nothing jumped. Polled (the oneshot gate):
  // equality must HOLD at settle, and a mid-transition sample that differed would rightly fail anyway —
  // opacity is the only thing the reveal may animate.
  await expect.poll(() => row.boundingBox()).toEqual(restRow);
  await expect.poll(() => row.getByRole("switch").boundingBox()).toEqual(restControl);
});

test("Reset fires the section's exact wire — the default value back through updateUserSettingsSection", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ConfigHostStory target="appearance" />);
  await awaitRows(page);

  const row = page.locator(MODIFIED_ROW);
  await row.getByRole("switch").hover();
  await row.getByRole("button", { name: "Actions for Color quoted speech" }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Reset to default" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Reset to default" }).click();

  await expect
    .poll(() => trpc.lastInput(SAVE_PROC), { intervals: [20, 50, 100] })
    .toEqual({ section: "appearance", patch: { colorQuotedSpeech: DEFAULT_QUOTED } });
});

test("an UNMODIFIED row's Reset is disabled with its reason — a verb only where there is something to do", async ({ mount, page }) => {
  await stub(page);
  await mount(<ConfigHostStory target="appearance" />);
  await awaitRows(page);

  const row = page.locator(UNMODIFIED_ROW);
  // Hover the row's non-interactive area (the label forwards to the Select trigger, whose inert
  // backdrop would swallow the menu click — the teacher CT's own lesson).
  await row.locator(MENU).hover();
  await row.getByRole("button", { name: "Actions for Chat display" }).click();
  const item = page.getByRole("menu").getByRole("menuitem", { name: "Reset to default" });
  await expect(item).toBeVisible();
  await expect(item).toHaveAttribute("data-disabled", "");
});

test.describe("the copy verbs land the exact strings", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("Copy setting id → the dotted address; Copy link → the /config?to= deep link", async ({ mount, page }) => {
    await stub(page);
    await mount(<ConfigHostStory target="appearance" />);
    await awaitRows(page);

    const row = page.locator(MODIFIED_ROW);
    await row.getByRole("switch").hover();
    await row.getByRole("button", { name: "Actions for Color quoted speech" }).click();
    await page.getByRole("menu").getByRole("menuitem", { name: "Copy setting id" }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("appearance.message-style.color-quoted-speech");

    await row.getByRole("switch").hover();
    await row.getByRole("button", { name: "Actions for Color quoted speech" }).click();
    await page.getByRole("menu").getByRole("menuitem", { name: "Copy link" }).click();
    await expect
      .poll(async () => {
        const text = await page.evaluate(() => navigator.clipboard.readText());
        return text.endsWith("/config?to=appearance.message-style.color-quoted-speech") && text.startsWith("http");
      })
      .toBe(true);
  });
});

// ── COARSE: the menu is GONE, not merely faint (the rider: touch reaches Reset through About's door —
// a rest-invisible control on a pointer class with no hover would be unreachable chrome). `hasTouch`
// flips `matchMedia("(pointer: coarse)")` in chromium (the touch-target-floor precedent).
test.describe("coarse pointer", () => {
  test.use({ hasTouch: true });

  test("the row menu is display-gone at coarse — About is the Reset door there", async ({ mount, page }) => {
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await stub(page);
    await mount(<ConfigHostStory target="appearance" />);
    await awaitRows(page);

    const row = page.locator(MODIFIED_ROW);
    await expect(row.locator(MENU)).toBeHidden();
    // …while the stripe (state, not a control) still paints: a phone reader keeps the modified fact.
    await expect(row.locator(RAIL)).toHaveCount(1);
  });
});
