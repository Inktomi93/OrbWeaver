// CT: the real Appearance settings pane (D44 §12.1 #31 — appearance-settings-surface.tsx). Drives the
// production autosave path: `getUserSettings` seeds the form, each control change debounces 500ms then
// fires `updateUserSettingsSection("appearance")` with the FULL patch (createAutosaveEntityForm — the
// listener submits the whole form value, not a per-field delta). Assertions anchor to the surface's OWN
// exported MIN/MAX constants (never hardcoded numbers) and to the real `AppearanceSettings` field keys.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import {
  BACKGROUND_BLUR_MAX,
  BACKGROUND_BLUR_MIN,
  BACKGROUND_DIM_MAX,
  BACKGROUND_DIM_MIN,
  CHAT_WIDTH_MAX,
  CHAT_WIDTH_MIN,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
} from "../../../../../packages/client/src/features/settings/lib/appearance-bounds";
import type { TrpcRecorder, TrpcResponder } from "../../../../support/ct/route-trpc";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc";
import { AppearanceSettingsNarrowStory, AppearanceSettingsNoContributionsStory, AppearanceSettingsStory } from "../_ct-stories";

const SETTINGS_VIEW = {
  userId: "user_ct_appearance",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS,
  updatedAt: 0,
};

const UPDATE_PROC = "settings.updateUserSettingsSection";
// F-P0-2 — the URL arm of the `asset` background kind. The verb MATERIALIZES the pasted address server-side
// and hands back a ready library entry; nothing external is ever persisted (BG-C).
const EXTERNAL_PROC = "settings.addExternalBackground";
// A 1×1 PNG for the own-upload arm (the composer.ct fixture) — real bytes so the picker/FormData path is real.
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const MATERIALIZED_ENTRY = {
  entryId: "bg_ct_wallpaper",
  assetId: "asset_01h455vb4pex5vsknk084sn02q",
  assetHash: "hash_ct_wallpaper",
  mime: "image/png",
  name: "wallpaper",
  provenanceUrl: "https://cdn.example/wallpaper.png",
};

function stub(page: Page, external: TrpcResponder = (): unknown => MATERIALIZED_ENTRY): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => SETTINGS_VIEW,
    [UPDATE_PROC]: () => ({}),
    [EXTERNAL_PROC]: external,
  });
}

/** The most recent patch body sent to the appearance section-patch mutation. */
function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { patch?: Record<string, unknown> } | undefined;
  return input?.patch;
}

test("mounts with the persisted default values rendered", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceSettingsStory />);
  await expect(page.getByRole("combobox", { name: "Chat display" })).toContainText("Bubble");
  await expect(page.getByRole("slider", { name: "Chat width (%)" })).toHaveAttribute("aria-valuenow", String(DEFAULT_USER_SETTINGS.appearance.chatWidthPct));
  await expect(page.getByRole("slider", { name: "Text size", exact: true })).toHaveAttribute(
    "aria-valuenow",
    String(DEFAULT_USER_SETTINGS.appearance.fontScale),
  );
});

test("chatStyle select fires the mutation with the correct patch key", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceSettingsStory />);
  await page.getByRole("combobox", { name: "Chat display" }).click();
  await page.getByRole("option", { name: "Flat", exact: true }).click();
  await expect.poll(() => lastPatch(trpc)?.["chatStyle"], { intervals: [20, 50, 100] }).toBe("flat");
});

test("chatWidthPct slider clamps at its own MIN/MAX and patches chatWidthPct", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceSettingsStory />);
  const slider = page.getByRole("slider", { name: "Chat width (%)" });

  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuenow", String(CHAT_WIDTH_MIN));
  await expect.poll(() => lastPatch(trpc)?.["chatWidthPct"], { intervals: [20, 50, 100] }).toBe(CHAT_WIDTH_MIN);

  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuenow", String(CHAT_WIDTH_MAX));
  await expect.poll(() => lastPatch(trpc)?.["chatWidthPct"], { intervals: [20, 50, 100] }).toBe(CHAT_WIDTH_MAX);
});

test("fontScale slider clamps at its own MIN/MAX and patches fontScale", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceSettingsStory />);
  const slider = page.getByRole("slider", { name: "Text size", exact: true });

  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuenow", String(FONT_SCALE_MIN));
  await expect.poll(() => lastPatch(trpc)?.["fontScale"], { intervals: [20, 50, 100] }).toBe(FONT_SCALE_MIN);

  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuenow", String(FONT_SCALE_MAX));
  await expect.poll(() => lastPatch(trpc)?.["fontScale"], { intervals: [20, 50, 100] }).toBe(FONT_SCALE_MAX);
});

