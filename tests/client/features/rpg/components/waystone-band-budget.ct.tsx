// @subject packages/client/src/features/rpg/components/rpg-takeover-header.tsx
// The Waystone head band on the production room shell. The chrome above the tab viewport (header row, band, game rail) is
// measured as a share of the context pane against the D119a budget, in the ambient-set and ambient-unset cases at the
// reference geometry, on a small desktop window, and at the font scales where the satellite row and date line leave the
// band. The band's own height is a whole CSS pixel in every case (integer-line-boxes §1). A second pair of cells reads the
// stone's size on both sides of the context pane step, which `packages/ui/src/tokens/tokens.json` describes. Follows
// `waystone-populated-band.ct.tsx` for the room mount and `platform-text-scale.suite.ct.tsx` for the app font scale; the scale
// is the appearance setting, because the satellite row leaves the band on that setting and not on the root property alone.

import { contextToggleLabel } from "@orb/client/lib";
import { rpgTrackerDefSchema } from "@orb/contracts/rpg";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { ChatId } from "@orb/kit/ids";
import { resolvedLength, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Page, PlaywrightTestArgs } from "@playwright/test";
import { SATELLITES_TO_BODY_FONT_SCALE } from "#client/features/rpg/lib/context-layout.ts";
import type { RpgRoomStory } from "./_own-key-panels-stories.tsx";

const STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgRoomStory";
const POOL = rpgTrackerDefSchema.parse({ key: "resolve", label: "Resolve", shape: "meter", write: "delta", subject: "actor", max: 10, pinned: true });
const POOL_VALUE = 3;
const WALLET = { name: "Gold", amount: 40 } as const;
const LOCATION = "The Gilded Lantern, upper floor";

// D119a (docs/adr/0119-on-an-engaged-game-chat-the-rpg-waystone.md): the chrome's share of the context pane.
const D119A_CHROME_SHARE = {
  compactMax: 0.3,
  setMax: 0.45,
  bothBelow: 0.5,
} as const;
// The app's top font scale (the appearance schema's upper bound).
const TOP_FONT_SCALE = 1.5;
// 30vw of 1600 is the 30rem pane of D119a's reference; 1024x768 is the small desktop window.
const REFERENCE = { width: 1600, height: 900 } as const;
const SMALL_DESKTOP = { width: 1024, height: 768 } as const;
// 30vw of 1280 is exactly the context pane step; 1440 is a pane wider than it.
const AT_PANE_STEP = { width: 1280, height: 800 } as const;
const PAST_PANE_STEP = { width: 1440, height: 800 } as const;
// Device pixels per CSS pixel is 1 in this host, so a whole pixel is a whole CSS pixel.
const WHOLE_PIXEL_TOLERANCE = 0.01;

interface Cell {
  readonly name: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly fontScale: number;
  readonly set: boolean;
}

const BUDGET_CELLS: readonly Cell[] = [
  { name: "ambient set at the reference geometry", viewport: REFERENCE, fontScale: 1, set: true },
  { name: "ambient unset at the reference geometry", viewport: REFERENCE, fontScale: 1, set: false },
  { name: "ambient unset on a small desktop window", viewport: SMALL_DESKTOP, fontScale: 1, set: false },
  { name: "ambient set at the top font scale on a small desktop window", viewport: SMALL_DESKTOP, fontScale: TOP_FONT_SCALE, set: true },
  { name: "ambient set at the body-home font scale at the reference geometry", viewport: REFERENCE, fontScale: SATELLITES_TO_BODY_FONT_SCALE, set: true },
  { name: "ambient set at the body-home font scale on a small desktop window", viewport: SMALL_DESKTOP, fontScale: SATELLITES_TO_BODY_FONT_SCALE, set: true },
];

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

async function prepareRoom(root: Root, cell: Cell): Promise<ChatId> {
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: { ...DEFAULT_APPEARANCE_SETTINGS, fontScale: cell.fontScale } });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
  const chatId = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  await seedRpgGame(root, { principal: await root.principalFor(root.ownerId), chatId, mode: "lite", ruleset: "d20" });
  const config = await caller.rpg.getConfigView({ chatId });
  await caller.rpg.updateConfig({ chatId, patch: { dateMode: "narrated", trackers: [...config.trackers, POOL] } });
  expect(
    await caller.rpg.patchActor({
      chatId,
      targetRef: { kind: "user", userId: root.ownerId },
      ops: [
        { op: "setTracker", key: POOL.key, value: { value: POOL_VALUE } },
        { op: "setWalletAmount", ...WALLET },
      ],
    }),
  ).toEqual({ ok: true });
  expect(
    await caller.rpg.editSnapshot({
      chatId,
      patch: cell.set
        ? { location: LOCATION, calendarDate: "3rd of Frostmoon", clock: { day: 4, hour: 21, minute: 40 }, weather: { type: "rain", label: "Steady rain" } }
        : { location: "", calendarDate: null, clock: null, weather: null },
    }),
  ).toEqual({ ok: true });
  return chatId;
}

