// HOME COLUMN BALANCE — Home is two columns only where the shelf can reflow, and there its columns end level.
// The split and the shelf's own reflow grids share one container step (`pairWide`); below it Home is one
// column, hearth first. Measured with the roster library a new account is seeded with, for a full and a fresh house.

import type { RosterPresetSummary } from "@orb/contracts/roster-preset";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { SEED_MANIFEST } from "@orb/default-content";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { characterListResponder, makeCharacterSummary } from "../../character/fixtures.ts";
import { CHAT_ROOM_ROUTES, chatListResponder, makeChatSummary } from "../../chat/fixtures.ts";
import { READY_DOC, stubDatabank } from "../../databank/fixtures.ts";
import { HomeBalanceStory } from "../_ct-stories.tsx";

/** A full house: each tile's own read limit, the tallest page the shipped registry can render. */
const ROOMS = Array.from({ length: 8 }, (_unused, index) =>
  makeChatSummary({
    id: `chat_balance_${String(index)}`,
    lastMessageAt: 1_750_000_000_000 - index,
    participantNames: ["Wren"],
    title: `Room ${String(index)}`,
    updatedAt: 1_750_000_000_000 - index,
  }),
);
const FACES = Array.from({ length: 6 }, (_unused, index) => makeCharacterSummary({ id: `character_balance_${String(index)}`, name: `Face ${String(index)}` }));
const BANK = {
  items: Array.from({ length: 4 }, (_unused, index) => ({ ...READY_DOC, id: `document_0000000000000000000${String(index)}`, name: `Doc ${String(index)}` })),
  nextCursor: null,
  totalCount: 4,
};
const HEALTH = { byPhase: { embedding: 0, empty: 0, indexing: 0, ready: 4, stalled: 0 }, chunks: 48, passages: 48, total: 4 };
const EMPTY_BANK = { items: [], nextCursor: null, totalCount: 0 };
const EMPTY_HEALTH = { byPhase: { embedding: 0, empty: 0, indexing: 0, ready: 0, stalled: 0 }, chunks: 0, passages: 0, total: 0 };

/** The roster library every new account is seeded with, so the Rosters tile renders the rows a real house shows.
 *  An empty library drops the tile and hides the height it adds to its column. */
const SEEDED_ROSTERS: readonly RosterPresetSummary[] = SEED_MANIFEST.flatMap((item) =>
  item.kind === "rosterPreset"
    ? [
        {
          id: mintTypeId(ID_PREFIX.rosterPreset),
          name: item.name,
          description: item.description,
          characterCount: item.characters.length,
          members: item.characters.map((handle, position) => ({
            characterId: mintTypeId(ID_PREFIX.character),
            position,
            talkativeness: null,
            disabled: false,
            name: handle,
            avatarHash: null,
          })),
          anchorPersonaId: null,
          hasGroupConfig: false,
          game: item.startsGame ? { ruleset: "d20" as const } : null,
          rules: [],
          updatedAt: 1,
        },
      ]
    : [],
);

/** The desktop shell's rail (`--dimension-rail`); home declares both panels unavailable, so pane = viewport − rail. */
const RAIL_PX = 56;
const WIDTHS = [1280, 1440, 1920, 2560] as const;

/** The appearance points, named as `tooling/src/_shared/appearance-presets.json` names them. Only the two axes
 *  that move Home's geometry are set: `fontScale` rescales every rem from the root, `density` swaps the spacing tokens. */
const ARMS = [
  { name: "defaults", fontScale: 1, density: "comfortable" },
  { name: "reading", fontScale: 1.25, density: "comfortable" },
  { name: "compact", fontScale: 1, density: "compact" },
] as const;

/** A block's worth of breathing room: below it the shorter column's tail stops reading as unfinished. */
const VOID_BUDGET_PX = 120;
/** The balance must come from reflow, not from pouring the slack into the gaps between blocks. */
const AIR_GAP_BUDGET_PX = 160;

const CELLS = WIDTHS.flatMap((width) => ARMS.map((arm) => ({ width, arm })));

interface ColumnMetrics {
  readonly contentBottom: number;
  readonly maxGap: number;
  /** `id:height` per block, in paint order — says which block a cell's air is in. */
  readonly blocks: string;
}
interface BalanceMetrics {
  readonly hearth: ColumnMetrics;
  readonly shelf: ColumnMetrics;
  readonly void: number;
  readonly airGap: number;
  /** Tracks the Home split resolved to. */
  readonly gridTracks: number;
  /** Tracks the shelf's foot resolved to: two means the shelf has the width to reflow. */
  readonly footTracks: number;
}
type Cell = (typeof CELLS)[number] & { readonly metrics: BalanceMetrics };

function trackCount(el: Element | null): number {
  // The computed value is single-space-separated px lengths (a regex literal cannot be serialized into the page).
  return el === null ? 0 : globalThis.getComputedStyle(el).gridTemplateColumns.trim().split(" ").length;
}

