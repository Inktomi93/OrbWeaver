// @subject packages/client/src/features/refinery/components/apply-row.tsx
// A Refinery result has one primary control. While the apply outcome is on screen its exit is the step's finishing
// act, and the apply row under it stays usable without competing for the same emphasis. The workbench is the
// production refinery surface over a real server's session, and the copy goes through the server's own verb.
import { testId } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { auditSurface } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import { REFINERY_KEEP_VERB, REFINERY_SAVE_AS_COPY_NAME, refineryApplyKeptLabel } from "#client/features/refinery/lib/refinery-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { RefineryActionGroupsStory } from "./_action-groups-stories.tsx";

const STORY = "tests/client/features/refinery/components/_action-groups-stories/RefineryActionGroupsStory";
const WIDTH = 960;

test("a copy result with a kept field still to apply shows one primary control", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "one-primary", name: "One primary keeper", description: "The original observatory keeper." }),
  });
  const session = await caller.refinery.startSession({ characterId: card.id });
  await caller.refinery.updateSession({ sessionId: session.id, patch: { selection: { fields: ["description"] } } });
  await caller.refinery.submitManualRewrite({
    sessionId: session.id,
    fields: [{ field: "description", text: "The rewrite preserves a quieter observatory keeper." }],
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
      "refinery.applyAsCopy",
    ]),
  );
  await mount<typeof RefineryActionGroupsStory>(STORY, { sessionId: session.id, width: WIDTH, appearance: DEFAULT_APPEARANCE_SETTINGS });
  const content = page.getByTestId(testId("refineryContent"));
  await content
    .getByTestId(testId("refineryAcceptReview"))
    .getByRole("button", { name: new RegExp(`^${RegExp.escape(REFINERY_KEEP_VERB)} `, "u") })
    .click();
  const apply = content.getByRole("button", { name: refineryApplyKeptLabel(1), exact: true });
  const done = content.getByRole("button", { name: DIALOG_VERBS.done, exact: true });

  // Before the copy the apply row's commit is the one primary control, so the audit below can see a primary there.
  await expect(apply).toBeEnabled();
  await expect(apply).toHaveAttribute("data-cta", "");

  await content.getByRole("button", { name: REFINERY_SAVE_AS_COPY_NAME, exact: true }).click();
  const outcome = page.getByTestId(testId("refineryApplyOutcome"));
  await expect(outcome).toBeVisible();
  // A copy leaves the live card alone, so the kept field is still there to apply.
  await expect(apply).toBeEnabled();
  await expect(done).toHaveAttribute("data-cta", "");
  const report = await auditSurface({
    name: "refinery copy result",
    scope: page.locator("body"),
    state: "loaded",
    witnesses: [outcome, done, apply],
    checks: ["density"],
  });
  expect(report.density.filter(({ rule }) => rule === "second-primary")).toEqual([]);
});
