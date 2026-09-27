// CT: databank's HOME tile (D-7 — "recent documents + an ingest-health line"),
// mounted through the REAL `HomeSurface` over the REAL data layer (routeTrpc-stubbed `databank.list`).
//
// What this pins, beyond "it renders":
//   · the HEALTH LINE is a DERIVATION of the same counts the rows carry — passages embedded OF passages
//     that exist, so a half-embedded bank cannot read as finished;
//   · an aggregate chip appears ONLY for what the rows do not already show, and when it appears it is a
//     CONTROL that scopes the library to that phase and goes there (the store, not a rendered echo);
//   · READY is the ABSENCE of a chip on a row here too (§6.1) — the tile does not re-litigate the ruling;
//   · the EMPTY bank leads with the ingest CEREMONY (the shell modal slot) and drops the "All documents"
//     link rather than promising a list of nothing — while still carrying a DOOR into its own section
//     (the 2026-08-17 rail sweep: every other block on home can be entered, this one could not);
//   · the tile does NOT hide its jump pill — beside the real jump rail, Databank appears in the index like
//     every other section (the 2026-08-08 subsumption ruling, retracted; see the tile's header);
//   · at the NARROWEST real host (390px content) the health chips stay INSIDE the tile card.

import { expect, test } from "@playwright/experimental-ct-react";
import { DatabankHomeTileNarrowStory, DatabankHomeTilePhoneStory, DatabankHomeTileStory, DatabankHomeTileWithJumpGridStory } from "../_ct-stories.tsx";
import { INDEXING_DOC, READY_DOC, stubDatabank } from "../fixtures.ts";

const TILE = '[data-home-tile="databank.documents"]';

// A bank AFTER A BAD REINDEX — the state the aggregates exist for: every non-ready phase populated at two
// digits, far past the four rows the tile renders. (The four-state fixture bank is fully VISIBLE in those
// rows, which is exactly why it must produce no aggregates at all — the test below pins that.)
function crowdedRows(count: number, offset: number, over: Partial<typeof READY_DOC>): readonly (typeof READY_DOC)[] {
  return Array.from({ length: count }, (_, i) => ({ ...READY_DOC, id: `document_${String(offset + i).padStart(20, "0")}`, ...over }));
}

const WEDGED_AGO_MS = 3_600_000;
const CROWDED_BANK = [
  ...crowdedRows(12, 100, { chunkCount: 0, embeddedCount: 0, updatedAt: READY_DOC.updatedAt - WEDGED_AGO_MS }),
  ...crowdedRows(11, 200, { charCount: 0, chunkCount: 0, embeddedCount: 0 }),
  ...crowdedRows(10, 300, { chunkCount: 0, embeddedCount: 0 }),
  ...crowdedRows(13, 400, { chunkCount: 39, embeddedCount: 22 }),
];

test("the health line counts embedded passages OF the passages that exist", async ({ mount, page }) => {
  await stubDatabank(page);
  const home = await mount(<DatabankHomeTileStory />);

  const tile = home.locator(TILE);
  // 12 of 12 + 22 of 39 + 0 + 0. "34 passages indexed" alone would read as a finished count on a bank
  // that is 17 passages short of it.
  await expect(tile.getByText("4 documents · 34 of 51 passages indexed")).toBeVisible();
});

test("no aggregate chip for a phase the ROWS already show — only the rows' own chips render", async ({ mount, page }) => {
  await stubDatabank(page);
  const home = await mount(<DatabankHomeTileStory />);

  const tile = home.locator(TILE);
  await expect(tile.getByText("4 documents · 34 of 51 passages indexed")).toBeVisible();
  // The bank is four documents and the tile renders four rows, so every non-ready phase is already named
  // ON a row. The badges present are therefore exactly the row chips, in list order (READY contributes
  // none) — an aggregate here would be the same fact twice.
  await expect(tile.locator('[data-slot="badge"]')).toHaveText(["Indexing", "Empty", "Stalled"]);
  await expect(tile.getByRole("group", { name: "Ingest attention" })).toHaveCount(0);
});

