// @subject packages/ui/src/primitives/compare-blocks/compare-blocks.tsx
// The state chip on the open field of a rewrite review and the chip on the field's queue row below it are one status pill: the same
// word, tone and paint for a kept field and for a discarded one, and a discarded rewrite is the safe outcome, so it is neutral in both.
// The review is the production refinery surface over a real server's session, and each decision goes through the server's own verb.
import { testId } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Tone } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { REFINERY_KEEP_CLEARING_VERB, REFINERY_KEEP_VERB, REFINERY_REOPEN_VERB } from "#client/features/refinery/lib/refinery-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { RefineryActionGroupsStory } from "./_action-groups-stories.tsx";

const STORY = "tests/client/features/refinery/components/_action-groups-stories/RefineryActionGroupsStory";
const WIDTH = 960;
const NARROW_WIDTH = 300;
const DESCRIPTION = "The original observatory keeper.";
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
async function serveRewriteSession(page: Page, caller: Caller): Promise<Awaited<ReturnType<Caller["refinery"]["startSession"]>>> {
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "chip-voice", name: "Chip voice keeper", description: DESCRIPTION, creatorNotes: NOTES }),
  });
  const session = await caller.refinery.startSession({ characterId: card.id });
  await caller.refinery.updateSession({ sessionId: session.id, patch: { selection: { fields: ["description", "creatorNotes", "greetings"] } } });
  await caller.refinery.submitManualRewrite({
    sessionId: session.id,
    fields: [
      { field: "description", text: REWRITE },
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
