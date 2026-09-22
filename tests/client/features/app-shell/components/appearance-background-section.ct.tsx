// CT: the Background appearance SECTION (SET-SEAMS stage 1) — an app-shell-owned section of the decomposed
// appearance pane. Carries the whole BG-C/BG-D/BG-V/AU-9 battery that used to live on the appearance
// surface's CT (the URL arm materializes server-side, an upload lands in the same library, a refusal writes
// nothing) plus P1 (SET-SEAMS §9): the `appearance` section-patch carries EXACTLY the nine background keys.
//
// THE PICKER IS A THUMBNAIL GRID, NOT A COMBOBOX (#1207, re-pinned 2026-09-02). `8a038b047` (#866 S4a,
// 2026-08-30) retired the `Image` kind combobox for R-BG's one MediaGrid — None · every
// library entry — where `backgroundImageKind` DERIVES from the tapped tile and is never a user-facing
// control, and moved both ways in (upload · URL) behind one "Add background" door at the grid's end. That
// commit swept `app-shell.ct.tsx` and `rail.ct.tsx` and missed THIS file, so four tests here queried a
// combobox that has not existed since (`getByRole("combobox", { name: "Image" })` — the same
// missed-sibling-CT class as #1197).
//
// Each of the four is re-pinned on the real flow and made STRICTLY STRONGER, never adapted: the clamp test
// now also proves the gated rows are ABSENT before a pick and that the asset ref DERIVES from the tapped
// tile; both add-arms now also prove the new entry becomes a SELECTED TILE in the grid; and the refusal now
// also proves the grid gains no tile. Every one of those is a claim the combobox shape could not make.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import {
  BACKGROUND_BLUR_MAX,
  BACKGROUND_BLUR_MIN,
  BACKGROUND_DIM_MAX,
  BACKGROUND_DIM_MIN,
} from "../../../../../packages/client/src/features/app-shell/lib/appearance-bounds.ts";
import { DEFAULT_DEBOUNCE_MS } from "../../../../../packages/client/src/forms/entity-form-base.ts";
import type { TrpcRecorder, TrpcResponder, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { AppearanceBackgroundSectionStory } from "../_ct-stories.tsx";

/** A BUNDLED SCENE PLATE as the picker actually sees one since `kind:"seeded"` retired (2026-09-18): an
 *  ordinary `appearance.backgroundLibrary` entry, seeded per user from `@orb/default-content` by
 *  `domain/settings/seeder/backgrounds.ts`. This CT's picker premise used to be the static
 *  `listSeededBackgrounds()` catalog, which no longer exists — a plate is a library row like any upload, so
 *  the stub seeds one instead of the grid conjuring tiles out of a constant. */
const SEEDED_PLATE_ENTRY = {
  entryId: "bg_ct_plate",
  assetId: "asset_01h455vb4pex5vsknk084sn03r",
  assetHash: "hash_ct_plate",
  mime: "image/jpeg",
  name: "Charlotte's study",
};
const SETTINGS_VIEW = {
  userId: "user_ct_background",
  schemaVersion: 1,
  config: { ...DEFAULT_USER_SETTINGS, appearance: { ...DEFAULT_USER_SETTINGS.appearance, backgroundLibrary: [SEEDED_PLATE_ENTRY] } },
  configUnreadable: null,
  updatedAt: 0,
};
const UPDATE_PROC = "settings.updateUserSettingsSection";
// F-P0-2 — the URL arm of the `asset` background kind. The verb MATERIALIZES the pasted address server-side
// and hands back a ready library entry; nothing external is ever persisted (BG-C).
const EXTERNAL_PROC = "settings.addExternalBackground";
// A 1×1 PNG for the own-upload arm (the composer.ct fixture) — real bytes so the picker/FormData path is real.
/** A CAS hash the CONTRACT accepts — `storedAssetSchema.hash` is a fixed 64-char string
 *  (`packages/contracts/src/assets/index.ts:78`), so the short readable literal this stub used to return
 *  made `uploadAsset` THROW and the upload under test never landed at all. */
const UPLOADED_HASH = "ab".repeat(32);

const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const MATERIALIZED_ENTRY = {
  entryId: "bg_ct_wallpaper",
  assetId: "asset_01h455vb4pex5vsknk084sn02q",
  assetHash: "hash_ct_wallpaper",
  mime: "image/png",
  name: "wallpaper",
  provenanceUrl: "https://cdn.example/wallpaper.png",
} satisfies TrpcWireOutput<"settings.addExternalBackground">;
const OWNED_KEYS = [
  "backgroundAssetHash",
  "backgroundAssetId",
  "backgroundAssetMime",
  "backgroundBlur",
  "backgroundDim",
  "backgroundFit",
  "backgroundImageKind",
  "backgroundLibrary",
];

function stub(page: Page, external: TrpcResponder<typeof EXTERNAL_PROC> = () => MATERIALIZED_ENTRY): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => SETTINGS_VIEW,
    [UPDATE_PROC]: () => SETTINGS_VIEW,
    [EXTERNAL_PROC]: external,
  });
}

