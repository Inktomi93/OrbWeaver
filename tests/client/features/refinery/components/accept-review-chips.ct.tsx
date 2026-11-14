// @subject packages/ui/src/primitives/compare-blocks/compare-blocks.tsx
// The state chip on the open field of a rewrite review and the chip on the field's queue row below it are one status pill: the same
// word, tone and paint for a kept field and for a discarded one, and a discarded rewrite is the safe outcome, so it is neutral in both.
// The review is the production refinery surface over a real server's session, and each decision goes through the server's own verb.
// The review's own geometry holds at desktop, in a narrow pane at enlarged text and on a phone with touch at enlarged text: the before and
// after panels are tinted and draw no box inside the result, and the open field's chip and verbs stay inside their block.
import { testId } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { readSurfaceDesignAudit } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Tone } from "@orb/ui/tokens";
import type { Locator, Page, PlaywrightTestArgs } from "@playwright/test";
import { REFINERY_KEEP_CLEARING_VERB, REFINERY_KEEP_VERB, REFINERY_REOPEN_VERB } from "#client/features/refinery/lib/refinery-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { RefineryActionGroupsStory } from "./_action-groups-stories.tsx";

const STORY = "tests/client/features/refinery/components/_action-groups-stories/RefineryActionGroupsStory";
const WIDTH = 960;
const NARROW_WIDTH = 300;
const DESCRIPTION = "The original observatory keeper.";
const LONG_DESCRIPTION =
  "The original observatory keeper tends the great brass telescope through every long winter night. She keeps a ledger of every star that crosses the meridian, and she has done so for forty years without a single missed entry, though her eyes have dimmed.";
const LONG_REWRITE =
  "The rewrite preserves a quieter observatory keeper who tends the great brass telescope through every long winter night. She keeps a careful ledger of each star that crosses the meridian, and she has done so for four decades without missing an entry.";
const NOTES = "Creator notes the rewrite clears.";
const REWRITE = "The rewrite preserves a quieter observatory keeper.";
const NEUTRAL = "neutral" satisfies Tone;
const CHIP_PAINT = ["background-color", "color", "border-top-color", "font-size", "font-weight", "text-transform", "letter-spacing"] as const;

interface Chip {
  readonly word: string;
  readonly tone: string | null;
  readonly paint: readonly string[];
}

/** What a chip says and how it is painted, read as the browser resolved it. */
async function readChip(chip: Locator): Promise<Chip> {
  await expect(chip).toBeVisible();
  return chip.evaluate(
    (node, properties) => ({
      word: node.textContent.trim(),
      tone: node.getAttribute("data-tone"),
      paint: properties.map((property) => getComputedStyle(node).getPropertyValue(property)),
    }),
    CHIP_PAINT,
  );
}

type Caller = Awaited<ReturnType<Awaited<ReturnType<typeof createServerHarness>>["internalCallerFor"]>>;

/** A session whose manual rewrite replaces the description, clears the creator notes and appends a greeting, served to the page. */
async function serveRewriteSession(
  page: Page,
  caller: Caller,
  texts: { readonly description: string; readonly rewrite: string } = { description: DESCRIPTION, rewrite: REWRITE },
): Promise<Awaited<ReturnType<Caller["refinery"]["startSession"]>>> {
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "chip-voice", name: "Chip voice keeper", description: texts.description, creatorNotes: NOTES }),
  });
  const session = await caller.refinery.startSession({ characterId: card.id });
  await caller.refinery.updateSession({ sessionId: session.id, patch: { selection: { fields: ["description", "creatorNotes", "greetings"] } } });
  await caller.refinery.submitManualRewrite({
    sessionId: session.id,
    fields: [
      { field: "description", text: texts.rewrite },
      { field: "creatorNotes", cleared: true },
      { field: "greetings", append: true, text: "A proposed new greeting." },
    ],
  });
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "refinery.getSession",
      "character.get",
      "refinery.listRuns",
      "refinery.preflight",
      "refinery.decideRewrite",
      "refinery.applyFields",
    ]),
  );
  return session;
}

