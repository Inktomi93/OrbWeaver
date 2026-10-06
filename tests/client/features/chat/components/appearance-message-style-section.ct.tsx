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
import { pixelContrast } from "../../../../support/browser/pixel-contrast.ts";
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ChatStyleRendererCaptureStory } from "../_chat-style-preview-stories.tsx";
import { AppearanceMessageStyleNarrowStory, AppearanceMessageStyleSectionStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = { userId: "user_ct_message_style", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, configUnreadable: null, updatedAt: 0 };
const UPDATE_PROC = "settings.updateUserSettingsSection";
const OWNED_KEYS = ["autoFixMarkdown", "chatStyle", "colorQuotedSpeech"];
/** Re-spelled, not imported from `THEME_CHAT_STYLES` — a ninth mode shipping without a gloss must RED
 *  here rather than agree with the code by construction. */
const CHAT_STYLE_COUNT = 8;

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, { "settings.getUserSettings": () => SETTINGS_VIEW, [UPDATE_PROC]: () => SETTINGS_VIEW });
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

test("all eight picker pictures load their renderer captures", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceMessageStyleSectionStory />);
  for (const style of ["bubble", "flat", "document", "echo", "whisper", "hush", "ripple", "tide"] as const) {
    const picture = page.locator(`[data-chat-style="${style}"] [data-slot="crossfade-image-current"]:visible`);
    await expect(picture).toBeVisible();
    await expect(picture).toHaveAttribute("src", `/illustrations/chat-styles/${style}-dark.png`);
    await expect.poll(() => picture.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  }
  await expect(page.getByRole("radio", { name: "Flat", exact: true })).toHaveAccessibleDescription("Unboxed messages in a centered reading column.");
  await expect(page.getByRole("radio", { name: "Whisper", exact: true })).toHaveAccessibleDescription("Character art forms a wide banner above the message.");
});

for (const style of ["flat", "hush"] as const) {
  test(`light inherited ink ${style} stays paired with its capture background`, async ({ mount, page }, testInfo) => {
    await stub(page);
    const component = await mount(<ChatStyleRendererCaptureStory style={style} light={true} />);
    const prose = component.getByText("Wait by the old gate.", { exact: true });
    await expect(prose).toBeVisible();
    const receipt = await pixelContrast(page, prose);
    await testInfo.attach("light-inherited-ink", { body: await component.screenshot(), contentType: "image/png" });
    expect(receipt.ratio, receipt.describe).toBeGreaterThanOrEqual(4.5);
  });
}

