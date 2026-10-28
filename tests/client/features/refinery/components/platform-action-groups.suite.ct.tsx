import { createCharacterSchema } from "@orb/contracts/character";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { actionGroupGeometry, resolvedLength } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createServerHarness } from "@orb/testkit/node/composed";
import { DROP_REASON_COPY } from "../../../../../packages/client/src/features/refinery/lib/reason-copy.ts";
import type { RefineryActionGroupsStory } from "./_action-groups-stories.tsx";

const STORY = "tests/client/features/refinery/components/_action-groups-stories/RefineryActionGroupsStory";
const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop enlarged", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone landscape enlarged", width: 844, viewport: { width: 844, height: 390 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });
    test("queue keeps cleared-field consent and diverged status contained while preserving decisions", async ({ mount, page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const card = await caller.character.create({
        input: createCharacterSchema.parse({
          handle: "queue-subject",
          name: "Queue subject",
          description: "The session pin.",
          postHistoryInstructions: "Keep this instruction.",
          creatorNotes: "The original notes.",
        }),
      });
      const session = await caller.refinery.startSession({ characterId: card.id });
      await caller.refinery.updateSession({
        sessionId: session.id,
        patch: { selection: { fields: ["description", "postHistoryInstructions", "creatorNotes"] } },
      });
      const run = await caller.refinery.submitManualRewrite({
        sessionId: session.id,
        fields: [
          { field: "description", text: "The hand-authored description." },
          { field: "postHistoryInstructions", cleared: true },
          { field: "creatorNotes", text: "The revised notes." },
        ],
      });
      await caller.character.update({ characterId: card.id, input: { postHistoryInstructions: "The live instruction changed after the pin." } });
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
        ]),
      );
      await mount<typeof RefineryActionGroupsStory>(STORY, { sessionId: session.id, width: regime.width, appearance: regime.appearance });
      const keep = page.getByRole("button", { name: "Keep (empties field) postHistoryInstructions", exact: true });
      const discard = page.getByRole("button", { name: "Discard postHistoryInstructions", exact: true });
      const opener = page.getByRole("button", { name: "postHistoryInstructions — show this change", exact: true });
      const row = keep.locator("..");
      await expect(row.getByText(DROP_REASON_COPY.diverged_since_session.chip, { exact: true })).toBeVisible();
      const geometry = await actionGroupGeometry(row, [opener, discard, keep]);
      await testInfo.attach("actual-refinery-queue-boxes", { body: JSON.stringify(geometry), contentType: "application/json" });
      expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
      expect(
        (await actionGroupGeometry(page.getByRole("group", { name: "Refinery action host", exact: true }), [opener, discard, keep])).inlineOverflow,
      ).toBeLessThanOrEqual(1);
      const floor = await resolvedLength(page, "var(--size-control-sm)", row);
      for (const box of geometry.controls) {
        expect(box.height).toBeGreaterThanOrEqual(floor);
      }
      await discard.focus();
      await page.keyboard.press("Tab");
      await expect(keep).toBeFocused();
      await page.keyboard.press("Enter");
      const reopen = page.getByRole("button", { name: "reopen postHistoryInstructions", exact: true });
      await expect(reopen).toBeVisible();
      expect((await actionGroupGeometry(reopen.locator(".."), [opener, reopen])).inlineOverflow).toBeLessThanOrEqual(1);
      await expect.poll(async () => (await caller.refinery.getSession({ sessionId: session.id })).rewriteDecisions[run.id]).toEqual([null, true]);
      await reopen.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: "postHistoryInstructions", exact: true })).toBeVisible();
      await expect(page.getByText("The live instruction changed after the pin.", { exact: true })).toBeVisible();
      await expect(keep).toHaveAttribute("aria-pressed", "true");
      expect((await caller.character.get({ characterId: card.id })).postHistoryInstructions).toBe("The live instruction changed after the pin.");
    });
  });
}