test("a phase that reaches PAST the rows earns an aggregate, worst first, as a named control", async ({ mount, page }) => {
  await stubDatabank(page, {}, CROWDED_BANK);
  const home = await mount(<DatabankHomeTileWithJumpGridStory />);

  const group = home.locator(TILE).getByRole("group", { name: "Ingest attention" });
  await expect(group.getByRole("button")).toHaveText(["12 stalled", "11 empty", "10 queued", "13 indexing"]);
  // The chip's TEXT is a count; its accessible name has to be the promise, or a screen reader hears a
  // number where a verb belongs.
  await expect(group.getByRole("button", { name: "Show the 12 stalled documents in your databank" })).toBeVisible();
});

test("clicking an aggregate scopes the library to that phase AND goes there — assert the STORES", async ({ mount, page }) => {
  await stubDatabank(page, {}, CROWDED_BANK);
  const home = await mount(<DatabankHomeTileStory />);
  const probe = home.locator("output");
  await expect(probe).toContainText("phase=none");

  await home.locator(TILE).getByRole("button", { name: "Show the 12 stalled documents in your databank" }).click();

  await expect(probe).toContainText("phase=stalled");
  await expect(probe).toContainText("section=databank");
});

test("a READY row carries no phase chip; a non-ready row carries its own, plus a recency stamp", async ({ mount, page }) => {
  await stubDatabank(page);
  const home = await mount(<DatabankHomeTileStory />);

  const tile = home.locator(TILE);
  const ready = tile.getByRole("listitem").filter({ hasText: READY_DOC.name });
  const indexing = tile.getByRole("listitem").filter({ hasText: INDEXING_DOC.name });

  await expect(ready).toContainText("Upload · 24.5 KB · 12 passages");
  await expect(ready.locator('[data-slot="badge"]')).toHaveCount(0);
  await expect(indexing.locator('[data-slot="badge"]')).toHaveText(["Indexing"]);
  // The list is called "Recent documents" — sighted users get the ordering cue too, not just the SR label.
  // The page clock is frozen at the fixtures' own instant, so the newest rows read as "now".
  await expect(ready.locator('[data-slot="list-row-meta"]')).toBeVisible();
});

test("opening a recent document writes BOTH stores — the selection and the section", async ({ mount, page }) => {
  await stubDatabank(page);
  const home = await mount(<DatabankHomeTileStory />);
  const probe = home.locator("output");
  await expect(probe).toContainText("document=none");

  await home.locator(TILE).getByRole("button", { name: READY_DOC.name }).click();

  await expect(probe).toContainText(`document=${READY_DOC.id}`);
  await expect(probe).toContainText("section=databank");
});

test("the trailing action goes to the library — assert the STORE, not a rendered echo", async ({ mount, page }) => {
  await stubDatabank(page);
  const home = await mount(<DatabankHomeTileStory />);
  const probe = home.locator("output");
  await expect(probe).not.toContainText("section=databank");

  await home.locator(TILE).getByRole("button", { name: "All documents" }).click();

  await expect(probe).toContainText("section=databank");
});

test("an EMPTY bank teaches the first step, opens the CEREMONY, and drops the link to nothing", async ({ mount, page }) => {
  await stubDatabank(page, {}, []);
  const home = await mount(<DatabankHomeTileStory />);
  const probe = home.locator("output");

  const tile = home.locator(TILE);
  await expect(tile.getByText("No documents yet")).toBeVisible();
  // No health line, no rows: an empty bank has no passages to report and nothing to be honest about
  // except that it is empty.
  await expect(tile.getByText("documents ·")).toHaveCount(0);
  await expect(tile.getByRole("listitem")).toHaveCount(0);
  // …and no trailing control promising a list of zero documents (P2-b — still true: "All documents" is
  // about a LIST, and there is none).
  await expect(tile.getByRole("button", { name: "All documents" })).toHaveCount(0);

  // The button OPENS THE DIALOG — it used to only move the rail, landing the user on the library's own
  // empty state with the same sentence and the real button under it (P1-2).
  await tile.getByRole("button", { name: "Add your first document" }).click();
  await expect(probe).toContainText("modal=addDocument");
});

