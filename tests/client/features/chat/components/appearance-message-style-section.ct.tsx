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
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
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
  // #866 §7.8 — the Select became preview cells; #981 F20 made the set ONE radiogroup, so the persisted
  // value is the CHECKED radio (resolving the group by that role IS the semantic pin).
  const cards = page.getByRole("radiogroup", { name: "Chat display" });
  await expect(cards.getByRole("radio", { name: "Bubble", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(cards.getByRole("radio", { name: "Flat", exact: true })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("switch", { name: "Color quoted speech" })).toBeVisible();
});

test("changing chat display patches the `appearance` section with ONLY this section's three keys", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceMessageStyleSectionStory />);
  await page.getByRole("radio", { name: "Flat", exact: true }).click();

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
test("every chat-display CELL carries its name, its gloss and its preview — and exactly one is checked", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceMessageStyleSectionStory />);
  const cards = page.getByRole("radiogroup", { name: "Chat display" });
  await expect(cards.getByRole("radio")).toHaveCount(CHAT_STYLE_COUNT);

  // Resolving `{ name: "Ripple", exact: true }` at all IS the name proof — the name is the VISIBLE label
  // via aria-labelledby, and the gloss is its aria-describedby DESCRIPTION (§13.10 N1/N2, #1022's ruling).
  const ripple = cards.getByRole("radio", { name: "Ripple", exact: true });
  await expect(ripple).toBeVisible();
  await expect(ripple.getByText("A tall portrait sticks beside the text as you scroll.")).toBeVisible();

  // Exactly ONE checked cell, and picking moves it (the state is the value, not a second flag).
  await expect(cards.locator('[aria-checked="true"]')).toHaveCount(1);
  await ripple.click();
  await expect(ripple).toHaveAttribute("aria-checked", "true");
  await expect(cards.getByRole("radio", { name: "Bubble", exact: true })).toHaveAttribute("aria-checked", "false");
});

// #1099 F8 — THE DEFECT THIS ARM EXISTS FOR. Five of the eight cards drew the IDENTICAL picture (two grey
// blobs): bubble/echo/whisper/ripple/tide share `outer`/`inner`, and the old preview read nothing else off
// the skin. Five identical pictures in a picker OF PICTURES is worse than none — it asserts the options are
// the same. The pin is therefore the whole population, not a spot check between two modes.
test("all EIGHT previews are structurally distinct — no two modes draw the same picture", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceMessageStyleSectionStory />);
  const cards = page.getByRole("radiogroup", { name: "Chat display" });
  await expect(cards.getByRole("radio")).toHaveCount(CHAT_STYLE_COUNT);

  const previews = await cards.evaluate((group): readonly string[] => [...group.querySelectorAll('[data-slot="picker-cell-art"]')].map((art) => art.innerHTML));
  // Positive control first: an empty list would satisfy "all distinct" vacuously — and an empty preview
  // set is a live defect class here (the Layered elevation diagram painted nothing for a whole era).
  // ONESHOT-OK: read after the awaited toHaveCount barrier — the eight cells are mounted and their art is static markup.
  expect(previews).toHaveLength(CHAT_STYLE_COUNT);
  for (const markup of previews) {
    expect(markup.length).toBeGreaterThan(0);
  }
  expect(new Set(previews).size).toBe(CHAT_STYLE_COUNT);
});

// #981 F20 — one tab stop, roving focus, arrows change selection. The old anatomy was eight independent
// `aria-pressed` buttons, so passing this control cost eight tab stops.
test("the chat-display picker is ONE tab stop and arrows move the selection", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceMessageStyleSectionStory />);
  const cards = page.getByRole("radiogroup", { name: "Chat display" });
  const bubble = cards.getByRole("radio", { name: "Bubble", exact: true });
  await bubble.focus();
  await expect(bubble).toBeFocused();
  await expect(cards.getByRole("radio", { name: "Flat", exact: true })).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("ArrowRight");
  await expect(cards.getByRole("radio", { name: "Flat", exact: true })).toHaveAttribute("aria-checked", "true");
});