test("the open field's state chip and its queue row's chip read the same for a kept field and a discarded one", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const session = await serveRewriteSession(page, caller);
  await mount<typeof RefineryActionGroupsStory>(STORY, { sessionId: session.id, width: WIDTH, appearance: DEFAULT_APPEARANCE_SETTINGS });
  const review = page.getByTestId(testId("refineryAcceptReview"));
  const discards = review.getByRole("button", { name: new RegExp(`^${RegExp.escape(DIALOG_VERBS.discard)} `, "u") });
  await expect(discards.first()).toBeVisible();
  const labels = (await discards.allTextContents()).map((text) => text.replace(new RegExp(`^${RegExp.escape(DIALOG_VERBS.discard)} `, "u"), ""));
  const notesLabel = (
    (await review.getByRole("button", { name: new RegExp(`^${RegExp.escape(REFINERY_KEEP_CLEARING_VERB)} `, "u") }).textContent()) ?? ""
  ).replace(new RegExp(`^${RegExp.escape(REFINERY_KEEP_CLEARING_VERB)} `, "u"), "");
  const greetingLabel = labels.find((label) => label.includes("greeting")) ?? "";
  const descriptionLabel = labels.find((label) => label !== notesLabel && label !== greetingLabel) ?? "";

  await review.getByRole("button", { name: `${REFINERY_KEEP_VERB} ${descriptionLabel}`, exact: true }).click();
  await review.getByRole("button", { name: `${DIALOG_VERBS.discard} ${notesLabel}`, exact: true }).click();
  const island = review.locator('[data-slot="compare-block-state"]');
  const undecidedIsland = await readChip(island);
  const queuedKept = await readChip(review.locator('[data-queue-state="kept"] [data-slot="badge"]'));
  const queuedDiscarded = await readChip(review.locator('[data-queue-state="discarded"] [data-slot="badge"]'));

  await review.getByRole("button", { name: `${REFINERY_REOPEN_VERB} ${descriptionLabel}`, exact: true }).click();
  const openKept = await readChip(island);
  await review.getByRole("button", { name: `${REFINERY_REOPEN_VERB} ${notesLabel}`, exact: true }).click();
  const openDiscarded = await readChip(island);

  expect(openKept).toEqual(queuedKept);
  expect(openDiscarded).toEqual(queuedDiscarded);
  expect(openDiscarded.tone).toBe(NEUTRAL);
  expect(queuedDiscarded.tone).toBe(NEUTRAL);
  expect(new Set([queuedKept.tone, queuedDiscarded.tone, undecidedIsland.tone]).size).toBe(3);
});

test("the open row keeps its field name whole beside its chip in a narrow pane at enlarged text", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: ENLARGED_APPEARANCE_SETTINGS });
  const session = await serveRewriteSession(page, caller);
  await mount<typeof RefineryActionGroupsStory>(STORY, { sessionId: session.id, width: NARROW_WIDTH, appearance: ENLARGED_APPEARANCE_SETTINGS });
  const review = page.getByTestId(testId("refineryAcceptReview"));
  const openRow = review.locator('[data-queue-state="open"]');
  await expect(openRow.locator('[data-slot="badge"]')).toBeVisible();
  const name = openRow.locator('[data-slot="text"]').first();
  await expect(name).toBeVisible();
  const [chip, host, clip] = await Promise.all([
    openRow.locator('[data-slot="badge"]').boundingBox(),
    review.boundingBox(),
    name.evaluate((text) => ({ textWidth: text.scrollWidth, boxWidth: text.clientWidth })),
  ]);
  if (chip === null || host === null) {
    throw new Error("The open row's chip and the review must paint");
  }
  expect(clip.textWidth, "the name is not clipped").toBeLessThanOrEqual(clip.boxWidth);
  expect(chip.x + chip.width, "the chip stays inside the review").toBeLessThanOrEqual(host.x + host.width + 1);
});