// ── RED-FIRST (rail sweep, the IA finding): an empty bank still has a DOOR into its section ──────────
// Every other block on home can be entered; this one could be entered only while it had rows in it, because
// the trailing "All documents" action hides on an empty bank. The ceremony stays the recommended path (it
// is first, and P1-2's ruling that it must open the DIALOG is untouched); the door is the second control,
// and it promises the SECTION rather than a list of nothing.
test("an EMPTY bank still opens its SECTION — the ceremony first, the door beside it", async ({ mount, page }) => {
  await stubDatabank(page, {}, []);
  const home = await mount(<DatabankHomeTileStory />);
  const probe = home.locator("output");
  const tile = home.locator(TILE);
  await expect(probe).not.toContainText("section=databank");

  await tile.getByRole("button", { name: "Open Databank" }).click();

  await expect(probe).toContainText("section=databank");
});

// ── RED-FIRST (rail sweep P3-16): the shelf's peer-rank CTAs share ONE style ─────────────────────────
// Measured: "Start a temp chat" was a 169×34 bordered secondary and "Add your first document" a 171×32
// `px-0` ghost text-link, one column apart, at identical rank. Asserted on the RENDERED box of the two
// controls in the same shelf, so a re-divergence of size OR of border weight reds here.
test("P3-16 the empty bank's CTAs are the shelf's own control register, not a bare text link", async ({ mount, page }) => {
  await stubDatabank(page, {}, []);
  const home = await mount(<DatabankHomeTileStory />);
  const tile = home.locator(TILE);
  // A real bordered control with real inline padding — the `px-0` text link had neither.
  await expect
    .poll(
      async () =>
        (
          await tile.getByRole("button", { name: "Add your first document" }).evaluate((el) => {
            const style = globalThis.getComputedStyle(el);
            return {
              border: Number.parseFloat(style.borderTopWidth),
              padding: Number.parseFloat(style.paddingLeft),
              height: Math.round(el.getBoundingClientRect().height),
            };
          })
        ).border,
    )
    .toBeGreaterThan(0);
  await expect
    .poll(
      async () =>
        (
          await tile.getByRole("button", { name: "Add your first document" }).evaluate((el) => {
            const style = globalThis.getComputedStyle(el);
            return {
              border: Number.parseFloat(style.borderTopWidth),
              padding: Number.parseFloat(style.paddingLeft),
              height: Math.round(el.getBoundingClientRect().height),
            };
          })
        ).padding,
    )
    .toBeGreaterThan(0);
  await expect
    .poll(
      async () =>
        (
          await tile.getByRole("button", { name: "Add your first document" }).evaluate((el) => {
            const style = globalThis.getComputedStyle(el);
            return {
              border: Number.parseFloat(style.borderTopWidth),
              padding: Number.parseFloat(style.paddingLeft),
              height: Math.round(el.getBoundingClientRect().height),
            };
          })
        ).height,
    )
    .toBeGreaterThan(0);
});

// ── RED-FIRST (#102 review F2/F8): the empty rail slot is a RAIL block, not a centred island ────────
// `EmptyState` is right for a CONTENT pane and was a register break here: 442x239px, centred, the only
// centred thing on a page whose every other block is flush-left, 20% of the page height for the one block
// with nothing in it, and its 16px title was the ramp's ONLY use of the title step. This asserts what a
// reader sees — the alignment and the type step — not which primitive was composed.
test("#102-F2 an EMPTY bank keeps the RAIL register: flush-left, no centred island, no 16px title", async ({ mount, page }) => {
  await stubDatabank(page, {}, []);
  const home = await mount(<DatabankHomeTileStory />);
  const tile = home.locator(TILE);

  // Nothing inside the block centres itself — the mock's `.bank` is a left-aligned column.
  await expect
    .poll(
      async () => await tile.evaluate((root) => [...root.querySelectorAll("*")].filter((el) => globalThis.getComputedStyle(el).textAlign === "center").length),
    )
    .toBe(0);

  // The label line shares its left edge with the block's own kicker heading (a centred island did not).
  const label = await tile.getByText("No documents yet").boundingBox();
  const heading = await tile.getByRole("heading", { name: "Databank" }).boundingBox();
  expect(Math.abs((label?.x ?? 0) - (heading?.x ?? 0))).toBeLessThan(2);

  // …and it speaks in the rail's label voice, not the ramp's title step.
  const steps = await tile.getByText("No documents yet").evaluate((el) => {
    const probe = el.ownerDocument.createElement("span");
    probe.style.fontSize = "var(--text-label)";
    el.ownerDocument.body.append(probe);
    const labelStep = globalThis.getComputedStyle(probe).fontSize;
    probe.remove();
    return { resolved: globalThis.getComputedStyle(el).fontSize, labelStep };
  });
  await expect
    .poll(
      async () =>
        (
          await tile.getByText("No documents yet").evaluate((el) => {
            const probe = el.ownerDocument.createElement("span");
            probe.style.fontSize = "var(--text-label)";
            el.ownerDocument.body.append(probe);
            const labelStep = globalThis.getComputedStyle(probe).fontSize;
            probe.remove();
            return { resolved: globalThis.getComputedStyle(el).fontSize, labelStep };
          })
        ).resolved,
    )
    .toBe(steps.labelStep);
});