function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { section?: string; patch?: Record<string, unknown> } | undefined;
  return input?.section === "appearance" ? input.patch : undefined;
}

/** The picker itself. Tiles are `role="gridcell"` named by their `alt` (MediaGrid puts the accessible name
 *  on the CELL; the `<img>` is decorative), and the live one carries `aria-selected` — the ring is the only
 *  feedback a thumbnail picker gives, so these tests read it rather than a control's value. */
function grid(page: Page): Locator {
  return page.getByRole("grid", { name: "Background image" });
}

function tile(page: Page, name: string): Locator {
  return grid(page).getByRole("gridcell", { name, exact: true });
}

/** Open the ONE add door at the grid's end (#866 S4a) — both ways in (upload · URL) live behind it, and it
 *  rests closed, so every add-arm test opens it first. */
function openAddDoor(page: Page): Promise<void> {
  return page.getByRole("button", { name: "Add background" }).click();
}

test("fit/dim/blur are GATED until a tile is picked, then clamp at their own MIN/MAX, and the patch stays key-minimal", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceBackgroundSectionStory />);
  await expect(grid(page)).toBeVisible();

  // THE GATE, asserted rather than assumed (the combobox shape only ever exercised the far side of it): at
  // rest the settings' kind is `none`, so the three treatment rows do not exist at all.
  await expect(page.getByRole("combobox", { name: "Fit" })).toHaveCount(0);
  await expect(page.getByRole("slider", { name: "Scrim opacity" })).toHaveCount(0);
  await expect(page.getByRole("slider", { name: "Image blur" })).toHaveCount(0);
  // …and "None" is the tile wearing the ring, which is the only thing that tells a reader what is live.
  await expect(tile(page, "No background")).toHaveAttribute("aria-selected", "true");

  // R-BG: the KIND is storage detail derived from the tap — there is no kind control to operate.
  await tile(page, SEEDED_PLATE_ENTRY.name).click();
  await expect(tile(page, SEEDED_PLATE_ENTRY.name)).toHaveAttribute("aria-selected", "true");
  await expect(tile(page, "No background")).toHaveAttribute("aria-selected", "false");

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
      backgroundImageKind: "asset",
      // The tapped TILE's own asset, not a value chosen in a control — this is the derivation R-BG replaced
      // the combobox with, and the combobox shape structurally could not assert it. A bundled plate writes
      // the SAME three fields an upload does, which is the whole point of retiring `kind:"seeded"`.
      backgroundAssetId: SEEDED_PLATE_ENTRY.assetId,
      backgroundAssetHash: SEEDED_PLATE_ENTRY.assetHash,
      backgroundAssetMime: SEEDED_PLATE_ENTRY.mime,
      backgroundFit: "contain",
      backgroundDim: BACKGROUND_DIM_MIN,
      backgroundBlur: BACKGROUND_BLUR_MAX,
    });
  // P1 — the eight background keys, never the whole appearance blob (which would clobber a sibling section).
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);
});

