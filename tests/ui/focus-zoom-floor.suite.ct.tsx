// CT: the iOS FOCUS-ZOOM CENSUS at a coarse pointer (#2450, owner 2026-09-19 — "anything under a certain
// size on iOS makes the page zoom in").
//
// WHY A CENSUS AND NOT MORE PER-CONTROL PINS. iOS Safari zooms the viewport in when a focused
// `input`/`textarea`/`select`/`[contenteditable]` paints type under 16px, and never zooms back out — the
// owner reported it as three symptoms (pinch-to-recover, a tab bar below the fold, sideways panning) that
// are one cause. #1868/#1872 floored the FIELD path and pinned it at
// `tests/ui/primitives/input/input.ct.tsx` — `text.field` / `text.field-dense` are pointer-conditional and
// root-floored, both arms proven. What that pin CANNOT see is every text-entry control that does not ride
// the field token, and that is where the platform defect survives. A census is the shape that does not go
// stale: it asks the PAGE which elements exist rather than asking a maintainer to remember.
//
// THE FIX IS ALWAYS AT THE TOKEN, NEVER AT THE SITE. A `font-size: 16px` on one component satisfies this
// file and leaves the class open; `text.field`'s own authoring note states the rule, and #2450 restates it.
//
// IT MUST COME FROM THE CT BROWSER. `snap --viewport WxH` reports `pointer: fine` and `snap --mobile
// --viewport WxH` silently DROPS coarse (#1668), so a snap measuring "390 coarse" measures a layout no
// phone renders. `hasTouch: true` flips `matchMedia("(pointer: coarse)")` in chromium (the
// `touch-target-floor.suite.ct.tsx` precedent), which is what the emitted `@media(pointer:fine)` override
// keys off. The first case PROBES that the emulation landed before any size is trusted.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { TextEntryCensus, UnderFloorControl } from "./focus-zoom-floor.fixtures.tsx";

test.use({ hasTouch: true });

// 16 is a PLATFORM constant, not our token — spelled as a literal with its reason, exactly as
// `input.ct.tsx` spells it, while every measured number is read off the live document.
const IOS_FOCUS_ZOOM_FLOOR_PX = 16;

/** One census row: what the element is, and what it paints. */
interface CensusRow {
  readonly where: string;
  readonly fontSizePx: number;
  readonly planted: boolean;
}

/**
 * Every FOCUSABLE TEXT-ENTRY element in the document, with its computed font size.
 *
 * THE EXCLUSIONS ARE THE ONLY JUDGEMENT IN THIS SWEEP, so each one names the reason it cannot arm the
 * zoom rather than "it looked noisy":
 *   • `display:none` / `visibility:hidden` — cannot take focus at all. An `opacity: 0` control is NOT
 *     excluded: `FileDropzone` and `FileTrigger` paint their real input that way and a finger lands on it.
 *   • `disabled` — iOS will not focus it.
 *   • `aria-hidden="true"` / a NEGATIVE tabindex — Base UI's seals each keep a shadow `input` beside the
 *     real one to carry the form value (Select's, Combobox's, NumberField's). They are removed from the
 *     a11y tree and unreachable by tap or by Tab, so nothing can focus them and nothing can zoom on them.
 *   • the NON-TEXT input types — `button submit reset image checkbox radio range color file hidden`. None
 *     of them opens a keyboard, which is what the zoom is a reaction to; a `type="file"` opens a sheet and
 *     a `type="color"` opens the OS picker. Every remaining type (including `number`, `email`, `search`,
 *     `url`, `tel`, `password` and the date/time family) IS a keyboard field and IS censused.
 * The set is returned to the test so the exclusion list itself is assertable — a silently-growing fence is
 * the way a census turns into a clean zero.
 */
const NON_TEXT_INPUT_TYPES = ["button", "submit", "reset", "image", "checkbox", "radio", "range", "color", "file", "hidden"] as const;