/** Reads both columns out of the rendered grid: the hearth is its first child, the shelf carries `data-home-shelf`. */
function measure(page: Page): Promise<BalanceMetrics> {
  return page.locator("[data-home-grid]").evaluate((grid): BalanceMetrics => {
    const tracks = (el: Element | null): number => (el === null ? 0 : globalThis.getComputedStyle(el).gridTemplateColumns.trim().split(" ").length);
    const read = (column: Element | null): ColumnMetrics => {
      const children = [...(column?.children ?? [])]
        .map((child) => ({ rect: child.getBoundingClientRect(), id: child.getAttribute("data-home-tile") ?? child.tagName.toLowerCase() }))
        .filter((entry) => entry.rect.height > 0);
      const sorted = [...children].sort((a, b) => a.rect.top - b.rect.top);
      const gaps = sorted.slice(1).map((entry, index) => entry.rect.top - (sorted[index]?.rect.bottom ?? entry.rect.top));
      return {
        contentBottom: Math.max(...sorted.map((entry) => entry.rect.bottom), 0),
        maxGap: Math.max(...gaps, 0),
        blocks: sorted.map((entry) => `${entry.id}:${entry.rect.height.toFixed(0)}`).join(","),
      };
    };
    const hearth = read(grid.firstElementChild);
    const shelf = read(grid.querySelector("[data-home-shelf]"));
    return {
      hearth,
      shelf,
      void: Math.abs(hearth.contentBottom - shelf.contentBottom),
      airGap: Math.max(hearth.maxGap, shelf.maxGap),
      gridTracks: tracks(grid),
      footTracks: tracks(grid.querySelector("[data-home-shelf-foot]")),
    };
  });
}

async function setArm(page: Page, arm: (typeof ARMS)[number]): Promise<void> {
  await page.evaluate(
    ({ scale, density }) => {
      document.documentElement.style.setProperty("--font-scale", String(scale));
      document.querySelector("[data-home-pane]")?.setAttribute("data-density", density);
    },
    { scale: arm.fontScale, density: arm.density },
  );
}

async function setPane(page: Page, pane: number): Promise<void> {
  await page.evaluate((inline) => {
    (document.querySelector("[data-home-pane]") as HTMLElement | null)?.style.setProperty("inline-size", `${String(inline)}px`);
  }, pane);
}

interface House {
  readonly rooms: typeof ROOMS;
  readonly bank: typeof BANK;
  readonly health: typeof HEALTH;
}

async function routeHouse(page: Page, house: House): Promise<void> {
  await page.setViewportSize({ width: 2560, height: 1000 });
  await stubDatabank(page, {
    "chat.listChats": chatListResponder(house.rooms),
    "chat.getChat": CHAT_ROOM_ROUTES["chat.getChat"],
    "chat.reapTemporaryChats": { reaped: 0 },
    "character.list": characterListResponder(FACES),
    "databank.bankHealth": house.health,
    "databank.list": house.bank,
    "rosterPreset.list": [...SEEDED_ROSTERS],
    "automation.listRulePresets": [],
    "settings.getUserSettings": { config: DEFAULT_USER_SETTINGS, configUnreadable: null, schemaVersion: 1, updatedAt: 0, userId: "user_ct_balance" },
  });
}

/** Drives the mounted page through every cell. Each cell mutates the same live page and settles before its read. */
async function measureMatrix(page: Page): Promise<Cell[]> {
  const cells: Cell[] = [];
  for (const { width, arm } of CELLS) {
    await setArm(page, arm);
    await setPane(page, width - RAIL_PX);
    cells.push({ width, arm, metrics: await measure(page) });
  }
  return cells;
}

/** Every cell's failures: the split must follow the shelf's reflow step, and a two-column cell ends level. */
function balanceFailures(cells: readonly Cell[]): string[] {
  return cells.flatMap(({ width, arm, metrics }) => {
    const state = `${String(width)}/${arm.name}`;
    return [
      ...(metrics.gridTracks === metrics.footTracks
        ? []
        : [`${state}: Home has ${String(metrics.gridTracks)} column(s) but the shelf's foot has ${String(metrics.footTracks)} track(s)`]),
      ...(metrics.gridTracks === 2 && metrics.void > VOID_BUDGET_PX
        ? [`${state}: the columns end ${metrics.void.toFixed(0)}px apart (budget ${String(VOID_BUDGET_PX)})`]
        : []),
      ...(metrics.airGap > AIR_GAP_BUDGET_PX
        ? [`${state}: a ${metrics.airGap.toFixed(0)}px gap opened between two blocks (budget ${String(AIR_GAP_BUDGET_PX)})`]
        : []),
    ];
  });
}

