// CT: the SettingRow's ANATOMY and its §3.4 ROW CHROME — the modified stripe, the reveal-on-hover action
// cell, the label-adjacent `i` (#927), the measure-capped shared-track geometry (#932) and the dev/prod
// action arms (#928). The aesthetic bar the owner set is unchanged: rest byte-identical, ZERO layout shift
// on reveal, coarse pointers get NO rest-invisible control (About is their Reset door).
//
// Driven through the PRODUCTION seam — `ConfigHostStory` mounts the real appearance group, whose
// message-style rows carry real `key` bindings and real registry `teach` — with `settings.getUserSettings`
// stubbed so exactly ONE row differs from the contract default. Both stripe directions are therefore
// planted: the modified row must wear it AND its unmodified sibling must not.
//
// GEOMETRY IS ASSERTED OVER A WIDTH MATRIX, never at one width: `row-void` fired 8× at 63-77% in every
// pane state EXCEPT the ~520px `both-docked` column, i.e. the defect switched off when the column narrowed,
// so a single-width receipt would have "passed" on main at the narrow end (re-drive #1099 G6). The three
// host widths below straddle that: a docked-list desktop, the crossover, and the both-docked column.

import { rowActionsName } from "@orb/client/lib";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { beforeHitBox, touchFloorPx } from "../../support/browser/touch-floor.ts";
import type { TrpcRecorder } from "../../support/node/route-trpc.ts";
import { routeTrpc } from "../../support/node/route-trpc.ts";
import { ConfigHostStory } from "../features/config/_ct-stories.tsx";
import { SettingRowDevMenuStory, SettingRowResetStory } from "./setting-row-actions.fixtures.tsx";

const DEFAULT_QUOTED = DEFAULT_USER_SETTINGS.appearance.colorQuotedSpeech;
const MODIFIED_ROW = '[data-setting="color-quoted-speech"]';
const UNMODIFIED_ROW = '[data-setting="auto-fix-markdown"]';
const RAIL = '[data-slot="setting-modified-rail"]';
const ACTIONS = '[data-slot="setting-row-actions"]';
const SAVE_PROC = "settings.updateUserSettingsSection";

/** The registry gloss the row now renders for the modified row — `teach.summary`'s first sentence, which
 *  is what makes the row self-explanatory at rest (only 8 of 24 were, re-drive E5). */
const QUOTED_GLOSS = "Tints “quoted speech” with the theme's dialogue color (SillyTavern-style) — a character's own theme wins.";
/** …and its `i` tooltip, which answers MORE rather than WHAT (the gloss already said what). */
const QUOTED_HINT = "Affects quoted dialogue in every message.";

/** Real defaults EXCEPT `appearance.colorQuotedSpeech`, flipped — the one planted difference. */
function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => ({
      userId: "user_ct_rowchrome",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, appearance: { ...DEFAULT_USER_SETTINGS.appearance, colorQuotedSpeech: !DEFAULT_QUOTED } },
      updatedAt: 0,
      configUnreadable: null,
    }),
    "settings.listThemes": () => [],
    "rosterPreset.list": [],
    "sessions.me": { userId: "user_ct_rowchrome", handle: "ct_rowchrome", globalRole: "user" as const },
    "worldInfo.listBooksWithUsage": () => [],
    // The LIST pane's collection counts — fed empty (this file is about the CONTENT rows).
    "tag.listTagsWithUsage": () => [],
    "regex.listScripts": () => [],
    "persona.list": () => [],
    "character.list": () => ({ items: [], nextCursor: null }),
    [SAVE_PROC]: () => ({
      userId: "user_ct_rowchrome",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, appearance: { ...DEFAULT_USER_SETTINGS.appearance, colorQuotedSpeech: !DEFAULT_QUOTED } },
      updatedAt: 0,
      configUnreadable: null,
    }),
  });
}

/** Every arm mounts the same appearance landing; the rows under test are its plain sections. */
async function awaitRows(page: Page): Promise<void> {
  await expect(page.locator(MODIFIED_ROW)).toBeVisible();
}