test("avatar size/shape/aspect/ring selects each patch the correct key", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceSettingsStory />);

  await page.getByRole("combobox", { name: "Avatar size" }).click();
  await page.getByRole("option", { name: "Large" }).click();
  await expect.poll(() => lastPatch(trpc)?.["avatarSize"], { intervals: [20, 50, 100] }).toBe("lg");

  await page.getByRole("combobox", { name: "Avatar shape" }).click();
  await page.getByRole("option", { name: "Square", exact: true }).click();
  await expect.poll(() => lastPatch(trpc)?.["avatarShape"], { intervals: [20, 50, 100] }).toBe("square");

  await page.getByRole("combobox", { name: "Avatar aspect" }).click();
  await page.getByRole("option", { name: "Portrait (2:3)" }).click();
  await expect.poll(() => lastPatch(trpc)?.["avatarAspect"], { intervals: [20, 50, 100] }).toBe("portrait");

  await page.getByRole("combobox", { name: "Avatar ring" }).click();
  await page.getByRole("option", { name: "Accent" }).click();
  await expect.poll(() => lastPatch(trpc)?.["avatarRing"], { intervals: [20, 50, 100] }).toBe("accent");

  // Every intermediate autosave carries the FULL patch — the final settled call still holds all four.
  await expect
    .poll(() => lastPatch(trpc), { intervals: [20, 50, 100] })
    .toMatchObject({
      avatarSize: "lg",
      avatarShape: "square",
      avatarAspect: "portrait",
      avatarRing: "accent",
    });
});

test("background fit/dim/blur sliders clamp at their own MIN/MAX once an image kind is chosen", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceSettingsStory />);

  // Fit/Dim/Blur are gated behind a non-"none" backgroundImageKind (form.Subscribe, reactive on LOCAL
  // form state — no server round-trip needed before the gated fields appear).
  await page.getByRole("combobox", { name: "Image" }).click();
  await page.getByRole("option", { name: "Seeded" }).click();

  await page.getByRole("combobox", { name: "Fit" }).click();
  await page.getByRole("option", { name: "Contain (fit, may letterbox)" }).click();

  const dim = page.getByRole("slider", { name: "Scrim opacity" });
  await dim.press("End");
  await expect(dim).toHaveAttribute("aria-valuenow", String(BACKGROUND_DIM_MAX));
  await dim.press("Home");
  await expect(dim).toHaveAttribute("aria-valuenow", String(BACKGROUND_DIM_MIN));

  const blur = page.getByRole("slider", { name: "Image blur" });
  await blur.press("Home");
  await expect(blur).toHaveAttribute("aria-valuenow", String(BACKGROUND_BLUR_MIN));
  await blur.press("End");
  await expect(blur).toHaveAttribute("aria-valuenow", String(BACKGROUND_BLUR_MAX));

  await expect
    .poll(() => lastPatch(trpc), { intervals: [20, 50, 100] })
    .toMatchObject({
      backgroundImageKind: "seeded",
      backgroundFit: "contain",
      backgroundDim: BACKGROUND_DIM_MIN,
      backgroundBlur: BACKGROUND_BLUR_MAX,
    });
});

// F-P0-2 — the "add a background from a URL" affordance. It is NOT a `backgroundImageKind` option: `external`
// can never be a persisted paintable state (BG-C), and this form AUTOSAVES every kind change, so the URL arm
// lives inside the `asset` (Upload) branch and its result lands as an owned CAS asset.
test("the Upload branch's URL arm fires addExternalBackground and persists the returned entry", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceSettingsStory />);

  await page.getByRole("combobox", { name: "Image" }).click();
  await page.getByRole("option", { name: "Upload" }).click();

  await page.getByRole("textbox", { name: "Add from a web address" }).fill("https://cdn.example/wallpaper.png");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  // The MUTATION fired with the pasted URL (never a per-keystroke fetch — one discrete apply).
  await expect.poll(() => trpc.count(EXTERNAL_PROC), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput(EXTERNAL_PROC), { intervals: [20, 50, 100] }).toStrictEqual({ url: "https://cdn.example/wallpaper.png" });

  // …and the returned entry lands through the appearance autosave: appended to the library (BG-D) AND
  // selected as the live background (id + hash + mime — the three fields the resolver reads).
  await expect
    .poll(() => lastPatch(trpc), { intervals: [20, 50, 100] })
    .toMatchObject({
      backgroundImageKind: "asset",
      backgroundLibrary: [MATERIALIZED_ENTRY],
      backgroundAssetId: MATERIALIZED_ENTRY.assetId,
      backgroundAssetHash: MATERIALIZED_ENTRY.assetHash,
      backgroundAssetMime: MATERIALIZED_ENTRY.mime,
    });
});

