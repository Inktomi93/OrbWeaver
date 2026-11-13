// A viewer who cannot speak yet meets a forced persona ask: no dismissal, and one way out once a name exists.
import { testId } from "@orb/client/lib";
import { ALERTS_REGION_NAME, holdServed, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import {
  PERSONA_FIRST_RUN_CREATE_NAME,
  PERSONA_FIRST_RUN_FAILED,
  PERSONA_FIRST_RUN_TITLE,
  PERSONA_NAME_FIELD_NAME,
} from "#client/features/persona/lib/persona-copy.ts";
import { DIALOG_PENDING_VERBS } from "#client/lib/dialog-verbs.ts";
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

  const gate = page.getByRole("dialog", { name: PERSONA_FIRST_RUN_TITLE, exact: true });
  await expect(gate).toBeVisible();
  await expect(gate.getByRole("button", { name: /close/iu })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(gate).toBeVisible();

  const create = page.getByTestId(testId("firstRunPersonaCreate"));
  await expect(create).toBeDisabled();
  // No persona exists yet, so the submit offers to create one rather than to finish a half-done setup.
  await expect(create).toHaveAccessibleName(PERSONA_FIRST_RUN_CREATE_NAME);
  await gate.getByRole("textbox", { name: PERSONA_NAME_FIELD_NAME, exact: true }).fill("Sarah");
  await expect(create).toBeEnabled();
  await gate.getByRole("textbox", { name: PERSONA_NAME_FIELD_NAME, exact: true }).fill("   ");
  await expect(create).toBeDisabled();
});

test("a persona no pointer names reopens the ask on its recovery arm, which offers to finish rather than create", async ({ corpus, mount, page }) => {
  const { firstBoot } = corpus;
  if (firstBoot === undefined) {
    throw new Error("The corpus has no first-boot cohort");
  }
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  if ((await caller.persona.list()).length === 0) {
    throw new Error("The corpus viewer has no persona");
  }
  await routeTrpc(page, {
    // The create landed and the seed write did not: a persona exists and the settings still name none.
    ...serveCorpusProcedures(caller, ["persona.list"]),
    "settings.getUserSettings": () => firstBoot.reads.settings.output,
  });
  await mount<typeof FirstRunPersonaDialogStory>("tests/client/features/persona/anchors/_first-run-persona-stories/FirstRunPersonaDialogStory", {});

  const gate = page.getByRole("dialog", { name: PERSONA_FIRST_RUN_TITLE, exact: true });
  await expect(gate.getByRole("textbox", { name: PERSONA_NAME_FIELD_NAME, exact: true })).not.toHaveValue("");
  // Pinned by its words: the two arms' verbs come from one copy module, so a test reading them back would pass a swap.
  // eslint-disable-next-line orb/no-hand-copied-label -- the literal is the pin; importing the constant would follow a swap.
  await expect(page.getByTestId(testId("firstRunPersonaCreate"))).toHaveAccessibleName("Finish setting up");
});

test("a create in flight says so, and a refused one is said by the ask's own sentence", async ({ corpus, mount, page }) => {
  const { firstBoot } = corpus;
  if (firstBoot === undefined) {
    throw new Error("The corpus has no first-boot cohort");
  }
  const { settings } = firstBoot.reads;
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const hold = holdServed();
  await routeTrpc(page, {
    "persona.list": () => [],
    "settings.getUserSettings": () => settings.output,
    ...serveCorpusProcedures(caller, ["persona.create"], ({ input }) => (input.name === "Sarah" ? hold : undefined)),
  });
  await mount<typeof FirstRunPersonaDialogStory>("tests/client/features/persona/anchors/_first-run-persona-stories/FirstRunPersonaDialogStory", {});

  const gate = page.getByRole("dialog", { name: PERSONA_FIRST_RUN_TITLE, exact: true });
  await gate.getByRole("textbox", { name: PERSONA_NAME_FIELD_NAME, exact: true }).fill("Sarah");
  const create = page.getByTestId(testId("firstRunPersonaCreate"));
  await create.click();
  await hold.requested;
  await expect(create).toHaveAccessibleName(DIALOG_PENDING_VERBS.creating);
  hold.fail();

  const alerts = page.getByRole("region", { name: ALERTS_REGION_NAME, exact: true });
  await expect(alerts.getByText(PERSONA_FIRST_RUN_FAILED, { exact: true })).toBeVisible();
});