async function box(locator: Locator): Promise<{ left: number; right: number; top: number; width: number }> {
  const rect = await locator.boundingBox();
  if (rect === null) {
    throw new Error("expected a rendered box");
  }
  return { left: rect.x, right: rect.x + rect.width, top: rect.y, width: rect.width };
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

// ── #927 — THE `i` IS AN ANNOTATION ON THE LABEL, NOT A THIRD ROW ACTION ───────────────────────────────
// It used to be the row's LAST child, past the control and past the row menu, where adjacency claimed the
// wrong subject. Asserted STRUCTURALLY (it lives inside the Field's own label block) rather than by
// position, because "left of the control" is a fact a stacked narrow arm legitimately changes.
test("the `i` renders INSIDE the Field's label block, and the control's accessible name is the label alone", async ({ mount, page }) => {
  await stub(page);
  await mount(<ConfigHostStory target="appearance" />);
  await awaitRows(page);

  const row = page.locator(MODIFIED_ROW);
  await expect(row.locator('[data-slot="field-label-block"] [data-slot="hint-trigger"]')).toHaveCount(1);
  // The trigger is NOT in the action cell — the cluster the owner wanted kept quiet.
  await expect(row.locator(`${ACTIONS} [data-slot="hint-trigger"]`)).toHaveCount(0);
  // The sibling anatomy is what keeps "More info" out of the control's accname (W3C subtree concatenation).
  await expect(page.getByRole("switch", { name: "Color quoted speech", exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "More info about Color quoted speech" })).toBeVisible();
});

test("activating the `i` opens the teacher — the tooltip is the hover half, the click is the door (F-6)", async ({ mount, page }) => {
  await stub(page);
  await mount(<ConfigHostStory target="appearance" />);
  await awaitRows(page);

  const info = page.locator(MODIFIED_ROW).getByRole("button", { name: "More info about Color quoted speech" });
  await info.hover();
  await expect(page.getByText(QUOTED_HINT)).toBeVisible();
  await info.click();
  // The door's effect is the FOCUSED-SETTING publication the context pane reads; the row is what states it.
  await expect(page.locator(MODIFIED_ROW)).toBeVisible();
});

// ── #932 E5 — THE GLOSS IS BACK, VISIBLE AND DESCRIBING ────────────────────────────────────────────────
test("the registry gloss renders under the label AND lands in the control's accessible description", async ({ mount, page }) => {
  await stub(page);
  await mount(<ConfigHostStory target="appearance" />);
  await awaitRows(page);

  const row = page.locator(MODIFIED_ROW);
  await expect(row.locator('[data-slot="field-description"]')).toHaveText(QUOTED_GLOSS);
  // Fully present in `aria-describedby`, not merely on screen — Base UI's Field.Description registers it.
  await expect(row.getByRole("switch")).toHaveAccessibleDescription(QUOTED_GLOSS);
});

// ── #932 E1/G6 — THE VOID, OVER A WIDTH MATRIX ────────────────────────────────────────────────────────
// `row-void`'s own thresholds are the oracle: it fires at a gap ≥240px AND ≥45% of the row. A row whose
// label→control gap clears BOTH at every width in the matrix is a row the detector cannot file.
const VOID_MIN_PX = 240;
const VOID_MIN_RATIO = 0.45;

// RED-FIRST, MEASURED (2026-09-02, this spec run against the UNMODIFIED source): the 1600 and 1280 arms
// FAILED — 557px of gap at a 1280 host — and the 900 and 830 arms PASSED. Those two narrow arms are
// therefore FENCES, not defect proofs, and they are kept deliberately: the defect's own signature is that
// it disappears as the column narrows (G6), so a fix that only worked wide would be caught here.
for (const width of [1600, 1280, 900, 830]) {
  test(`at a ${String(width)}px host the label and its control are adjacent — no row-void by the detector's own thresholds`, async ({ mount, page }) => {
    await stub(page);
    await mount(<ConfigHostStory target="appearance" width={width} />);
    await awaitRows(page);

    const row = page.locator(MODIFIED_ROW);
    const rowBox = await box(row);
    // The LABEL element, not `field-label-block`: in track mode that block is `display: contents` (it has
    // no box — its label and its gloss are grid items of the section's tracks), and measuring from the
    // label's own right edge is the stricter read anyway, because it is the ink the eye actually leaves.
    const labelBox = await box(row.locator('[data-slot="field-label"]'));
    const controlBox = await box(row.locator('[data-slot="field-control-col"]'));
    const gap = controlBox.left - labelBox.right;
    expect(gap).toBeLessThan(VOID_MIN_PX);
    expect(gap / rowBox.width).toBeLessThan(VOID_MIN_RATIO);
  });
}

test("every row in a section starts its control at ONE shared track — the traverse is learned once", async ({ mount, page }) => {
  await stub(page);
  await mount(<ConfigHostStory target="appearance" width={1280} />);
  await awaitRows(page);

  // The message-style section's two knob rows plus the avatars section's five: all of them are `SettingRow`s
  // inside a `SettingRowGroup`, so each GROUP must agree with itself on where the control column begins.
  const readGroups = async (): Promise<readonly (readonly number[])[]> => {
    const groups = await page.evaluate((): readonly (readonly number[])[] => {
      const found = [...document.querySelectorAll('[data-slot="setting-row-group"]')];
      return found.map((group) => [...group.querySelectorAll('[data-slot="field-control-col"]')].map((cell) => Math.round(cell.getBoundingClientRect().left)));
    });
    return groups.filter((group) => group.length > 1);
  };
  // The positive control comes FIRST — an empty matrix would satisfy the "all equal" claim vacuously.
  await expect.poll(async () => (await readGroups()).length).toBeGreaterThan(0);
  await expect.poll(async () => (await readGroups()).every((group) => new Set(group).size === 1)).toBe(true);
});

// ── #932 — ONE ADDRESS IS ONE DOM ROW ─────────────────────────────────────────────────────────────────
// THE PREMISE MUST BE PLANTED, not defaulted: the two dependent fields render only while `autoSwipe` is
// ENABLED, so a stub carrying the contract default (`enabled: false`) draws one row on the OLD anatomy too
// and the pin passes vacuously (measured — this exact assertion went green against HEAD before the stub
// was fixed). The stub below turns it on, which is the state that produced three rows sharing one address.
test("auto-swipe is ONE row, not three — its dependents ride inside it", async ({ mount, page }) => {
  await routeTrpc(page, {
    "settings.getUserSettings": () => ({
      userId: "user_ct_rowchrome",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, chat: { ...DEFAULT_USER_SETTINGS.chat, autoSwipe: { ...DEFAULT_USER_SETTINGS.chat.autoSwipe, enabled: true } } },
      updatedAt: 0,
      configUnreadable: null,
    }),
    "sessions.me": { userId: "user_ct_rowchrome", handle: "ct_rowchrome", globalRole: "user" as const },
    "settings.listThemes": () => [],
    "rosterPreset.list": [],
    "worldInfo.listBooksWithUsage": () => [],
    "tag.listTagsWithUsage": () => [],
    "regex.listScripts": () => [],
    "persona.list": () => [],
    "character.list": () => ({ items: [], nextCursor: null }),
    [SAVE_PROC]: () => ({
      userId: "user_ct_rowchrome",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, chat: { ...DEFAULT_USER_SETTINGS.chat, autoSwipe: { ...DEFAULT_USER_SETTINGS.chat.autoSwipe, enabled: true } } },
      updatedAt: 0,
      configUnreadable: null,
    }),
  });
  await mount(<ConfigHostStory target="chat-behavior" />);
  const row = page.locator('[data-setting="auto-swipe"]');
  // Barrier on the SETTLED arm the enabled stub produces — both dependents rendered — before counting.
  // Both are `textbox`es: Base UI's NumberField is an editable textbox by owner ruling 2026-08-02, NOT a
  // `spinbutton` (number-field.ct.tsx states it) — so is the textarea.
  await expect(row.getByRole("textbox", { name: "Minimum reply length" })).toBeVisible();
  await expect(row.getByRole("textbox", { name: "Blacklisted phrases" })).toBeVisible();
  await expect(row).toHaveCount(1);
  // The master's own switch is the row's control; the details block is the row's second line.
  await expect(row.getByRole("switch", { name: "Auto-swipe short replies" })).toBeVisible();
  // ONE address means one of each piece of chrome, not three.
  await expect(row.locator(ACTIONS)).toHaveCount(1);
  await expect(row.locator('[data-slot="hint-trigger"]')).toHaveCount(1);
});