test("a refused URL surfaces the verb's own leak-free reason inline and writes nothing", async ({ mount, page }) => {
  const trpc = await stub(page, () =>
    trpcError({ code: "BAD_REQUEST", message: "That URL isn't an image we can use as a background.", reason: "background_unavailable" }),
  );
  await mount(<AppearanceSettingsStory />);

  await page.getByRole("combobox", { name: "Image" }).click();
  await page.getByRole("option", { name: "Upload" }).click();
  await page.getByRole("textbox", { name: "Add from a web address" }).fill("https://cdn.example/not-an-image.txt");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByText("That URL isn't an image we can use as a background.")).toBeVisible();
  // The refusal never reaches the persisted blob — no library row, no selected asset.
  await expect.poll(() => lastPatch(trpc)?.["backgroundLibrary"], { intervals: [20, 50, 100] }).toStrictEqual([]);
  expect(lastPatch(trpc)?.["backgroundAssetId"]).toBe("");
});

// AU-9 (owner ruling 2026-07-31) — an own UPLOAD saves to the library exactly like the URL twin, so both
// ways in feed the one list `/setbackground <name>` and the carried-background picker read. It also carries
// the file's MIME (BG-V: a video entry selects the `<video>` background layer over the image one).
test("an upload appends a library entry with its mime and selects it live", async ({ mount, page }) => {
  const trpc = await stub(page);
  // The multipart upload route is raw fetch, not tRPC.
  await page.route("**/api/assets/upload", async (route) => {
    await route.fulfill({ json: { assetId: MATERIALIZED_ENTRY.assetId, hash: "uploadedhash", size: PNG_1PX.length, created: true } });
  });
  await mount(<AppearanceSettingsStory />);

  await page.getByRole("combobox", { name: "Image" }).click();
  await page.getByRole("option", { name: "Upload" }).click();
  await page.locator('[data-slot="file-dropzone-input"]').setInputFiles({ name: "dusk-harbour.png", mimeType: "image/png", buffer: PNG_1PX });

  // The library row carries the mime + the file-derived name (extension stripped — the URL arm's twin), and
  // the same add ALSO selects it (id + hash + mime), so the upload paints immediately.
  await expect
    .poll(() => lastPatch(trpc), { intervals: [20, 50, 100] })
    .toMatchObject({
      backgroundLibrary: [{ assetId: MATERIALIZED_ENTRY.assetId, assetHash: "uploadedhash", mime: "image/png", name: "dusk-harbour" }],
      backgroundAssetId: MATERIALIZED_ENTRY.assetId,
      backgroundAssetHash: "uploadedhash",
      backgroundAssetMime: "image/png",
    });
});

// The settings-SECTION seam (client-architecture-lockdown.md §6c): the `library` page-size section is a
// CONTRIBUTION owned by features/character (it reads the knob), not pane content — the pane renders it at
// its own registry-derived anchor, LAST (after every own section), and its write is the distinct `library`
// section-patch.
test("the contributed Library section renders at the appearance anchor, last, and patches library.pageSize", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceSettingsStory />);

  const library = page.locator("#settings-anchor-appearance-library");
  await expect(library).toBeVisible();
  await expect(library.getByRole("heading", { name: "Library" })).toBeVisible();

  // Declared order: own sections first, contributions after — the contributed section is the LAST anchor.
  const anchorIds = await page.evaluate(() => [...document.querySelectorAll('[id^="settings-anchor-appearance-"]')].map((el) => el.id));
  expect(anchorIds.at(-1)).toBe("settings-anchor-appearance-library");

  // The section owns its own mutation: a valid page size writes the `library` section, never `appearance`.
  await page.getByRole("spinbutton", { name: "Rows per page" }).fill("50");
  await expect.poll(() => trpc.lastInput(UPDATE_PROC), { intervals: [20, 50, 100] }).toStrictEqual({ section: "library", patch: { pageSize: 50 } });
});

test("with ZERO contributions the pane renders no contributed section (the empty-door case)", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceSettingsNoContributionsStory />);
  await page.getByRole("heading", { name: "Message style" }).waitFor();
  await expect(page.locator("#settings-anchor-appearance-library")).toHaveCount(0);
});