/** Mounts the room for a cell, opens the context pane and waits for the band's stone. */
async function openBand(
  cell: Cell,
  { corpus, mount, page }: Pick<PlaywrightTestArgs, "mount" | "page"> & { corpus: Parameters<typeof createShellAmbientReads>[0] },
  root: Root,
): Promise<void> {
  const chatId = await prepareRoom(root, cell);
  const caller = await root.internalCallerFor(root.ownerId);
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed" } } });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [
      ...SECTION_PROCEDURES,
      ...ROOM_PROCEDURES,
      "rpg.getGame",
      "rpg.getTrackerView",
      "rpg.revealHidden",
      "rpg.listTurnToolCalls",
    ]),
  });
  await mount<typeof RpgRoomStory>(STORY, { chatId });
  await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  await expect(page.locator('[data-slot="rpg-takeover-header"] [data-slot="waystone"]')).toBeVisible();
}

for (const cell of BUDGET_CELLS) {
  test.describe(cell.name, () => {
    test.use({ viewport: cell.viewport });

    test("the chrome stays inside the D119a budget and the band is a whole number of pixels tall", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      await openBand(cell, { corpus, mount, page }, root);
      const header = page.locator('[data-slot="rpg-takeover-header"]');
      // The satellite row and the date line leave the band for the tab body at the top font scale, so the cell measures the band that scale leaves.
      const inBand = cell.fontScale < SATELLITES_TO_BODY_FONT_SCALE ? 1 : 0;
      await expect(header.locator('[data-slot="ring-gauge-label"]')).toHaveCount(inBand);
      await expect(header.locator('[data-slot="coin-figure-label"]')).toHaveCount(inBand);
      await expect(header.locator('[data-slot="rpg-band-when-context"]')).toHaveCount(cell.set ? inBand : 0);
      await expect(page.locator('[data-slot="rpg-band-when-context"]')).toHaveCount(cell.set ? 1 : 0);

      const report = await page.locator('[data-slot="context-bracket"]').evaluate((bracket) => {
        const pane = bracket.closest(".shell-panel");
        const band = bracket.querySelector('[data-slot="context-bracket-band"]');
        if (pane === null || band === null) {
          throw new Error("the context bracket has no pane or band");
        }
        // Chrome is every bracket child but the tab viewport's panels.
        const chrome = [...bracket.children]
          .filter((child) => child.getAttribute("data-slot") !== "tabs-panel")
          .reduce((sum, child) => sum + child.getBoundingClientRect().height, 0);
        const paneHeight = pane.getBoundingClientRect().height;
        return { paneHeight, chrome, band: band.getBoundingClientRect().height };
      });
      const share = report.chrome / report.paneHeight;
      expect(share).toBeLessThan(D119A_CHROME_SHARE.bothBelow);
      expect(share).toBeLessThanOrEqual(cell.set ? D119A_CHROME_SHARE.setMax : D119A_CHROME_SHARE.compactMax);
      expect(Math.abs(report.band - Math.round(report.band))).toBeLessThanOrEqual(WHOLE_PIXEL_TOLERANCE);
    });
  });
}

// The stone's container is the context region, the pane less its inline border; the focal step paints where that region is
// at least the pane step wide.
const STEP_CELLS = [
  { cell: { name: "a pane exactly the context pane step wide", viewport: AT_PANE_STEP, fontScale: 1, set: true }, focal: false },
  { cell: { name: "a pane wider than the context pane step", viewport: PAST_PANE_STEP, fontScale: 1, set: true }, focal: true },
] as const satisfies readonly { readonly cell: Cell; readonly focal: boolean }[];

for (const { cell, focal } of STEP_CELLS) {
  test.describe(cell.name, () => {
    test.use({ viewport: cell.viewport });

    test("the stone paints the focal step only where the context region reaches the step", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      await openBand(cell, { corpus, mount, page }, root);
      const step = await resolvedLength(page, `var(${TOKENS["dimension.panel-context-step"].cssVar})`);
      const focalSize = await resolvedLength(page, `var(${TOKENS["size.meter-hero"].cssVar})`);
      const nextSize = await resolvedLength(page, `var(${TOKENS["size.meter-lg"].cssVar})`);
      const measured = await readStone(page);
      expect(measured.region >= step).toBe(focal);
      expect(measured.stone).toBe(focal ? focalSize : nextSize);
    });
  });
}

/** The stone's height and the width of the context region that the stone's container query reads. */
function readStone(page: Page): Promise<{ readonly stone: number; readonly region: number }> {
  return page.locator('[data-slot="waystone"]').evaluate((stone) => {
    const region = stone.closest(".shell-region-fill");
    if (region === null) {
      throw new Error("the stone has no context region above it");
    }
    return { stone: stone.getBoundingClientRect().height, region: region.getBoundingClientRect().width };
  });
}