test("the ⋯ is INVISIBLE at rest, fades in on hover, and the row does not move a pixel — the zero-shift bar", async ({ mount, page }) => {
  await stub(page);
  await mount(<ConfigHostStory target="appearance" />);
  await awaitRows(page);

  const row = page.locator(MODIFIED_ROW);
  const cell = row.locator(ACTIONS);
  // Scroll the row into view BEFORE the rest capture: `boundingBox()` is viewport-relative, and a
  // `hover()`-triggered auto-scroll would read as a phantom "shift".
  await row.scrollIntoViewIfNeeded();
  // REST: the cell is reserved (a real box — that is what makes the reveal shiftless) but paints nothing.
  await expect.poll(() => cell.evaluate((el: HTMLElement) => getComputedStyle(el).opacity)).toBe("0");

  const restRow = await row.boundingBox();
  const restControl = await row.getByRole("switch").boundingBox();

  await row.getByRole("switch").hover();
  await expect.poll(() => cell.evaluate((el: HTMLElement) => getComputedStyle(el).opacity)).toBe("1");

  // ZERO LAYOUT SHIFT (the owner's bar): the row's box and its control's box are byte-identical across the
  // reveal — the cell was reserved, nothing widened, nothing jumped.
  await expect.poll(() => row.boundingBox()).toEqual(restRow);
  await expect.poll(() => row.getByRole("switch").boundingBox()).toEqual(restControl);
});