// F-P0-2 — the "add a background from a URL" affordance. It is NOT a background KIND: `external` can never
// be a persisted paintable state (BG-C), so the URL arm lives behind the grid's one "Add background" door
// beside the upload twin, and its result lands as an owned CAS asset (#866 S4a moved it there from the
// retired combobox's `Upload` branch).
test("the add door's URL arm fires addExternalBackground and the returned entry lands as the SELECTED tile", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceBackgroundSectionStory />);
  await expect(grid(page)).toBeVisible();

  // The door rests CLOSED and the URL field is not reachable until it is opened — the grid is the surface,
  // the two ways in are one fold at its end.
  await expect(page.getByRole("textbox", { name: "Add from a web address" })).toHaveCount(0);
  await openAddDoor(page);

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
      backgroundLibrary: [SEEDED_PLATE_ENTRY, MATERIALIZED_ENTRY],
      backgroundAssetId: MATERIALIZED_ENTRY.assetId,
      backgroundAssetHash: MATERIALIZED_ENTRY.assetHash,
      backgroundAssetMime: MATERIALIZED_ENTRY.mime,
    });
  // THE VISIBLE HALF, which the combobox shape had no way to state: a background you added is a TILE in the
  // same grid as the seeded plates (which are library entries too), and it is the one wearing the ring. "Persisted" and "painted" are two
  // claims, and the picker is where the second one is answerable.
  await expect(tile(page, MATERIALIZED_ENTRY.name)).toHaveAttribute("aria-selected", "true");
  await expect(tile(page, "No background")).toHaveAttribute("aria-selected", "false");
});

test("a refused URL surfaces the verb's own leak-free reason inline, writes nothing, and adds no tile", async ({ mount, page }) => {
  const trpc = await stub(page, () =>
    trpcError({ code: "BAD_REQUEST", message: "That URL isn't an image we can use as a background.", reason: "background_unavailable" }),
  );
  await mount(<AppearanceBackgroundSectionStory />);
  await expect(grid(page)).toBeVisible();
  // The tile census BEFORE the refusal — None plus the library's own rows (the seeded plate), nothing else.
  const tilesBefore = await grid(page).getByRole("gridcell").count();

  await openAddDoor(page);
  await page.getByRole("textbox", { name: "Add from a web address" }).fill("https://cdn.example/not-an-image.txt");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByText("That URL isn't an image we can use as a background.")).toBeVisible();

  // THE WRITE ASSERTION GOT STRONGER, not weaker (#1207). Under the retired combobox this read
  // `lastPatch(trpc)?.backgroundLibrary === []` — but that patch only existed because PICKING "Upload" in
  // the kind combobox was itself a form edit that autosaved. With the picker gone, opening the add door
  // edits nothing, so the honest claim is the absolute one: a refusal produces NO appearance write AT ALL.
  // Barriered on the rendered refusal above, then held across an idle window derived from the form's own
  // debounce (never a guessed sleep) — a write queued behind the debounce would land inside it.
  await page.evaluate(
    (idleMs) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, idleMs);
      }),
    DEFAULT_DEBOUNCE_MS * 3,
  );
  expect(trpc.count(UPDATE_PROC), "a refused URL must not write the appearance section at all").toBe(0);
  // …and it never reaches the PICKER either: no phantom tile, and "None" is still the live one. A refusal
  // that wrote nothing but painted a tile would read to the user as a background they now own.
  await expect(grid(page).getByRole("gridcell")).toHaveCount(tilesBefore);
  await expect(tile(page, "No background")).toHaveAttribute("aria-selected", "true");
});