async function census(page: Page): Promise<readonly CensusRow[]> {
  return await page.evaluate(
    (nonTextTypes: readonly string[]) => {
      const focusable = (el: Element): boolean => {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") {
          return false;
        }
        const disableable = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
        if (disableable && el.disabled) {
          return false;
        }
        if (el.getAttribute("aria-hidden") === "true" || Number(el.getAttribute("tabindex") ?? "0") < 0) {
          return false;
        }
        return !(el instanceof HTMLInputElement && nonTextTypes.includes(el.type));
      };
      const whereOf = (el: Element): string => {
        const label = el.getAttribute("aria-label") ?? el.getAttribute("placeholder") ?? el.getAttribute("data-slot") ?? el.className;
        const type = el instanceof HTMLInputElement ? `[type=${el.type}]` : "";
        return `${el.tagName.toLowerCase()}${type} "${String(label).slice(0, 60)}" [${el.className.toString().slice(0, 160)}]`;
      };
      return [...document.querySelectorAll('input, textarea, select, [contenteditable="true"], [contenteditable=""]')].filter(focusable).map((el) => ({
        where: whereOf(el),
        fontSizePx: Number.parseFloat(getComputedStyle(el).fontSize),
        planted: el.getAttribute("data-focus-zoom-control") === "planted",
      }));
    },
    NON_TEXT_INPUT_TYPES as readonly string[],
  );
}

function describeRows(rows: readonly CensusRow[]): string {
  return rows.map((row) => `  ${row.fontSizePx.toFixed(2)}px  ${row.where}`).join("\n");
}

test("the CT context reports a COARSE pointer (hasTouch flips pointer:coarse)", async ({ page }) => {
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), "hasTouch must make the coarse branch win").toBe(true);
  expect(await page.evaluate(() => matchMedia("(pointer: fine)").matches), "the fine override must not apply").toBe(false);
});

test("the census PROBE catches an under-floor control — a planted positive control, in the same sweep", async ({ mount, page }) => {
  await mount(<UnderFloorControl />);
  const rows = await census(page);
  const planted = rows.filter((row) => row.planted);
  expect(planted, "the planted 15px input must be IN the population — a sweep that cannot see it proves nothing").toHaveLength(1);
  expect(planted[0]?.fontSizePx).toBeLessThan(IOS_FOCUS_ZOOM_FLOOR_PX);
  // …and it must be judged a FAILURE by the same predicate the real assertion uses.
  expect(planted.filter((row) => row.fontSizePx < IOS_FOCUS_ZOOM_FLOOR_PX)).toHaveLength(1);
});

test("every text-entry primitive paints at or above the iOS focus-zoom floor at a coarse pointer (#2450)", async ({ mount, page }) => {
  await mount(<TextEntryCensus />);
  // The CodeEditor's `.cm-content` mounts from an effect — barrier on the SETTLED editable before reading.
  await expect(page.locator(".cm-content")).toBeVisible();
  const rows = await census(page);
  expect(
    rows.filter((row) => row.planted),
    "this story plants nothing — a planted row here would mask a real one",
  ).toHaveLength(0);
  // A bare zero is "I could not measure". The story mounts eleven primitives; anything near zero means the
  // tree did not render, not that the app is clean.
  expect(rows.length, `the census found nothing to judge:\n${describeRows(rows)}`).toBeGreaterThanOrEqual(8);
  const under = rows.filter((row) => row.fontSizePx < IOS_FOCUS_ZOOM_FLOOR_PX);
  expect(under, `controls under the ${IOS_FOCUS_ZOOM_FLOOR_PX}px iOS focus-zoom floor:\n${describeRows(under)}\n\nfull census:\n${describeRows(rows)}`).toEqual(
    [],
  );
});

test("the popup-borne fields are censused too — Combobox's list and ColorField's hex field (#2450)", async ({ mount, page }) => {
  await mount(<TextEntryCensus />);
  await page.getByRole("button", { name: "census color field" }).click();
  await expect(page.getByRole("textbox", { name: "Hex" })).toBeVisible();
  const rows = await census(page);
  const under = rows.filter((row) => row.fontSizePx < IOS_FOCUS_ZOOM_FLOOR_PX);
  expect(under, `popup fields under the floor:\n${describeRows(under)}`).toEqual([]);
});

// ── the floor survives the reader's own type scale, and the matrix is BOTH ENDS plus the crossover ──
//
// `appearance.fontScale` writes `--font-scale` on `<html>` and ui globals.css spells
// `:root { font-size: calc(100% * var(--font-scale, 1)) }`, so every rem step rescales with it and
// `fontScale` bottoms out at 0.8. That is what `orb.rootFloor` is for (#1872), and a CT runs at scale 1 —
// the ONE stop where the defect does not exist. A point measurement never proves a range property.
const FONT_SCALE_SWEEP = [0.8, 0.9, 1, 1.25, 1.5] as const;

async function setFontScale(page: Page, scale: number): Promise<void> {
  await page.evaluate((value) => {
    document.documentElement.style.setProperty("--font-scale", String(value));
  }, scale);
}