// ── #928 — THE END-USER ARM, THROUGH THE REAL HOST ────────────────────────────────────────────────────
// This is what a user gets, and a CT sees it for free: playwright-ct builds with `vite build`, i.e. in
// PRODUCTION mode, so `import.meta.env.DEV` is FALSE here and the dispatcher takes the end-user arm. (The
// bundle receipt for the other half is in the fixtures header: "Copy setting id" and "Already at its
// default" have ZERO occurrences in the CT's own production bundle.)
test("the modified row's cell carries ONE direct Reset — no menu, no copy verbs — and it fires the exact wire", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ConfigHostStory target="appearance" />);
  await awaitRows(page);

  const row = page.locator(MODIFIED_ROW);
  await expect(row.getByRole("button", { name: rowActionsName("Color quoted speech") })).toHaveCount(0);
  const reset = row.getByRole("button", { name: "Reset Color quoted speech to its default" });
  await expect(reset).toHaveCount(1);
  await reset.click();

  await expect
    .poll(() => trpc.lastInput(SAVE_PROC), { intervals: [20, 50, 100] })
    .toEqual({ section: "appearance", patch: { colorQuotedSpeech: DEFAULT_QUOTED } });
});

test("an UNMODIFIED row's cell is EMPTY — a verb with nothing to do is absent, not a disabled control", async ({ mount, page }) => {
  await stub(page);
  await mount(<ConfigHostStory target="appearance" />);
  await awaitRows(page);

  const cell = page.locator(UNMODIFIED_ROW).locator(ACTIONS);
  await expect(cell).toHaveCount(1); // the box is still reserved — the section's action track must not move
  await expect(cell.getByRole("button")).toHaveCount(0);
});

test("an in-flight reset DISABLES the control rather than removing it", async ({ mount, page }) => {
  await mount(<SettingRowResetStory arm="modified" pending={true} />);
  await expect(page.getByRole("button", { name: "Reset Chat display to its default" })).toBeDisabled();
});

test("the end-user cell fires its handler, and is absent on an UNBOUND leaf", async ({ mount, page }) => {
  await mount(<SettingRowResetStory arm="modified" />);
  await page.getByRole("button", { name: "Reset Chat display to its default" }).click();
  await expect(page.getByTestId("reset-fired")).toHaveText("1");
});

test("the end-user cell is an empty reserved box on an UNBOUND leaf", async ({ mount, page }) => {
  await mount(<SettingRowResetStory arm="unbound" />);
  await expect(page.locator(ACTIONS)).toHaveCount(1);
  await expect(page.locator(ACTIONS).getByRole("button")).toHaveCount(0);
});