// #1194 — the wallpaper-jiggle bug: the picker grid re-rendered continuously (every wallpaper thumbnail
// visibly jiggling) instead of settling once after mount.
//
// THE COMMIT TALLY THIS TEST USED TO READ MEASURED NOTHING (#2412, 2026-09-18). playwright-ct runs the
// PRODUCTION React build, whose `<Profiler>` never calls `onRender` — that is a profiling-build feature —
// so `globalThis.__ctCommits` sat at exactly 0 and the two assertions built on it (`second === first`,
// `second < 10`) compared 0 to 0 and would have passed against a surface re-rendering forever. Measured
// here before the replacement: asserting `firstReading > 0` against the unchanged source FAILED. The same
// measurement is recorded in `tests/client/features/chat/_ct-stories.tsx`'s #1873 block, which chose the
// honest observable first: RENDERED GEOMETRY sampled PER ANIMATION FRAME.
//
// So the pin is now one frame-resolution sampler covering BOTH halves of the defect: the grid's own box
// and column count (React's output) AND every tile's rect (what "visibly jiggling" means to the user).
// Frame resolution also covers what the commit tally structurally could not — MediaGrid's virtualizer
// writes row position DIRECTLY to the DOM (`directDomUpdates`), so a ResizeObserver feedback loop that
// toggles the measured column count never reaches a React commit at all — and a 50ms tick loop can land
// on the same phase of a per-frame alternation. A settled grid reports ONE distinct sample; an
// oscillating one reports more.
test("the section's rendered geometry settles after mount and stays settled with no user interaction", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceBackgroundSectionStory />);
  await expect(page.getByRole("grid", { name: "Background image" })).toBeVisible();

  // One settle window for the work a healthy mount legitimately does (suspense resolution, the autosave's
  // first server-echo reseed, thumbnail decode). It runs IN-PAGE rather than as `page.waitForTimeout` so
  // it is real elapsed page time the app cannot render through unobserved.
  await page.evaluate(
    async () =>
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 500);
      }),
  );
  const distinctFrames = await page.evaluate(
    async () =>
      await new Promise<string[]>((resolve) => {
        const seen: string[] = [];
        const sample = (): string => {
          const root = document.querySelector('[data-slot="media-grid-root"]');
          if (root === null) {
            return "no-grid-root";
          }
          const tiles = [...root.querySelectorAll('[role="gridcell"]')].map((cell) => {
            const rect = cell.getBoundingClientRect();
            return [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)].join(",");
          });
          return JSON.stringify({
            colcount: root.getAttribute("aria-colcount"),
            scrollHeight: root.scrollHeight,
            clientHeight: root.clientHeight,
            scrollWidth: root.scrollWidth,
            clientWidth: root.clientWidth,
            tiles,
          });
        };
        const tick = (): void => {
          seen.push(sample());
          if (seen.length < 30) {
            requestAnimationFrame(tick);
            return;
          }
          resolve([...new Set(seen)]);
        };
        requestAnimationFrame(tick);
      }),
  );

  // distinctFrames is a frozen array the in-page rAF loop already finished collecting (30 frames, over its
  // own elapsed window) before it resolved — there is nothing left in flight for a poll to re-read.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — distinctFrames was fully collected in-page across 30 animation frames before resolving.
  expect(distinctFrames).toHaveLength(1);
  // …and the sampler really looked at the grid, so the single distinct sample above is a measurement
  // rather than 30 identical "no-grid-root" strings — the planted-control half of this pin.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — same frozen array as the assertion above.
  expect(distinctFrames[0]).toContain('"tiles":["');
});

