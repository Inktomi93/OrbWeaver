// @subject packages/client/src/features/config/surfaces/config-content-surface.tsx
// @subject packages/client/src/features/config/components/theme-css-field.tsx
// Settings → Appearance holds its boxes from the frame a section shows its controls: no section changes width, position or height after
// that, at a desktop and a phone width. The Theme builder's advanced tools hold the box for the code editor from the frame its heading
// shows, so the Looks section does not grow when the editor arrives. The surface is the production settings content over a corpus root.

import { LAYOUT_SUBPIXEL_PX } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { APPEARANCE_AVATARS_SUBCATEGORY } from "#client/features/chat/lib/appearance-avatars-model.ts";
import { APPEARANCE_MESSAGE_DETAILS_SUBCATEGORY } from "#client/features/chat/lib/appearance-message-details-model.ts";
import { APPEARANCE_MESSAGE_STYLE_SUBCATEGORY } from "#client/features/chat/lib/appearance-message-style-model.ts";
import { APPEARANCE_LOOKS_SUBCATEGORY } from "#client/features/config/lib/appearance-looks-nav.ts";
import { CONFIG_ADVANCED_THEME_TOOLS_NAME, CONFIG_CUSTOM_CSS_NAME, CONFIG_NEW_THEME_LEAD } from "#client/features/config/lib/config-control-names.ts";
import type { FirstBootStory } from "./_first-boot-stories.tsx";

const STORY = "tests/client/features/config/surfaces/_first-boot-stories/FirstBootStory";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "settings.listThemes",
  "settings.getAppSettingsWithOverrides",
  "connection.list",
  "connection.listBindings",
  "connection.providersAvailable",
  "credentials.list",
  "admin.listUsers",
  "workloads.list",
  "workloads.listSchedules",
  "share.signInMode",
  "share.status",
  "preset.list",
  "search.spaceStatus",
] as const;
// Frames watched after a section is ready: long enough for a lazy chunk or a late read to land on a loaded box.
const WATCHED_FRAMES = 120;
const FRAME_CAP = 900;
const APPEARANCE_SECTIONS = [
  APPEARANCE_LOOKS_SUBCATEGORY.label,
  APPEARANCE_MESSAGE_STYLE_SUBCATEGORY.label,
  APPEARANCE_AVATARS_SUBCATEGORY.label,
  APPEARANCE_MESSAGE_DETAILS_SUBCATEGORY.label,
] as const;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One frame's reading of a section: its box, and whether it has shown what marks it ready. */
interface Reading {
  readonly box: Box | null;
  readonly ready: boolean;
}

/** A section named by its heading, ready once it holds a control or, when `heading` is given, a heading of that name. */
interface Tracker {
  readonly section: string;
  readonly heading: string | null;
}

/** Each tracked section's reading on the next frame. */
async function readNextFrame(page: Page, trackers: readonly Tracker[]): Promise<readonly Reading[]> {
  return await page.evaluate(
    (tracked) =>
      new Promise<Reading[]>((resolve) => {
        requestAnimationFrame(() => {
          const headings = [...document.querySelectorAll('[data-slot="config-content"] section > h3')];
          resolve(
            tracked.map(({ section, heading }) => {
              const node = headings.find((found) => found.textContent === section)?.parentElement ?? null;
              const rect = node?.getBoundingClientRect() ?? null;
              const marked =
                heading === null
                  ? (node?.querySelector("input, textarea, button, [role=switch], [role=combobox]") ?? null) !== null
                  : [...(node?.querySelectorAll("h3") ?? [])].some((found) => found.textContent === heading);
              return { box: rect === null ? null : { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, ready: marked };
            }),
          );
        });
      }),
    trackers,
  );
}

/** Each section's boxes on the frames from its first ready frame, until every one has been watched for `WATCHED_FRAMES` frames. */
async function watchSections(page: Page, trackers: readonly Tracker[]): Promise<ReadonlyMap<string, readonly (Box | null)[]>> {
  const watched = new Map<string, (Box | null)[]>(trackers.map(({ section }) => [section, []]));
  for (let frame = 0; frame < FRAME_CAP; frame += 1) {
    const readings = await readNextFrame(page, trackers);
    for (const [index, { section }] of trackers.entries()) {
      const reading = readings[index];
      if (reading !== undefined && (reading.ready || (watched.get(section)?.length ?? 0) > 0)) {
        watched.get(section)?.push(reading.box);
      }
    }
    if ([...watched.values()].every((boxes) => boxes.length >= WATCHED_FRAMES)) {
      break;
    }
  }
  return watched;
}

/** How far a watched box moved from the box it had on its first ready frame, and the two boxes the most distant pair of frames held. */
interface Drift {
  readonly px: number;
  readonly first: Box | null;
  readonly last: Box | null;
}

function drift(boxes: readonly (Box | null)[]): Drift {
  const [first = null] = boxes;
  const moved = (box: Box | null): number =>
    first === null || box === null
      ? Number.POSITIVE_INFINITY
      : Math.max(Math.abs(box.x - first.x), Math.abs(box.y - first.y), Math.abs(box.width - first.width), Math.abs(box.height - first.height));
  const farthest = boxes.reduce<Box | null>((far, box) => (moved(box) > moved(far) ? box : far), first);
  return { px: moved(farthest), first, last: farthest };
}

const WIDTH_CLASSES = [
  { name: "desktop", phone: false, width: 900 },
  { name: "phone", phone: true, width: 390 },
] as const;

for (const widthClass of WIDTH_CLASSES) {
  test.describe(`${widthClass.name} appearance`, () => {
    if (widthClass.phone) {
      test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    }

    test("each appearance section holds its box from the frame it shows its controls", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), READS));
      await mount<typeof FirstBootStory>(STORY, { group: "appearance", phone: widthClass.phone, width: widthClass.width });
      const watched = await watchSections(
        page,
        APPEARANCE_SECTIONS.map((section) => ({ section, heading: null })),
      );
      for (const section of APPEARANCE_SECTIONS) {
        const boxes = watched.get(section) ?? [];
        expect(boxes.length, `${section} never showed its controls`).toBeGreaterThanOrEqual(WATCHED_FRAMES);
        const settled = drift(boxes);
        expect(settled.px, `${section} moved or resized after it was ready: ${JSON.stringify(settled)}`).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
      }
    });

    test("the theme builder's advanced tools hold the code editor's box from the frame their heading shows", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), READS));
      await mount<typeof FirstBootStory>(STORY, { group: "appearance", phone: widthClass.phone, width: widthClass.width });
      await page.getByRole("button", { name: new RegExp(`^${RegExp.escape(CONFIG_NEW_THEME_LEAD)}`, "u") }).click();
      await page.getByRole("button", { name: CONFIG_ADVANCED_THEME_TOOLS_NAME, exact: true }).click();
      const watched = await watchSections(page, [{ section: APPEARANCE_LOOKS_SUBCATEGORY.label, heading: CONFIG_CUSTOM_CSS_NAME }]);
      const boxes = watched.get(APPEARANCE_LOOKS_SUBCATEGORY.label) ?? [];
      expect(boxes.length, "the advanced tools never showed their heading").toBeGreaterThanOrEqual(WATCHED_FRAMES);
      const settled = drift(boxes);
      expect(settled.px, `the Looks section grew or moved after the advanced tools showed: ${JSON.stringify(settled)}`).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
    });
  });
}