// ── #928 — THE DEVELOPER ARM (mounted directly; the dispatcher cannot reach it in a production build) ──
test.describe("the dev menu", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("Reset · separator · Copy id · Copy link, and both copies land their exact spelling", async ({ mount, page }) => {
    await mount(<SettingRowDevMenuStory arm="modified" />);
    await page.getByRole("button", { name: rowActionsName("Color quoted speech") }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: "Reset to default" })).toBeVisible();
    // Nit 7: the two copy verbs are fenced off from the state-changing one rather than being flat siblings.
    await expect(menu.getByRole("separator")).toHaveCount(1);
    await menu.getByRole("menuitem", { name: "Copy setting id" }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("appearance.message-style.color-quoted-speech");

    await page.getByRole("button", { name: rowActionsName("Color quoted speech") }).click();
    await page.getByRole("menu").getByRole("menuitem", { name: "Copy link" }).click();
    await expect
      .poll(async () => {
        const text = await page.evaluate(() => navigator.clipboard.readText());
        return text.endsWith("/config?to=appearance.message-style.color-quoted-speech") && text.startsWith("http");
      })
      .toBe(true);
  });

  test("an UNMODIFIED row's Reset is disabled with its reason; an UNBOUND leaf drops Reset and its separator", async ({ mount, page }) => {
    await mount(<SettingRowDevMenuStory arm="unmodified" />);
    await page.getByRole("button", { name: rowActionsName("Color quoted speech") }).click();
    const item = page.getByRole("menu").getByRole("menuitem", { name: "Reset to default" });
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute("data-disabled", "");
  });

  test("an UNBOUND leaf keeps the two Copies and drops Reset — an address is always true", async ({ mount, page }) => {
    await mount(<SettingRowDevMenuStory arm="unbound" />);
    await page.getByRole("button", { name: rowActionsName("Color quoted speech") }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: "Reset to default" })).toHaveCount(0);
    await expect(menu.getByRole("separator")).toHaveCount(0);
    await expect(menu.getByRole("menuitem")).toHaveCount(2);
  });
});

// ── COARSE: the cell is GONE, not merely faint (the rider: touch reaches Reset through About's door — a
// rest-invisible control on a pointer class with no hover would be unreachable chrome). The `i` is NOT in
// that cell and keeps its own touch floor, which is the whole reason #927 moved it. `hasTouch` flips
// `matchMedia("(pointer: coarse)")` in chromium (the touch-target-floor precedent).
test.describe("coarse pointer", () => {
  test.use({ hasTouch: true });

  test("the action cell is display-gone at coarse, while the `i` keeps a real 44px target", async ({ mount, page }) => {
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await stub(page);
    await mount(<ConfigHostStory target="appearance" />);
    await awaitRows(page);

    const row = page.locator(MODIFIED_ROW);
    await expect(row.locator(ACTIONS)).toBeHidden();
    // …while the stripe (state, not a control) still paints: a phone reader keeps the modified fact.
    await expect(row.locator(RAIL)).toHaveCount(1);
    // The `i`'s hit area is its LAYOUT-NEUTRAL `::before` (Button's `inline` arm), never the button box
    // itself. The shared reader refuses an unresolved pseudo instead of letting a NaN comparison masquerade
    // as geometry; the live pointer-conditional token is the floor.
    const trigger = row.locator('[data-slot="hint-trigger"]');
    const floor = await touchFloorPx(page);
    await expect.poll(async () => (await beforeHitBox(trigger)).x).toBeGreaterThanOrEqual(floor);
    await expect.poll(async () => (await beforeHitBox(trigger)).y).toBeGreaterThanOrEqual(floor);
    // …and the hit box is genuinely the trigger's, not a wrapper's: probe 18px ABOVE the glyph's centre,
    // which is inside the 44px pseudo but outside the ~16px button box.
    await expect
      .poll(async () => {
        const boxed = await trigger.boundingBox();
        if (boxed === null) {
          return false;
        }
        return await page.evaluate(
          ([x, y]: readonly [number, number]): boolean => document.elementFromPoint(x, y)?.closest('[data-slot="hint-trigger"]') !== null,
          [boxed.x + boxed.width / 2, boxed.y + boxed.height / 2 - 18] as const,
        );
      })
      .toBe(true);
  });
});