// Single-column-of-SECTIONS (owner ruling — Discord grammar): every subcategory SECTION shares the same
// left edge + full column width and stacks in registry order (never two sections side by side). Fields
// WITHIN a section may pair up — this asserts SECTION boxes only.
test("subcategory sections are a single column, stacked in registry order", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceSettingsStory />);
  await page.getByRole("heading", { name: "Message style" }).waitFor();

  const boxes = await page.evaluate(() => {
    const sections = [...document.querySelectorAll<HTMLElement>('[id^="settings-anchor-appearance-"]')];
    const parent = sections[0]?.parentElement;
    return {
      count: sections.length,
      parentWidth: parent?.clientWidth ?? -1,
      rows: sections.map((s) => {
        const r = s.getBoundingClientRect();
        return { x: Math.round(r.x), top: Math.round(r.top), width: Math.round(r.width) };
      }),
    };
  });

  expect(boxes.count).toBeGreaterThanOrEqual(8);
  // All sections share the same left edge (single column) and fill (nearly) the whole column width.
  const firstX = boxes.rows[0]?.x ?? 0;
  for (const row of boxes.rows) {
    expect(Math.abs(row.x - firstX)).toBeLessThanOrEqual(1);
    expect(row.width).toBeGreaterThanOrEqual(boxes.parentWidth - 2);
  }
  // Registry order == DOM order == strictly increasing vertical position (stacked, never side-by-side).
  for (let i = 1; i < boxes.rows.length; i += 1) {
    expect(boxes.rows[i]?.top ?? 0).toBeGreaterThan(boxes.rows[i - 1]?.top ?? 0);
  }
});

// Effects redesign (owner ruling — the ToggleGroup multi-select read ugly): the frosted-glass surfaces
// are independent SWITCH rows now (setting-row grammar), each toggling `blurSurfaces` membership. Assert
// a real switch (role=switch), not a toggle-group option, and that flipping it patches the array field.
test("Effects renders switch rows; toggling a surface patches blurSurfaces", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceSettingsStory />);

  const panels = page.getByRole("switch", { name: "Side panels" });
  await expect(panels).toBeVisible();
  // Not a toggle-group option (the old ugly control) — a proper switch.
  await expect(page.getByRole("switch", { name: "Prose shadow" })).toBeVisible();

  await panels.click();
  await expect.poll(() => lastPatch(trpc)?.["blurSurfaces"], { intervals: [20, 50, 100] }).toContain("panels");
});

// UIP-404 row grammar (owner items 6+7): form fields render horizontal — label+description LEFT, control
// docked RIGHT in the fixed ~200px control column — and a select is sized to that column, never 100% of
// the pane. Autosave binding stays intact (the other tests above prove the patches still fire).
test("settings fields use the horizontal row grammar and selects are not full-width", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceSettingsStory />);
  const combo = page.getByRole("combobox", { name: "Chat display" });
  await expect(combo).toBeVisible();

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

  expect(geo.orientation).toBe("horizontal");
  // The control column is the ~200px token, and it is much narrower than the whole field row (the select
  // is docked in the column, not stretched to the pane width).
  expect(Math.abs(geo.colWidth - geo.tokenPx)).toBeLessThanOrEqual(2);
  expect(geo.colWidth).toBeLessThan(geo.fieldWidth);
});

// In-flow squeeze guard (Wave-1 remedy · §4b axis 1): at a NARROW pane width the fixed ~200px control
// column must NOT starve the label block — the horizontal row stacks (control below label) so the label
// keeps (nearly) the full pane width. The pane is its own <Container>, so it adapts to the pane, not the
// modal chrome. (My settings surface has no opacity-0-in-flow REVEAL consumer — this fixed control column
// was the only in-flow fixed-width sibling; the reveal cluster itself lives in the chat lane.)
test("at a narrow pane width the horizontal field stacks — the control column can't starve the label", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceSettingsNarrowStory />);
  const combo = page.getByRole("combobox", { name: "Chat display" });
  await expect(combo).toBeVisible();

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

  // Stacked: the label block spans (nearly) the full field width — never squeezed toward 0.
  expect(geo.blockW).toBeGreaterThan(geo.fieldW * 0.9);
  // The label's own content fits its block (no clipped/starved label).
  expect(geo.blockW).toBeGreaterThanOrEqual(geo.labelWantsW - 1);
});