/** The whole matrix, printed on pass as well as fail, as the before/after table. */
function printMatrix(title: string, cells: readonly Cell[]): void {
  const rows = cells.map(({ width, arm, metrics }) => {
    const short = metrics.hearth.contentBottom < metrics.shelf.contentBottom ? "hearth" : "shelf";
    return `${String(width)}\t${arm.name}\tcolumns=${String(metrics.gridTracks)}\thearth=${metrics.hearth.contentBottom.toFixed(0)}\tshelf=${metrics.shelf.contentBottom.toFixed(0)}\tvoid=${metrics.void.toFixed(0)}\tshort=${short}\tairGap=${metrics.airGap.toFixed(0)}\tfootTracks=${String(metrics.footTracks)}\thearthBlocks=[${metrics.hearth.blocks}]\tshelfBlocks=[${metrics.shelf.blocks}]`;
  });
  console.info(`\n${title}\n${rows.join("\n")}\n`);
}

test("a full house is two level columns wherever the shelf can reflow, and one column below that step", async ({ mount, page }) => {
  await routeHouse(page, { rooms: ROOMS, bank: BANK, health: HEALTH });
  const home = await mount(<HomeBalanceStory />);
  // Settled, never merely "not busy": barrier on content from every tile that reads.
  const grid = home.locator("[data-home-grid]");
  await expect(grid.locator('[data-home-hearth="chat_balance_0"]')).toBeVisible();
  await expect(grid.getByRole("list", { name: "Character quick-picks" })).toBeVisible();
  await expect(grid.locator('[data-home-tile="rosterPreset.rosters"]')).toBeVisible();
  await expect(grid.getByText("Doc 0", { exact: true })).toBeVisible();
  await expect(grid.locator("[aria-busy]")).toHaveCount(0);

  const cells = await measureMatrix(page);
  printMatrix("home column balance — full house, seeded roster library", cells);
  const failures = balanceFailures(cells);
  expect(failures, failures.join("\n")).toEqual([]);
});

// A fresh house: no room to resume, the seeded faces and rosters, an empty bank. "Start with" sits in the hearth.
test("a house with no rooms is two level columns wherever the shelf can reflow, and one column below that step", async ({ mount, page }) => {
  await routeHouse(page, { rooms: [], bank: EMPTY_BANK, health: EMPTY_HEALTH });
  const home = await mount(<HomeBalanceStory />);
  const grid = home.locator("[data-home-grid]");
  await expect(grid.getByRole("list", { name: "Character quick-picks" })).toBeVisible();
  await expect(grid.locator('[data-home-tile="rosterPreset.rosters"]')).toBeVisible();
  await expect(grid.locator('[data-home-tile="databank.documents"]')).toBeVisible();
  await expect(grid.locator("[aria-busy]")).toHaveCount(0);

  const cells = await measureMatrix(page);
  printMatrix("home column balance — fresh house, seeded roster library", cells);
  const failures = balanceFailures(cells);
  expect(failures, failures.join("\n")).toEqual([]);
});

// The switch point is the shelf's own reflow step: a container inline size of 100rem, in each appearance's own
// rem. One pixel below it Home is one column with the hearth first; at it, two.
test("Home turns two columns exactly at the shelf's reflow step, in each appearance's own rem", async ({ mount, page }) => {
  await routeHouse(page, { rooms: ROOMS, bank: BANK, health: HEALTH });
  const home = await mount(<HomeBalanceStory />);
  const grid = home.locator("[data-home-grid]");
  await expect(grid.locator("[aria-busy]")).toHaveCount(0);

  for (const arm of ARMS) {
    await setArm(page, arm);
    // The pane's width at which the query container is exactly 100rem wide, read from the rendered page.
    const stepPane = await grid.evaluate((el) => {
      let container: Element | null = el.parentElement;
      while (container !== null && globalThis.getComputedStyle(container).containerType === "normal") {
        container = container.parentElement;
      }
      const pane = document.querySelector("[data-home-pane]");
      if (container === null || pane === null) {
        throw new Error("no query container around the Home grid");
      }
      const rem = Number.parseFloat(globalThis.getComputedStyle(document.documentElement).fontSize);
      return 100 * rem + (pane.getBoundingClientRect().width - container.getBoundingClientRect().width);
    });
    await setPane(page, Math.floor(stepPane) - 1);
    const below = await grid.evaluate((el) => ({
      tracks: globalThis.getComputedStyle(el).gridTemplateColumns.trim().split(" ").length,
      hearthFirst: (el.firstElementChild?.getBoundingClientRect().bottom ?? 0) <= (el.querySelector("[data-home-shelf]")?.getBoundingClientRect().top ?? 0),
    }));
    await setPane(page, Math.ceil(stepPane));
    const at = await grid.evaluate(trackCount);
    expect({ arm: arm.name, below, at }).toEqual({ arm: arm.name, below: { tracks: 1, hearthFirst: true }, at: 2 });
  }
});