// UIP-404's row grammar, AS AMENDED BY #932 — and the amendment is the point, so the old pin is stated
// here rather than deleted. UIP-404 docked every horizontal row's control in a FIXED `--width-control-col`
// (200px) at the row's right edge, and this test asserted exactly that: `colWidth == tokenPx ± 2`. That
// dock is what put a label and its control at opposite ends of the pane — `row-void` measured 543-703px of
// nothing between them, 8× on this very surface, in every pane state except the one that narrowed the
// column (#1099 G6). A converted section now shares ONE track set (`SettingRowGroup`), so the control
// column is CONTENT-sized and its alignment comes from the section's shared track start, not from a fixed
// width. The half of the old pin that survives — a control must never stretch to the section's width — is
// kept verbatim below; the fixed-width half is replaced by the track claim it was standing in for.
test("settings fields use the horizontal row grammar; the control is content-sized on ONE shared track, never full-width", async ({ mount, page }) => {
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
  // The surviving half: a control is never the section's width (a 545px switch would be a lie about its
  // hit target, and it is what a `w-full` control column produces).
  await expect.poll(async () => (await readGeoAtAssertion()).colWidth).toBeLessThan(geo.fieldWidth);
  // The replacement half: every converted row in this section starts its control at the SAME x, which is
  // what "one traverse to learn" means now that the column is content-sized rather than pinned at 200px.
  const readStarts = async (): Promise<readonly number[]> =>
    await page.evaluate((): readonly number[] => {
      const group = document.querySelector('[data-slot="setting-row-group"]');
      return group === null ? [] : [...group.querySelectorAll('[data-slot="field-control-col"]')].map((c) => Math.round(c.getBoundingClientRect().left));
    });
  // The positive control comes FIRST — an empty list would satisfy the "all equal" claim vacuously.
  await expect.poll(async () => (await readStarts()).length).toBeGreaterThan(1);
  await expect.poll(async () => new Set(await readStarts()).size).toBe(1);
});

// In-flow squeeze guard (Wave-1 remedy · §4b axis 1): at a NARROW width the control column must NOT starve
// the label — the row STACKS, control below label.
//
// RE-EXPRESSED for #932, and the reason is the mechanism change: the old assertion measured the WIDTH of
// `field-label-block` against the field's width, which worked while that block was a flex column with a box
// of its own. In the track arm the block is `display: contents` — it has no box at all (its label and its
// gloss are grid items of the section's shared tracks), so the old read returns 0 and would have "failed"
// a layout that is in fact correct. The claim it was standing in for is unchanged and is asserted
// directly: at a narrow container the control sits BELOW the label rather than beside it.
test("at a narrow width the horizontal field stacks — the control column can't starve the label", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceMessageStyleNarrowStory />);
  const combo = page.getByRole("switch", { name: "Color quoted speech" });
  await expect(combo).toBeVisible();

  interface StackGeometry {
    readonly fieldW: number;
    readonly labelBottom: number;
    readonly controlTop: number;
    readonly labelWantsW: number;
    readonly labelW: number;
  }
  const readGeoAtAssertion = async (): Promise<StackGeometry> =>
    await combo.evaluate((trigger): StackGeometry => {
      const slot = "data-slot";
      const field = trigger.closest(`[${slot}='field-root']`);
      const label = field?.querySelector(`[${slot}='field-label']`);
      const control = trigger.closest(`[${slot}='field-control-col']`);
      return {
        fieldW: Math.round(field?.getBoundingClientRect().width ?? -1),
        labelBottom: Math.round(label?.getBoundingClientRect().bottom ?? -1),
        controlTop: Math.round(control?.getBoundingClientRect().top ?? -1),
        labelWantsW: (label as HTMLElement | null)?.scrollWidth ?? -1,
        labelW: Math.round(label?.getBoundingClientRect().width ?? -1),
      };
    });
  const geo = await readGeoAtAssertion();

  // STACKED: the control's top edge is at or below the label's bottom edge, never beside it.
  await expect.poll(async () => (await readGeoAtAssertion()).controlTop).toBeGreaterThanOrEqual(geo.labelBottom - 1);
  // …and the label is never clipped to buy the control room (the half the old width read was protecting).
  await expect.poll(async () => (await readGeoAtAssertion()).labelW).toBeGreaterThanOrEqual(geo.labelWantsW - 1);
  expect(geo.fieldW).toBeGreaterThan(0); // positive control: a zero-width field would pass both reads
});
