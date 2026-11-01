// A viewer who cannot speak yet meets a forced persona ask: no dismissal, and one way out once a name exists.
import { testId } from "@orb/client/lib";
import { routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { FirstRunPersonaDialogStory } from "./_first-run-persona-stories.tsx";

test("with no persona the first-run ask is forced open: no close control, Escape keeps it, Create waits for a name", async ({ corpus, mount, page }) => {
  const { firstBoot } = corpus;
  if (firstBoot === undefined) {
    throw new Error("The corpus has no first-boot cohort");
  }
  const { settings } = firstBoot.reads;
  await routeTrpc(page, {
    // A fresh server holds no persona, and its settings name none.
    "persona.list": () => [],
    "settings.getUserSettings": () => settings.output,
  });
  await mount<typeof FirstRunPersonaDialogStory>("tests/client/features/persona/anchors/_first-run-persona-stories/FirstRunPersonaDialogStory", {});

  const gate = page.getByRole("dialog", { name: "Who are you in the story?", exact: true });
  await expect(gate).toBeVisible();
  await expect(gate.getByRole("button", { name: /close/iu })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(gate).toBeVisible();

  const create = page.getByTestId(testId("firstRunPersonaCreate"));
  await expect(create).toBeDisabled();
  await gate.getByRole("textbox", { name: "Name", exact: true }).fill("Sarah");
  await expect(create).toBeEnabled();
  await gate.getByRole("textbox", { name: "Name", exact: true }).fill("   ");
  await expect(create).toBeDisabled();
});

test("a refused create says so once: the ask's own sentence, with no second toast from the mutation", async ({ corpus, mount, page }) => {
  const { firstBoot } = corpus;
  if (firstBoot === undefined) {
    throw new Error("The corpus has no first-boot cohort");
  }
  const { settings } = firstBoot.reads;
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, {
    "persona.list": () => [],
    "settings.getUserSettings": () => settings.output,
    ...serveCorpusProcedures(caller, ["persona.create"], ({ input }) => (input.name === "Sarah" ? trpcError() : undefined)),
  });
  await mount<typeof FirstRunPersonaDialogStory>("tests/client/features/persona/anchors/_first-run-persona-stories/FirstRunPersonaDialogStory", {});

  const gate = page.getByRole("dialog", { name: "Who are you in the story?", exact: true });
  await gate.getByRole("textbox", { name: "Name", exact: true }).fill("Sarah");
  await page.getByTestId(testId("firstRunPersonaCreate")).click();

  const alerts = page.getByRole("region", { name: "Alerts", exact: true });
  await expect(alerts.getByText("Couldn't create your persona — try again.", { exact: true })).toBeVisible();
  await expect(alerts.getByText(/^Couldn't create (?:the|your) persona/u)).toHaveCount(1);
});