test("the floor holds across the whole 0.8–1.5 fontScale slider, for every censused control (#2450/#1872)", async ({ mount, page }) => {
  await mount(<TextEntryCensus />);
  await expect(page.locator(".cm-content")).toBeVisible();
  const failures: string[] = [];
  const rows: string[] = [];
  for (const scale of FONT_SCALE_SWEEP) {
    await setFontScale(page, scale);
    const measured = await census(page);
    const under = measured.filter((row) => row.fontSizePx < IOS_FOCUS_ZOOM_FLOOR_PX);
    rows.push(`fontScale ${scale}: ${measured.length} censused, ${under.length} under`);
    for (const row of under) {
      failures.push(`fontScale ${scale}: ${row.where} at ${row.fontSizePx.toFixed(2)}px re-arms the iOS focus zoom`);
    }
  }
  await setFontScale(page, 1);
  expect(failures, `fontScale matrix (coarse pointer):\n  ${rows.join("\n  ")}`).toEqual([]);
});

test.describe("fine pointer — #2450's re-pointing is a NO-OP on a mouse", () => {
  test.use({ hasTouch: false });

  // THE DISCRIMINATING HALF. #2450 moved four controls off the prose/reading voices onto the two
  // pointer-conditional ENTRY tokens (`text.field` for NumberField `md` / Combobox / Autocomplete,
  // `text.code-field` for the CodeEditor and NumberField `inline`). Both new fine arms were authored to the
  // value those surfaces already painted, so a mouse must see EXACTLY what it saw before — and the numbers
  // are read off the live `--text-body` / `--text-code` vars rather than typed as px, so a deliberate retune
  // of either voice moves this pin with it instead of reddening it. Without this case a blanket
  // `font-size: 16px` on all five sites passes every coarse assertion above while enlarging every desktop form.
  test("the re-pointed controls still paint the body / code steps at a fine pointer", async ({ mount, page }) => {
    await mount(<TextEntryCensus />);
    await expect(page.locator(".cm-content")).toBeVisible();
    const resolved = await page.evaluate(() => {
      const probe = (value: string): number => {
        const el = document.createElement("div");
        el.style.fontSize = value;
        document.body.append(el);
        const size = Number.parseFloat(getComputedStyle(el).fontSize);
        el.remove();
        return size;
      };
      return { body: probe("var(--text-body)"), code: probe("var(--text-code)") };
    });
    const read = (label: string): Promise<number> =>
      page.locator(`input[aria-label="${label}"], textarea[aria-label="${label}"]`).evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    const editor = await page.locator(".cm-content").evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    expect(resolved.body, "the fine body step is BELOW the platform floor — otherwise this case proves nothing").toBeLessThan(IOS_FOCUS_ZOOM_FLOOR_PX);
    expect(resolved.code).toBeLessThan(resolved.body);
    expect(await read("census number field"), "NumberField md keeps the body step on a mouse").toBeCloseTo(resolved.body, 1);
    expect(await read("census combobox"), "Combobox keeps the body step on a mouse").toBeCloseTo(resolved.body, 1);
    expect(await read("census autocomplete"), "Autocomplete keeps the body step on a mouse").toBeCloseTo(resolved.body, 1);
    expect(editor, "the CodeEditor keeps the code step on a mouse").toBeCloseTo(resolved.code, 1);
  });
});

// ── the OTHER half of the platform fix: the viewport meta must NOT buy the floor with a11y ──────────
//
// Disabling zoom (`maximum-scale=1` / `user-scalable=no`) also stops the focus zoom, and it is the wrong
// fix: it takes pinch-zoom away from every low-vision reader on the page. #1868 chose the field floor
// deliberately; this pin is what keeps a future "quick fix" from quietly reversing that choice.
test("the client viewport meta buys the fix at the FIELD, never by disabling zoom (#2450)", () => {
  const html = readFileSync(join(import.meta.dirname, "..", "..", "packages", "client", "index.html"), "utf8");
  const meta = /<meta[^>]*name=["']viewport["'][^>]*>/i.exec(html)?.[0];
  expect(meta, "packages/client/index.html must declare a viewport meta at all").toBeDefined();
  expect(meta).toContain("width=device-width");
  expect(meta?.toLowerCase(), "maximum-scale caps pinch zoom for every low-vision reader").not.toContain("maximum-scale");
  expect(meta?.toLowerCase(), "user-scalable=no removes pinch zoom outright").not.toContain("user-scalable");
});
