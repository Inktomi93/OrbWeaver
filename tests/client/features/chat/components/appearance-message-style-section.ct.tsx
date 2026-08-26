// CT: the Message-style appearance SECTION (SET-SEAMS stage 1) — one of the three chat-owned sections the
// decomposed appearance pane is built from. Drives the production autosave path: `getUserSettings` seeds
// the form, each control change debounces then fires `updateUserSettingsSection("appearance")`.
//
// P1 — PATCH MINIMALITY (SET-SEAMS §9): the wire payload carries EXACTLY this section's three owned keys.
// The expected key set is re-spelled here on purpose — importing the section's own `OWNS` tuple would make
// the test agree with the code by construction and prove nothing.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { AppearanceMessageStyleNarrowStory, AppearanceMessageStyleSectionStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = { userId: "user_ct_message_style", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };
const UPDATE_PROC = "settings.updateUserSettingsSection";
const OWNED_KEYS = ["autoFixMarkdown", "chatStyle", "colorQuotedSpeech"];
const GLOSS = '[data-slot="select-item-description"]';
/** Re-spelled, not imported from `THEME_CHAT_STYLES` — a ninth mode shipping without a gloss must RED
 *  here rather than agree with the code by construction. */
const CHAT_STYLE_COUNT = 8;

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, { "settings.getUserSettings": () => SETTINGS_VIEW, [UPDATE_PROC]: () => ({}) });
}

/** The most recent `appearance` section-patch body. */
function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { section?: string; patch?: Record<string, unknown> } | undefined;
  return input?.section === "appearance" ? input.patch : undefined;
}

test("mounts with the persisted defaults rendered", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceMessageStyleSectionStory />);
  await expect(page.getByRole("heading", { name: "Message style" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Chat display" })).toContainText("Bubble");
  await expect(page.getByRole("switch", { name: "Color quoted speech" })).toBeVisible();
});

test("changing chat display patches the `appearance` section with ONLY this section's three keys", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceMessageStyleSectionStory />);
  await page.getByRole("combobox", { name: "Chat display" }).click();
  await page.getByRole("option", { name: "Flat", exact: true }).click();

  await expect.poll(() => lastPatch(trpc)?.["chatStyle"], { intervals: [20, 50, 100] }).toBe("flat");
  // P1: no sibling section's key rides along — a full-blob patch here would clobber whatever Avatars or
  // Background just saved (the lost-update SET-SEAMS §2.1 describes).
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);
});

test("the auto-fix switch patches autoFixMarkdown, still key-minimal", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceMessageStyleSectionStory />);
  await page.getByRole("switch", { name: "Auto-fix unfinished formatting" }).click();

  await expect.poll(() => lastPatch(trpc)?.["autoFixMarkdown"], { intervals: [20, 50, 100] }).toBe(true);
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);
});

// side-eye 2026-08-16 P2: the eight display modes were explained by ONE paragraph on the field, which the
// popup covers the instant the select opens — the legend was invisible at exactly the moment it was
// needed. Each mode's gloss now rides its own option row. Pinned on the RENDERED popup, plus the two
// things that could regress silently: the trigger must stay single-line (the gloss is not in `ItemText`),
// and an option's accessible NAME must stay the bare mode name (the gloss is a description, so every
// `getByRole("option", { name, exact })` in the tree keeps working).
test("each chat-display option carries its own visible gloss, without renaming the option or the trigger", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceMessageStyleSectionStory />);
  const combo = page.getByRole("combobox", { name: "Chat display" });
  await combo.click();

  // Resolving `{ name: "Ripple", exact: true }` at all IS the name proof: the option's name comes from
  // its own subtree, so an un-hidden gloss would have renamed it "Ripple A tall portrait…".
  const ripple = page.getByRole("option", { name: "Ripple", exact: true });
  await expect(ripple).toBeVisible();
  const gloss = ripple.locator(GLOSS);
  await expect(gloss).toHaveText("A tall portrait sticks beside the text as you scroll.");
  // The gloss is a DESCRIPTION, not part of the name: hidden from the accname subtree, handed to AT via
  // aria-describedby (whose target is used even when hidden).
  await expect(gloss).toHaveAttribute("aria-hidden", "true");
  const glossId = await gloss.getAttribute("id");
  await expect(ripple).toHaveAttribute("aria-describedby", glossId ?? "");
  // Every option is glossed — a half-glossed list reads as "these three are the special ones".
  await expect(page.locator(GLOSS)).toHaveCount(CHAT_STYLE_COUNT);

  await ripple.click();
  // The trigger shows the mode, never the mode plus its sentence (the single-line-trigger convention).
  await expect(combo).toHaveText("Ripple");
});