const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;
const DESKTOP_VIEWPORT = { width: 1280, height: 900 } as const;
const TRANSPARENT = "rgba(0, 0, 0, 0)";
const NO_EDGE = ["0px", "0px", "0px", "0px"];

interface Regime {
  readonly name: string;
  readonly width: number;
  readonly enlarged: boolean;
  readonly coarse: boolean;
  readonly viewport: { readonly width: number; readonly height: number };
  /** Whether the open queue row's chip no longer fits beside the field name, so it wraps to its own line. */
  readonly chipWraps: boolean;
}

const REGIMES: readonly Regime[] = [
  { name: "desktop", width: WIDTH, enlarged: false, coarse: false, viewport: DESKTOP_VIEWPORT, chipWraps: false },
  { name: "a narrow pane at enlarged text", width: NARROW_WIDTH, enlarged: true, coarse: false, viewport: DESKTOP_VIEWPORT, chipWraps: true },
  {
    name: "a phone with touch at enlarged text",
    width: PHONE_WIDTH,
    enlarged: true,
    coarse: true,
    viewport: { width: PHONE_WIDTH, height: PHONE_HEIGHT },
    chipWraps: true,
  },
];

/** Serves the rewrite session, mounts the production workbench in the regime's pane and returns the accept review. */
async function openReview(
  { mount, page }: { readonly mount: PlaywrightTestArgs["mount"]; readonly page: Page },
  caller: Caller,
  regime: Regime,
  texts?: { readonly description: string; readonly rewrite: string },
): Promise<Locator> {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
  const appearance = regime.enlarged ? ENLARGED_APPEARANCE_SETTINGS : DEFAULT_APPEARANCE_SETTINGS;
  if (regime.enlarged) {
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: ENLARGED_APPEARANCE_SETTINGS });
  }
  const session = await serveRewriteSession(page, caller, texts);
  await mount<typeof RefineryActionGroupsStory>(STORY, { sessionId: session.id, width: regime.width, appearance });
  return page.getByTestId(testId("refineryAcceptReview"));
}

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ hasTouch: regime.coarse, isMobile: regime.coarse, viewport: regime.viewport });

    test("the before and after panels are tinted, not boxed, inside the result", async ({ mount, page }) => {
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const review = await openReview({ mount, page }, caller, regime, { description: LONG_DESCRIPTION, rewrite: LONG_REWRITE });
      const panels = review.locator('[data-slot="compare-block-before"], [data-slot="compare-block-after"]');
      await expect(panels).toHaveCount(2);
      const painted = await panels.evaluateAll((nodes) =>
        nodes.map((node) => {
          const style = getComputedStyle(node);
          return { edges: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth], fill: style.backgroundColor };
        }),
      );
      for (const panel of painted) {
        expect(panel.edges, "a panel draws no edge of its own").toEqual(NO_EDGE);
        expect(panel.fill, "a panel is a tint, so the side still reads apart from the card").not.toBe(TRANSPARENT);
      }
      const audited = await readSurfaceDesignAudit(page);
      expect(
        audited.audit.findings.filter(({ rule, selector }) => rule === "nested-card" && selector.includes("compare-block")),
        "the design audit finds no card inside the result card",
      ).toEqual([]);
    });

    test("the cleared and added state panels draw no box inside the result", async ({ mount, page }) => {
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const review = await openReview({ mount, page }, caller, regime);
      const verbs = review.locator('[data-slot="compare-block-verbs"]');
      await verbs.getByRole("button").first().click();
      const cleared = review.locator('[data-slot="compare-block-cleared"]');
      await expect(cleared).toBeVisible();
      const clearedAudit = await readSurfaceDesignAudit(page);
      await verbs.getByRole("button").first().click();
      const added = review.locator('[data-slot="compare-block-added"]');
      await expect(added).toBeVisible();
      const addedAudit = await readSurfaceDesignAudit(page);
      for (const audited of [clearedAudit, addedAudit]) {
        expect(
          audited.audit.findings.filter(({ rule, selector }) => rule === "nested-card" && selector.includes("compare-block")),
          "the design audit finds no card inside the result card",
        ).toEqual([]);
      }
    });

    test("the open field's state chip stays whole inside its block", async ({ mount, page }) => {
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const review = await openReview({ mount, page }, caller, regime);
      const block = review.locator('[data-slot="compare-block"]');
      const chip = block.locator('[data-slot="compare-block-state"]');
      await expect(chip).toBeVisible();
      const [blockBox, chipBox, clip] = await Promise.all([
        block.boundingBox(),
        chip.boundingBox(),
        chip.evaluate((node) => ({ textWidth: node.scrollWidth, boxWidth: node.clientWidth })),
      ]);
      if (blockBox === null || chipBox === null) {
        throw new Error("The open field's block and its state chip must paint");
      }
      expect(clip.textWidth, "the chip's words are not clipped").toBeLessThanOrEqual(clip.boxWidth);
      expect(chipBox.x, "the chip starts inside the block").toBeGreaterThanOrEqual(blockBox.x);
      expect(chipBox.x + chipBox.width, "the chip ends inside the block").toBeLessThanOrEqual(blockBox.x + blockBox.width + 1);
    });

    test("the open field's verbs stay inside its block when the field clears", async ({ mount, page }) => {
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const review = await openReview({ mount, page }, caller, regime);
      const verbs = review.locator('[data-slot="compare-block-verbs"]');
      await verbs.getByRole("button").first().click();
      await expect(verbs.getByRole("button", { name: new RegExp(`^${RegExp.escape(REFINERY_KEEP_CLEARING_VERB)} `, "u") })).toBeVisible();
      const buttons = verbs.getByRole("button");
      await expect(buttons).toHaveCount(2);
      const block = review.locator('[data-slot="compare-block"]');
      const blockBox = await block.boundingBox();
      if (blockBox === null) {
        throw new Error("The open field's block must paint");
      }
      for (const button of await buttons.all()) {
        const box = await button.boundingBox();
        if (box === null) {
          throw new Error("Each verb must paint");
        }
        expect(box.x + box.width, "the verb ends inside the block").toBeLessThanOrEqual(blockBox.x + blockBox.width + 1);
      }
    });

    test(
      regime.chipWraps
        ? "the open row's chip wraps under its name from the row's left edge, level with the other rows' field names"
        : "the open row's chip sits beside its name",
      async ({ mount, page }) => {
        await using root = await createServerHarness({ startJobs: false });
        const caller = await root.internalCallerFor(root.ownerId);
        const review = await openReview({ mount, page }, caller, regime);
        const openRow = review.locator('[data-queue-state="open"]');
        const chip = openRow.locator('[data-slot="badge"]');
        await expect(chip).toBeVisible();
        const name = openRow.locator('[data-slot="text"]').first();
        const siblingName = review.locator('[data-queue-state="undecided"]').first().getByRole("button").first();
        const [chipBox, nameBox, rowBox, siblingBox] = await Promise.all([
          chip.boundingBox(),
          name.boundingBox(),
          openRow.boundingBox(),
          siblingName.boundingBox(),
        ]);
        if (chipBox === null || nameBox === null || rowBox === null || siblingBox === null) {
          throw new Error("The open row, its name, its chip and a sibling's name must paint");
        }
        const below = chipBox.y >= nameBox.y + nameBox.height - 1;
        expect(below, "the chip wraps below the name exactly when it no longer fits beside it").toBe(regime.chipWraps);
        expect(Math.round(chipBox.x) === Math.round(rowBox.x), "a wrapped chip starts on the row's left edge, a chip beside the name does not").toBe(
          regime.chipWraps,
        );
        expect(Math.round(chipBox.x) === Math.round(siblingBox.x), "and a wrapped chip shares the left edge of every other row's field name").toBe(
          regime.chipWraps,
        );
      },
    );
  });
}