// ── RED-FIRST (rail sweep, the IA finding): Databank is IN the rail, like every other section ────────
// This pin used to read "the tile SUBSUMES its jump row — Databank is one door on home, not two", and it
// was written (side-eye 2026-08-08 P2-c) when "Elsewhere in the house" was seven FAT TEACHING ROWS, where a
// duplicate row really was a duplicate block. Program #102 replaced those with a wrapping PILL RAIL whose
// whole promise is that every room in the house is one skim away — and Databank was then the ONE section
// missing from it (eight pills for nine sections, measured on the live surface). The `sectionId` MECHANISM
// is untouched; this tile simply no longer claims it. See the tile's own header for the retraction.
test("Databank keeps its pill in the rail — the tile beside it is not a substitute for the index", async ({ mount, page }) => {
  await stubDatabank(page);
  const home = await mount(<DatabankHomeTileWithJumpGridStory />);

  const jump = home.locator('[data-home-tile="home.jump"]');
  // The grid is REAL and derives every section from the registry — including this tile's own.
  await expect(jump.getByRole("button", { name: "Go to Chats" })).toBeVisible();
  await expect(jump.getByRole("button", { name: "Go to Databank" })).toBeVisible();
});

test("on a 360px phone an EMPTY bank's two doors wrap, and both stay inside the card", async ({ mount, page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await stubDatabank(page, {}, []);
  const home = await mount(<DatabankHomeTilePhoneStory />);
  const tile = home.locator(TILE);
  const openDoor = tile.getByRole("button", { name: "Open Databank" });
  const doors = [tile.getByRole("button", { name: "Add your first document" }), openDoor];
  await expect(openDoor).toBeVisible();

  const rightEdges = async (): Promise<readonly boolean[]> => {
    const card = await tile.boundingBox();
    const boxes = await Promise.all(doors.map(async (door) => await door.boundingBox()));
    return boxes.map((box) => box !== null && card !== null && box.x + box.width <= card.x + card.width + 0.5);
  };
  await expect.poll(rightEdges).toEqual([true, true]);
});

test("at the narrowest real host a crowded health line WRAPS — every chip stays inside the card", async ({ mount, page }) => {
  await stubDatabank(page, {}, CROWDED_BANK);
  const home = await mount(<DatabankHomeTileNarrowStory />);

  const tile = home.locator(TILE);
  // Barrier on the SETTLED body first — geometry read while the tile's QueryBoundary is still showing its
  // reserved skeleton measures the skeleton, and `count()` does not auto-wait.
  await expect(tile.getByText("46 documents · 286 of 507 passages indexed")).toBeVisible();
  const chips = tile.locator('[data-slot="badge"]');
  await expect(chips.first()).toHaveText("12 stalled");
  await expect.poll(async () => await tile.boundingBox()).not.toBeNull();
  const card = await tile.boundingBox();
  await expect.poll(async () => await chips.count()).toBeGreaterThan(0);
  const count = await chips.count();
  const boxes = await Promise.all(Array.from({ length: count }, async (_, i) => await chips.nth(i).boundingBox()));
  for (const chip of boxes) {
    expect(chip).not.toBeNull();
    // The right edge of every chip is inside the card's right edge — a wrapped line, never one running off
    // the box. (Planted control: `flex-nowrap` on either health row REDs this; the inner one did, live.)
    expect((chip?.x ?? 0) + (chip?.width ?? 0)).toBeLessThanOrEqual((card?.x ?? 0) + (card?.width ?? 0));
  }
});
