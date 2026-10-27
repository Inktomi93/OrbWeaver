import { testId } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { actionGroupGeometry, resolvedLength } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createServerHarness } from "@orb/testkit/node/composed";
import { DROP_REASON_COPY } from "#client/features/refinery/lib/reason-copy.ts";
import type { RefineryActionGroupsStory } from "./_action-groups-stories.tsx";

const STORY = "tests/client/features/refinery/components/_action-groups-stories/RefineryActionGroupsStory";
const PIN = "The original observatory keeper.";
const LIVE = "The live keeper changed after this session began.";
const REWRITE = "The rewrite preserves a quieter observatory keeper.";
const NOTE = "Creator notes that must survive a discarded clear.";
const GREETING = "Welcome to the observatory.";
const RECONFIRM = "re-confirm which version wins — Keep uses the rewrite, Discard keeps the live text";
const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false, appearance: DEFAULT_APPEARANCE_SETTINGS },
  { name: "narrow desktop enlarged", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "coarse portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "coarse landscape enlarged", width: 844, viewport: { width: 844, height: 390 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });
    test("the complete divergence warning stays readable while decisions and informed apply retain their owners", async ({ mount, page }) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: regime.appearance });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
      const card = await caller.character.create({
        input: createCharacterSchema.parse({
          handle: "diverged-warning",
          name: "Observatory keeper",
          description: PIN,
          creatorNotes: NOTE,
          greetings: [{ text: GREETING }],
        }),
      });
      const session = await caller.refinery.startSession({ characterId: card.id });
      await caller.refinery.updateSession({ sessionId: session.id, patch: { selection: { fields: ["description", "creatorNotes", "greetings"] } } });
      const run = await caller.refinery.submitManualRewrite({
        sessionId: session.id,
        fields: [
          { field: "description", text: REWRITE },
          { field: "creatorNotes", cleared: true },
          { field: "greetings", append: true, text: "A proposed new greeting." },
        ],
      });
      await caller.character.update({ characterId: card.id, input: { description: LIVE } });
      const calls = await routeTrpc(
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
      await mount<typeof RefineryActionGroupsStory>(STORY, { sessionId: session.id, width: regime.width, appearance: regime.appearance });
      const review = page.getByTestId(testId("refineryAcceptReview"));
      await expect(review.getByText(RECONFIRM, { exact: true })).toBeVisible();
      const masthead = page.getByTestId(testId("refineryMasthead"));
      const sessionState = masthead.getByRole("group", { name: "Session state", exact: true });
      const sessionStateGeometry = await actionGroupGeometry(masthead, [sessionState, ...(await sessionState.getByTestId(testId("refineryChip")).all())]);
      await test.info().attach("session-state-bounds", { body: JSON.stringify(sessionStateGeometry), contentType: "application/json" });
      expect(sessionStateGeometry.inlineOverflow).toBeLessThanOrEqual(1);
      for (const label of ["Base — the session pin", "Live — changed under the session", "Rewrite — what Keep applies"]) {
        await expect(review.getByText(label, { exact: true })).toBeVisible();
      }
      for (const text of [PIN, LIVE, REWRITE]) {
        await expect(review.getByText(text, { exact: true })).toBeVisible();
      }
      await review.getByRole("button", { name: "Discard description", exact: true }).click();
      await expect(review.getByRole("button", { name: "Keep (empties field) creatorNotes", exact: true })).toBeVisible();
      await review.getByRole("button", { name: "reopen description", exact: true }).click();
      await review.getByRole("button", { name: "Keep description", exact: true }).click();
      const queued = review.getByTestId(testId("refineryQueueRow")).filter({ hasText: DROP_REASON_COPY.diverged_since_session.chip });
      const queuedWarning = queued.getByTestId(testId("refineryChip")).filter({ hasText: DROP_REASON_COPY.diverged_since_session.chip });
      await queuedWarning.scrollIntoViewIfNeeded();
      const queuedGeometry = await actionGroupGeometry(queued, [queuedWarning]);
      await test.info().attach("queued-divergence-bounds", { body: JSON.stringify(queuedGeometry), contentType: "application/json" });
      expect(queuedGeometry.inlineOverflow).toBeLessThanOrEqual(1);
      await review.getByRole("button", { name: "Discard creatorNotes", exact: true }).click();
      await expect(review.getByText("A new greeting is added at the end — no existing greeting is touched.", { exact: true })).toBeVisible();
      await review.getByRole("button", { name: "Discard greetings [new]", exact: true }).click();
      await expect.poll(async () => (await caller.refinery.getSession({ sessionId: session.id })).rewriteDecisions[run.id]).toEqual([true, false, false]);
      expect((await caller.character.get({ characterId: card.id })).description).toBe(LIVE);
      await review.getByRole("button", { name: "reopen description", exact: true }).click();
      const warning = review.getByText(RECONFIRM, { exact: true });
      const row = warning.locator("..");
      const chip = row.getByTestId(testId("refineryChip"));
      await expect(warning).toBeVisible();
      await expect(chip).toBeVisible();
      await expect(chip).toHaveText(DROP_REASON_COPY.diverged_since_session.chip);
      await warning.scrollIntoViewIfNeeded();
      const floor = await resolvedLength(page, "var(--width-field-floor)", warning);
      const measure = await resolvedLength(page, "var(--reading-measure-prose)", warning);
      const boxes = await warning.evaluate((node) => {
        const parent = node.parentElement;
        if (parent === null) {
          throw new Error("The warning has no owning row");
        }
        return { text: node.getBoundingClientRect().toJSON(), row: parent.getBoundingClientRect().toJSON() };
      });
      await test.info().attach("diverged-warning-bounds", { body: JSON.stringify({ floor, measure, boxes }), contentType: "application/json" });
      expect(boxes.text.width).toBeGreaterThanOrEqual(Math.min(floor, boxes.row.width) - 1);
      expect(boxes.text.width).toBeLessThanOrEqual(measure + 1);
      expect((await actionGroupGeometry(row, [chip])).inlineOverflow).toBeLessThanOrEqual(1);
      await page.screenshot({ path: test.info().outputPath("diverged-warning.png") });
      const apply = page.getByRole("button", { name: "Apply 1 kept", exact: true });
      await apply.click();
      await expect(page.getByTestId(testId("refineryApplyOutcome"))).toBeVisible();
      expect(calls.lastInput("refinery.applyFields")).toMatchObject({ sessionId: session.id, accepts: [{ field: "description", confirmDiverged: true }] });
      const applied = await caller.character.get({ characterId: card.id });
      expect(applied.description).toBe(REWRITE);
      expect(applied.creatorNotes).toBe(NOTE);
      expect(applied.greetings).toEqual(card.greetings);
    });
  });
}
