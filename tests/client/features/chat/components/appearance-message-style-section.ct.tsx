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

test("mounts with the persisted defaults rendered — the default mode's CARD is the pressed one", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceMessageStyleSectionStory />);
  await expect(page.getByRole("heading", { name: "Message style" })).toBeVisible();
  // #866 §7.8 — the Select became preview cards; the persisted value is the one aria-pressed card.
  await expect(page.getByRole("button", { name: "Bubble", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Flat", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("switch", { name: "Color quoted speech" })).toBeVisible();
});

test("changing chat display patches the `appearance` section with ONLY this section's three keys", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceMessageStyleSectionStory />);
  await page.getByRole("button", { name: "Flat", exact: true }).click();

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

// side-eye 2026-08-16 P2, RE-PINNED ON THE CARDS (#866 §7.8 — the Select's popup died with the flip; the
// concern survives): each mode's gloss must be readable at the moment of choosing (now: at REST, on the
// card), the card's accessible NAME must stay the bare mode name (`aria-labelledby` to the rendered label
// pins it; the gloss is its `aria-describedby` DESCRIPTION — #1022, 2026-09-01: the ruling survives, its
// mechanism changed, because the old `aria-label` over a visible label + gloss was a WCAG 2.5.3 /
// §13.10 N2 label-in-name violation ×8), and every mode carries a gloss AND a mini preview pair.
test("every chat-display CARD carries its name, its gloss and its preview — and exactly one is pressed", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceMessageStyleSectionStory />);
  const cards = page.locator('[data-slot="chat-style-cards"]').getByRole("button");
  await expect(cards).toHaveCount(CHAT_STYLE_COUNT);

  // Resolving `{ name: "Ripple", exact: true }` at all IS the name proof.
  const ripple = page.getByRole("button", { name: "Ripple", exact: true });
  await expect(ripple).toBeVisible();
  await expect(ripple.getByText("A tall portrait sticks beside the text as you scroll.")).toBeVisible();

  // Exactly ONE pressed card, and picking moves it (the state is the value, not a second flag).
  await expect(page.locator('[data-slot="chat-style-cards"] [aria-pressed="true"]')).toHaveCount(1);
  await ripple.click();
  await expect(ripple).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Bubble", exact: true })).toHaveAttribute("aria-pressed", "false");

  // The previews DERIVE from the skin table (the derive-never-mirror rider): two different modes must
  // render structurally different anatomies — byte-identical previews would mean a copied placeholder.
  const bubblePreview = await page.getByRole("button", { name: "Bubble", exact: true }).evaluate((el) => el.querySelector("[aria-hidden]")?.innerHTML ?? "");
  const documentPreview = await page
    .getByRole("button", { name: "Document", exact: true })
    .evaluate((el) => el.querySelector("[aria-hidden]")?.innerHTML ?? "");
  expect(bubblePreview).not.toBe(""); // ONESHOT-OK: settled — the cards rendered above (toHaveCount) before this read
  expect(bubblePreview).not.toBe(documentPreview); // ONESHOT-OK: settled — same render, structural comparison
});

// UIP-404 row grammar: form fields render horizontal — label+description LEFT, control docked RIGHT in the
// fixed ~200px control column — and a select is sized to that column, never 100% of the section.
test("settings fields use the horizontal row grammar and controls are not full-width", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceMessageStyleSectionStory />);
  // Retargeted to the SWITCH row (#866 §7.8 — chat-style is cards now, outside the Field control column
  // by design); the row grammar under pin is the Field anatomy, which the switch rows still ride.
  const combo = page.getByRole("switch", { name: "Color quoted speech" });
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
  const combo = page.getByRole("switch", { name: "Color quoted speech" });
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