// UIP-404 row grammar: form fields render horizontal — label+description LEFT, control docked RIGHT in the
// fixed ~200px control column — and a select is sized to that column, never 100% of the section.
test("settings fields use the horizontal row grammar and selects are not full-width", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceMessageStyleSectionStory />);
  const combo = page.getByRole("combobox", { name: "Chat display" });
  await expect(combo).toBeVisible();

  const readGeoAtAssertion = async (): Promise<typeof geo> =>
    await combo.evaluate((trigger) => {
      const root = "data-slot";
      const field = trigger.closest(`[${root}='field-root']`);
      const col = trigger.closest(`[${root}='field-control-col']`);
      const controlColToken = getComputedStyle(document.documentElement).getPropertyValue("--width-control-col");
      return {
        orientation: field?.getAttribute("data-orientation") ?? null,
        colWidth: Math.round(col?.getBoundingClientRect().width ?? -1),
        fieldWidth: Math.round(field?.getBoundingClientRect().width ?? -1),
        tokenPx: Number.parseFloat(controlColToken) * 16,
      };
    });
  const geo = await combo.evaluate((trigger) => {
    const root = "data-slot";
    const field = trigger.closest(`[${root}='field-root']`);
    const col = trigger.closest(`[${root}='field-control-col']`);
    const controlColToken = getComputedStyle(document.documentElement).getPropertyValue("--width-control-col");
    return {
      orientation: field?.getAttribute("data-orientation") ?? null,
      colWidth: Math.round(col?.getBoundingClientRect().width ?? -1),
      fieldWidth: Math.round(field?.getBoundingClientRect().width ?? -1),
      tokenPx: Number.parseFloat(controlColToken) * 16,
    };
  });

  await expect.poll(async () => (await readGeoAtAssertion()).orientation).toBe("horizontal");
  expect(Math.abs(geo.colWidth - geo.tokenPx)).toBeLessThanOrEqual(2);
  await expect.poll(async () => (await readGeoAtAssertion()).colWidth).toBeLessThan(geo.fieldWidth);
});

// In-flow squeeze guard (Wave-1 remedy · §4b axis 1): at a NARROW width the fixed ~200px control column
// must NOT starve the label block — the horizontal row stacks (control below label).
test("at a narrow width the horizontal field stacks — the control column can't starve the label", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceMessageStyleNarrowStory />);
  const combo = page.getByRole("combobox", { name: "Chat display" });
  await expect(combo).toBeVisible();

  const readGeoAtAssertion = async (): Promise<typeof geo> =>
    await combo.evaluate((trigger) => {
      const slot = "data-slot";
      const field = trigger.closest(`[${slot}='field-root']`);
      const block = field?.querySelector(`[${slot}='field-label-block']`);
      const label = field?.querySelector(`[${slot}='field-label']`);
      return {
        fieldW: Math.round(field?.getBoundingClientRect().width ?? -1),
        blockW: Math.round(block?.getBoundingClientRect().width ?? -1),
        labelWantsW: (label as HTMLElement | null)?.scrollWidth ?? -1,
      };
    });
  const geo = await combo.evaluate((trigger) => {
    const slot = "data-slot";
    const field = trigger.closest(`[${slot}='field-root']`);
    const block = field?.querySelector(`[${slot}='field-label-block']`);
    const label = field?.querySelector(`[${slot}='field-label']`);
    return {
      fieldW: Math.round(field?.getBoundingClientRect().width ?? -1),
      blockW: Math.round(block?.getBoundingClientRect().width ?? -1),
      labelWantsW: (label as HTMLElement | null)?.scrollWidth ?? -1,
    };
  });

  await expect.poll(async () => (await readGeoAtAssertion()).blockW).toBeGreaterThan(geo.fieldW * 0.9);
  await expect.poll(async () => (await readGeoAtAssertion()).blockW).toBeGreaterThanOrEqual(geo.labelWantsW - 1);
});