// AU-9 (owner ruling 2026-07-31) — an own UPLOAD saves to the library exactly like the URL twin, so both
// ways in feed the one list `/setbackground <name>` and the carried-background picker read. It also carries
// the file's MIME (BG-V: a video entry selects the `<video>` background layer over the image one).
test("an upload appends a library entry with its mime and lands as the SELECTED tile", async ({ mount, page }) => {
  const trpc = await stub(page);
  // The multipart upload route is raw fetch, not tRPC.
  await page.route("**/api/assets/upload", async (route) => {
    await route.fulfill({ json: { assetId: MATERIALIZED_ENTRY.assetId, hash: UPLOADED_HASH, size: PNG_1PX.length, created: true } });
  });
  await mount(<AppearanceBackgroundSectionStory />);
  await expect(grid(page)).toBeVisible();

  await openAddDoor(page);
  await page.locator('[data-slot="file-dropzone-input"]').setInputFiles({ name: "dusk-harbour.png", mimeType: "image/png", buffer: PNG_1PX });

  // The library row carries the mime + the file-derived name (extension stripped — the URL arm's twin), and
  // the same add ALSO selects it (id + hash + mime), so the upload paints immediately.
  await expect
    .poll(() => lastPatch(trpc), { intervals: [20, 50, 100] })
    .toMatchObject({
      // APPENDED after the seeded plate the library already carries — an upload joins the one list, it does
      // not replace it (the plates are ordinary library rows since `kind:"seeded"` retired).
      backgroundLibrary: [SEEDED_PLATE_ENTRY, { assetId: MATERIALIZED_ENTRY.assetId, assetHash: UPLOADED_HASH, mime: "image/png", name: "dusk-harbour" }],
      backgroundAssetId: MATERIALIZED_ENTRY.assetId,
      backgroundAssetHash: UPLOADED_HASH,
      backgroundAssetMime: "image/png",
    });
  // The upload twin's own visible half: the file-derived NAME is the tile's accessible name, and the tile is
  // the live one — which is what makes "both ways in feed the ONE list" checkable from the picker.
  await expect(tile(page, "dusk-harbour")).toHaveAttribute("aria-selected", "true");
});

// #1194 (DPR CORRELATION ARM, added 2026-09-02) — the owner's window carried 12,733
// `ResizeObserver loop completed with undelivered notifications` errors while a DPR-1 override sat on a
// DPR-2 display. MediaGrid is the prime suspect by construction: it measures its own width to choose a
// column count and its virtualizer writes row position straight to the DOM, so a half-device-pixel
// measurement that rounds one way on read and the other on write is exactly the shape that makes a
// ResizeObserver re-fire forever. The commit tally above cannot see it (`directDomUpdates` bypasses React)
// and the geometry sampler above only catches a loop that CHANGES the layout — a loop that re-measures to
// the same answer still burns the frame budget and still floods the console, and the console is the only
// place it is visible.
//
// The pin is the ERROR COUNT over a settled idle window, at both device scales, because the correlation the
// owner reported is a DPR one: at DPR 1 the grid's box lands on whole device pixels and at DPR 2 a
// half-CSS-pixel width is a whole device pixel, so a rounding disagreement can exist at one and not the
// other. Zero is the bar at BOTH — an RO feedback loop is a defect at any scale, not a budget.
for (const deviceScaleFactor of [1, 2] as const) {
  test.describe(`MediaGrid at DPR ${String(deviceScaleFactor)}`, () => {
    test.use({ deviceScaleFactor });

    test("the background grid runs a settled idle with no ResizeObserver feedback loop", async ({ mount, page }) => {
      await stub(page);
      // Registered BEFORE the mount: an RO loop fires during the first measurement pass, which is over
      // before any assertion could attach a listener afterwards.
      const resizeObserverErrors: string[] = [];
      const record = (text: string): void => {
        if (text.includes("ResizeObserver loop")) {
          resizeObserverErrors.push(text);
        }
      };
      page.on("pageerror", (error) => {
        record(error.message);
      });
      page.on("console", (message) => {
        if (message.type() === "error") {
          record(message.text());
        }
      });

      await mount(<AppearanceBackgroundSectionStory />);
      await expect(grid(page)).toBeVisible();
      // The scale the browser actually gave us — a `test.use` that silently did not apply would make both
      // arms the same measurement wearing two names.
      await expect.poll(() => page.evaluate(() => globalThis.devicePixelRatio)).toBe(deviceScaleFactor);

      // A real elapsed IN-PAGE idle (not `waitForTimeout`, which the app can commit through unobserved),
      // long enough that a loop firing per animation frame would have logged hundreds of times.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            setTimeout(resolve, 3000);
          }),
      );

      expect(resizeObserverErrors, `ResizeObserver loop errors at DPR ${String(deviceScaleFactor)}`).toStrictEqual([]);

      // PLANTED POSITIVE CONTROL, in the same invocation: a zero from an unprobed sampler is "I could not
      // measure", never "it did not happen". Throw one error carrying the exact substring the recorder
      // filters on and prove it lands — so the zero above is a measurement, not a dead listener.
      await page.evaluate(() => {
        setTimeout(() => {
          throw new Error("ResizeObserver loop — planted control, not a real finding");
        }, 0);
      });
      await expect.poll(() => resizeObserverErrors.length, { intervals: [20, 50, 100] }).toBe(1);
    });
  });
}

