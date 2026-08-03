// CT: the Background appearance SECTION (SET-SEAMS stage 1) — an app-shell-owned section of the decomposed
// appearance pane. Carries the whole BG-C/BG-D/BG-V/AU-9 battery that used to live on the appearance
// surface's CT (the URL arm materializes server-side, an upload lands in the same library, a refusal writes
// nothing) plus P1 (SET-SEAMS §9): the `appearance` section-patch carries EXACTLY the nine background keys.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import {
  BACKGROUND_BLUR_MAX,
  BACKGROUND_BLUR_MIN,
  BACKGROUND_DIM_MAX,
  BACKGROUND_DIM_MIN,
} from "../../../../../packages/client/src/features/app-shell/lib/appearance-bounds.ts";
import type { TrpcRecorder, TrpcResponder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc.ts";
import { AppearanceBackgroundSectionStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = { userId: "user_ct_background", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };
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
const OWNED_KEYS = [
  "backgroundAssetHash",
  "backgroundAssetId",
  "backgroundAssetMime",
  "backgroundBlur",
  "backgroundDim",
  "backgroundFit",
  "backgroundImageKind",
  "backgroundLibrary",
  "backgroundSeededId",
];

function stub(page: Page, external: TrpcResponder = (): unknown => MATERIALIZED_ENTRY): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => SETTINGS_VIEW,
    [UPDATE_PROC]: () => ({}),
    [EXTERNAL_PROC]: external,
  });
}

function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { section?: string; patch?: Record<string, unknown> } | undefined;
  return input?.section === "appearance" ? input.patch : undefined;
}

test("fit/dim/blur clamp at their own MIN/MAX once an image kind is chosen, and the patch stays key-minimal", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceBackgroundSectionStory />);

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
  // P1 — nine background keys, never the whole appearance blob (which would clobber a sibling section).
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);
});

// F-P0-2 — the "add a background from a URL" affordance. It is NOT a `backgroundImageKind` option:
// `external` can never be a persisted paintable state (BG-C), and this form AUTOSAVES every kind change, so
// the URL arm lives inside the `asset` (Upload) branch and its result lands as an owned CAS asset.
test("the Upload branch's URL arm fires addExternalBackground and persists the returned entry", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceBackgroundSectionStory />);

  await page.getByRole("combobox", { name: "Image" }).click();
  await page.getByRole("option", { name: "Upload" }).click();

  await page.getByRole("textbox", { name: "Add from a web address" }).fill("https://cdn.example/wallpaper.png");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  // The MUTATION fired with the pasted URL (never a per-keystroke fetch — one discrete apply).
  await expect.poll(() => trpc.count(EXTERNAL_PROC), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput(EXTERNAL_PROC), { intervals: [20, 50, 100] }).toStrictEqual({ url: "https://cdn.example/wallpaper.png" });

  // …and the returned entry lands through the section's own autosave: appended to the library (BG-D) AND
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
  await mount(<AppearanceBackgroundSectionStory />);

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
  await mount(<AppearanceBackgroundSectionStory />);

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
