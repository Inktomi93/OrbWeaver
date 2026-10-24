// A viewer who cannot speak yet meets a forced persona ask: no dismissal, and one way out once a name exists.
import { testId } from "@orb/client/lib";
import { routeTrpc } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
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