// ── #1520 item 4 · THE SUCCESS AFFORDANCE IS PER-ATTEMPT ─────────────────────────────────────────
// `setSuccess(true)` was never reset at the start of a later attempt, so a failed re-upload after any
// earlier success painted the dropzone's SUCCESS state and the Field's error at the same time — the one
// control telling the reader both things at once about one attempt. Driven as two real attempts through the
// same field, because that is the only shape in which the stale flag is reachable.
test("a FAILED re-upload after a successful one shows the error WITHOUT the stale success (#1520)", async ({ mount, page }) => {
  await stub(page);
  let uploads = 0;
  await page.route("**/api/assets/upload", async (route) => {
    uploads += 1;
    if (uploads === 1) {
      await route.fulfill({ json: { assetId: MATERIALIZED_ENTRY.assetId, hash: UPLOADED_HASH, size: PNG_1PX.length, created: true } });
      return;
    }
    await route.fulfill({ status: 500, json: { message: "upload failed" } });
  });
  await mount(<AppearanceBackgroundSectionStory />);
  await expect(grid(page)).toBeVisible();
  await openAddDoor(page);

  const input = page.locator('[data-slot="file-dropzone-input"]');
  await input.setInputFiles({ name: "dusk-harbour.png", mimeType: "image/png", buffer: PNG_1PX });
  // Barrier on the SETTLED success of attempt one — the flag this test is about only exists once it is set.
  await expect(page.locator('[data-slot="file-dropzone"][data-success]')).toBeVisible();

  await input.setInputFiles({ name: "second-try.png", mimeType: "image/png", buffer: PNG_1PX });

  await expect(page.getByText("Upload failed — try again.")).toBeVisible();
  await expect(page.locator('[data-slot="file-dropzone"][data-success]')).toHaveCount(0);
});

// ── #1216: the "Add background" door is INTERACTIVE COPY, so it takes the readable step ──────────────
// design-audit measured this section's collapsible-trigger label at 10.5px — `voice="kicker"` rides
// `--text-micro` (0.65625rem), which is the FOOTNOTE step. `interactiveKicker` exists for exactly this case
// and states so in its own note in `packages/ui/src/primitives/text/variants.ts`: "a kicker that is itself
// the visible label of a control … interactive copy needs the readable label step (13px) while retaining
// the compact, tracked instrument register of the band it belongs to". The floor is read from the resolved
// `--text-label` token rather than a hardcoded 13, and the assertion is the 11px functional floor, so the
// pin fails on the defect and survives a future retune of the step.
test("#1216: the Add-background trigger's label clears the 11px interactive floor", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceBackgroundSectionStory />);
  await expect(grid(page)).toBeVisible();

  const label = page.getByRole("button", { name: "Add background" }).locator('[data-slot="text"]');
  await expect(label).toBeVisible();
  await expect
    .poll(async (): Promise<number> => await label.evaluate((el: Element): number => Number.parseFloat(getComputedStyle(el).fontSize)))
    .toBeGreaterThanOrEqual(11);
});