for (const light of [false, true]) {
  for (const style of ["bubble", "flat", "document", "echo", "whisper", "hush", "ripple", "tide"] as const) {
    test(`renderer capture ${style} ${light ? "light" : "dark"} preserves role anatomy`, async ({ mount, page }, testInfo) => {
      await stub(page);
      const component = await mount(<ChatStyleRendererCaptureStory style={style} light={light} />);
      await expect(component.locator('[data-slot="chat-style-preview-message"]')).toHaveCount(2);
      await expect(component.getByText("Mira", { exact: true })).toBeVisible();
      await expect(component.getByText("You", { exact: true })).toBeVisible();
      await expect
        .poll(() =>
          component
            .locator('[data-slot="avatar-image"]')
            .evaluateAll((elements) => elements.every((element) => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)),
        )
        .toBe(true);
      await expect
        .poll(() =>
          component.evaluate((root) => {
            const band = root.querySelector('[data-slot="message-band"]');
            const bandBox = band?.getBoundingClientRect();
            const userBubble = root.querySelector('[data-role="user"] [data-slot="message-bubble"]');
            const assistantBubble = root.querySelector('[data-role="assistant"] [data-slot="message-bubble"]');
            return {
              bands: root.querySelectorAll('[data-slot="message-band"]').length,
              userBands: root.querySelectorAll('[data-role="user"] [data-slot="message-band"]').length,
              ratio: bandBox === undefined ? 0 : Math.round((bandBox.width / bandBox.height) * 100),
              bannerArt: band !== null && getComputedStyle(band).backgroundImage.includes("chat-style-banner.svg"),
              echoInset:
                userBubble !== null &&
                assistantBubble !== null &&
                Number.parseFloat(getComputedStyle(userBubble).paddingLeft) > 100 &&
                Number.parseFloat(getComputedStyle(assistantBubble).paddingRight) > 100,
              echoArt: userBubble !== null && getComputedStyle(userBubble).backgroundImage.includes("chat-style-portrait.svg"),
              welded: root.querySelectorAll('[data-slot="message-bubble"] [data-slot="avatar-root"]').length,
              outside: root.querySelectorAll('[data-slot="message-name-row"][data-placement="outside"]').length,
              trains: root.querySelectorAll('[data-slot="message-bubble-train"]').length,
              bubbles: root.querySelectorAll('[data-slot="message-bubble"]').length,
            };
          }),
        )
        .toEqual({
          bands: style === "whisper" ? 1 : 0,
          userBands: 0,
          ratio: style === "whisper" ? 300 : 0,
          bannerArt: style === "whisper",
          echoInset: style === "echo",
          echoArt: style === "echo",
          welded: style === "ripple" ? 2 : 0,
          outside: style === "tide" ? 2 : 0,
          trains: style === "tide" ? 2 : 0,
          bubbles: style === "tide" ? 4 : 2,
        });
      const capture = testInfo.outputPath(`${style}-${light ? "light" : "dark"}.png`);
      await page.evaluate(async () => await document.fonts.ready);
      const image = await component.screenshot({ path: capture });
      await testInfo.attach("owned-preview-capture", { path: capture, contentType: "image/png" });
      const pixels = await page.evaluate(
        async ({ captured, committed }) => {
          const bytes = Uint8Array.from(atob(captured), (character) => character.charCodeAt(0));
          const captureUrl = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
          try {
            const actual = new Image();
            const expected = new Image();
            actual.src = captureUrl;
            expected.src = committed;
            await Promise.all([actual.decode(), expected.decode()]);
            const sameSize = actual.naturalWidth === expected.naturalWidth && actual.naturalHeight === expected.naturalHeight;
            const canvas = document.createElement("canvas");
            canvas.width = actual.naturalWidth;
            canvas.height = actual.naturalHeight;
            const context = canvas.getContext("2d");
            if (context === null) {
              throw new Error("renderer comparison needs a native canvas context");
            }
            context.drawImage(actual, 0, 0);
            const actualPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(expected, 0, 0);
            const expectedPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let differing = 0;
            for (let index = 0; index < actualPixels.length; index += 4) {
              if (actualPixels.subarray(index, index + 4).some((channel, offset) => channel !== expectedPixels[index + offset])) {
                differing += 1;
              }
            }
            return { sameSize, differing };
          } finally {
            URL.revokeObjectURL(captureUrl);
          }
        },
        { captured: image.toString("base64"), committed: `/illustrations/chat-styles/${style}-${light ? "light" : "dark"}.png` },
      );
      expect(pixels.sameSize, "the picker image retains its source renderer dimensions").toBe(true);
      // Native captures differ at two antialiased Whisper corner pixels; anatomy and all other pixels stay pinned.
      expect(pixels.differing, "refresh the owned picker image from the production renderer capture").toBeLessThanOrEqual(style === "whisper" ? 2 : 0);
    });
  }
}

test("narrow message-style picker keeps every illustrated choice inside the phone viewport", async ({ mount, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stub(page);
  await mount(<AppearanceMessageStyleNarrowStory />);
  await expect(page.getByRole("radiogroup", { name: "Chat display" }).getByRole("radio")).toHaveCount(CHAT_STYLE_COUNT);
  await expect.poll((): Promise<boolean> => page.locator("body").evaluate((body) => body.scrollWidth > body.clientWidth)).toBe(false);
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

for (const width of [1440, 360]) {
  test(`message-style miniatures render readable examples at ${width}`, async ({ mount, page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await stub(page);
    await mount(width === 360 ? <AppearanceMessageStyleNarrowStory /> : <AppearanceMessageStyleSectionStory />);
    const cards = page.getByRole("radiogroup", { name: "Chat display" });
    await expect(cards.getByRole("radio")).toHaveCount(CHAT_STYLE_COUNT);
    await expect(cards.locator('[data-slot="crossfade-image-current"]:visible')).toHaveCount(CHAT_STYLE_COUNT);
    await testInfo.attach(`chat-style-miniatures-${width}`, { body: await cards.screenshot(), contentType: "image/png" });
  });
}
