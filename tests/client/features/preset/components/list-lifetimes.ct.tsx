import { choiceBlockSchema, presetDetailSchema, userMacroSchema } from "@orb/contracts/preset";
import { holdServed, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { PresetListLifetimeStory } from "./_list-lifetime-stories.tsx";

test.use({ trace: "on" });

const PRESET_READS = [
  "settings.getUserSettings",
  "sessions.me",
  "preset.get",
  "preset.list",
  "preset.resolveEffective",
  "connection.resolveChatCapability",
  "connection.providersAvailable",
  "connection.list",
  "preset.resetToDefault",
] as const;

type Caller = Awaited<ReturnType<Awaited<ReturnType<typeof createCorpusHarness>>["internalCallerFor"]>>;
type PresetId = Parameters<Caller["preset"]["get"]>[0]["id"];
type PresetConfig = Awaited<ReturnType<Caller["preset"]["get"]>>["config"];

/** Another author's edit, written by the real verb the way a second tab would write it. */
async function editElsewhere(caller: Caller, id: PresetId, edit: (config: PresetConfig) => PresetConfig): Promise<void> {
  const { config } = await caller.preset.get({ id });
  await caller.preset.update({ id, config: edit(config) });
}

test("native nested lists preserve typing and successor bindings, retain own echoes, and close replaced draft editors", async ({
  corpus,
  mount,
  page,
}, testInfo) => {
  const library = corpus.libraryRelations;
  if (library === undefined) {
    throw new Error("The committed corpus omitted the preset library");
  }
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const macro = userMacroSchema.parse({
    name: "cohort_macro",
    body: "{{second}}",
    args: [
      { name: "first", type: "number" },
      { name: "second", type: "string" },
    ],
    inputs: [
      {
        kind: "single-select",
        name: "first_input",
        label: "First question",
        options: [
          { label: "Alpha", value: "a" },
          { label: "Beta", value: "b" },
        ],
      },
      { kind: "multi-select", name: "second_input", label: "Second question", options: [{ label: "Gamma", value: "g" }] },
    ],
  });
  const base = presetDetailSchema.parse(library.reads.presetDetail.output);
  const presetId = base.id;
  await caller.preset.update({
    id: presetId,
    config: {
      ...base.config,
      userMacros: [macro],
      variables: [
        choiceBlockSchema.parse({
          name: "cohort_variable",
          question: "Pick a voice",
          options: [
            { label: "Quiet", value: "q" },
            { label: "Loud", value: "l" },
          ],
        }),
      ],
    },
  });
  let failSaves = false;
  const trpc = await routeTrpc(page, {
    ...serveCorpusProcedures(caller, PRESET_READS),
    ...serveCorpusProcedures(caller, ["preset.update"], () => (failSaves ? trpcError() : undefined)),
  });
  const component = await mount<typeof PresetListLifetimeStory>("tests/client/features/preset/components/_list-lifetime-stories/PresetListLifetimeStory", {
    presetId,
  });
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Data", exact: true }).click();
  await page.getByRole("button", { name: "{{cohort_macro}}", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit macro", exact: true });
  const arg = dialog.locator('input[name="userMacros[0].args[1].name"]');
  await arg.fill("second");
  await arg.press("End");
  await arg.pressSequentially("_edited");
  await expect(arg).toBeFocused();
  await expect(arg).toHaveValue("second_edited");
  await expect.poll(() => arg.evaluate((node: HTMLInputElement) => node.selectionStart)).toBe("second_edited".length);
  await dialog.getByRole("group", { name: "Argument 1", exact: true }).getByRole("button", { name: "Remove", exact: true }).click();
  await expect(dialog.locator('input[name="userMacros[0].args[0].name"]')).toHaveValue("second_edited");
  await expect(dialog.getByRole("button", { name: "Add argument", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Add argument", exact: true }).click();
  await dialog.getByRole("group", { name: "Argument 2", exact: true }).getByRole("textbox", { name: "Name", exact: true }).fill("added_arg");
  await dialog.getByRole("group", { name: "Argument 2", exact: true }).getByRole("button", { name: "Remove", exact: true }).click();

  await dialog
    .getByRole("group", { name: "Macro input 1", exact: true })
    .getByRole("group", { name: "Input option 1", exact: true })
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await expect(dialog.locator('input[name="userMacros[0].inputs[0].options[0].label"]')).toHaveValue("Beta");
  await expect(dialog.getByRole("group", { name: "Macro input 1", exact: true }).getByRole("button", { name: "Add option", exact: true })).toBeFocused();
  await dialog.getByRole("group", { name: "Macro input 1", exact: true }).getByRole("button", { name: "Add option", exact: true }).click();
  await dialog.locator('input[name="userMacros[0].inputs[0].options[1].label"]').fill("Inserted option");
  await dialog
    .getByRole("group", { name: "Macro input 1", exact: true })
    .getByRole("group", { name: "Input option 2", exact: true })
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await dialog.getByRole("combobox", { name: "Kind", exact: true }).first().click();
  await page.getByRole("option", { name: "Toggle — on/off", exact: true }).click();
  await expect(dialog.locator('input[name="userMacros[0].inputs[0].options[0].label"]')).toHaveCount(0);
  await dialog.getByRole("combobox", { name: "Kind", exact: true }).first().click();
  await page.getByRole("option", { name: "Single select — pick one option", exact: true }).click();
  await expect(dialog.locator('input[name="userMacros[0].inputs[0].options[0].label"]')).toHaveValue("Beta");
  await dialog.getByRole("group", { name: "Macro input 1", exact: true }).getByRole("button", { name: "Remove", exact: true }).first().click();
  await expect(dialog.locator('input[name="userMacros[0].inputs[0].name"]')).toHaveValue("second_input");
  await expect(dialog.locator('input[name="userMacros[0].inputs[0].options[0].label"]')).toHaveValue("Gamma");
  await expect(dialog.getByRole("button", { name: "Add input", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Add input", exact: true }).click();
  await dialog.locator('input[name="userMacros[0].inputs[1].name"]').fill("added_input");
  await dialog.getByRole("group", { name: "Macro input 2", exact: true }).getByRole("button", { name: "Remove", exact: true }).first().click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await component.update({ presetId, revision: 1 });
  await expect(page.getByLabel("Read revision", { exact: true })).toHaveText("1");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[name="userMacros[0].args[0].name"]')).toHaveValue("second_edited");
  expect(trpc.lastInput("preset.update")?.config?.userMacros?.[0]?.inputs?.[0]?.name).toBe("second_input");
  expect(trpc.lastInput("preset.update")?.config).not.toHaveProperty("macroRowIds");
  const macroScreenshot = testInfo.outputPath("macro-after-removal-and-echo.png");
  await page.screenshot({ path: macroScreenshot });
  await testInfo.attach("macro-after-removal-and-echo", { path: macroScreenshot });

  await editElsewhere(caller, presetId, (config) => ({ ...config, params: { ...config.params, temperature: 0.63 } }));
  await component.update({ presetId, revision: 2 });
  await expect(page.getByLabel("Read revision", { exact: true })).toHaveText("2");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[name="userMacros[0].args[0].name"]')).toHaveValue("second_edited");

  await editElsewhere(caller, presetId, (config) => ({ ...config, userMacros: [userMacroSchema.parse({ ...macro, name: "remote_macro" })] }));
  await component.update({ presetId, revision: 3 });
  await expect(page.getByLabel("Read revision", { exact: true })).toHaveText("3");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "{{remote_macro}}", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "cohort_variable", exact: true }).click();
  const variable = page.getByRole("dialog", { name: "Edit variable", exact: true });
  await variable.getByRole("group", { name: "Option 1", exact: true }).getByRole("button", { name: "Remove", exact: true }).click();
  const remaining = variable.locator('input[name="variables[0].options[0].label"]');
  await expect(remaining).toHaveValue("Loud");
  await expect(variable.getByRole("button", { name: "Add option", exact: true })).toBeFocused();
  await variable.getByRole("button", { name: "Add option", exact: true }).click();
  await variable.locator('input[name="variables[0].options[1].label"]').fill("Inserted variable option");
  await variable.getByRole("group", { name: "Option 2", exact: true }).getByRole("button", { name: "Remove", exact: true }).click();
  await remaining.press("End");
  await remaining.pressSequentially("er");
  await expect(remaining).toBeFocused();
  await expect(remaining).toHaveValue("Louder");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await component.update({ presetId, revision: 4 });
  await expect(page.getByLabel("Read revision", { exact: true })).toHaveText("4");
  await expect(variable).toBeVisible();

  failSaves = true;
  await remaining.fill("Louder draft");
  await expect(page.getByText("Save failed —", { exact: true })).toBeVisible();
  await component.update({ presetId, mounted: false });
  await component.update({ presetId });
  await page.getByRole("button", { name: "cohort_variable", exact: true }).click();
  await expect(remaining).toHaveValue("Louder draft");
  await expect(page.getByText("Restored draft — not saved", { exact: true })).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toHaveCount(0);
  await variable.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Resume saving", exact: true }).press("Enter");
  await expect(page.getByText("Save failed —", { exact: true })).toBeVisible();
  failSaves = false;
  await page.getByRole("button", { name: "Retry", exact: true }).press("Enter");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(trpc.lastInput("preset.update")?.config?.variables?.[0]?.options[0]?.label).toBe("Louder draft");
  expect(trpc.lastInput("preset.update")?.config).not.toHaveProperty("variableRowIds");
  await component.update({ presetId, revision: 5 });
  await expect(page.getByLabel("Read revision", { exact: true })).toHaveText("5");

  failSaves = true;
  await page.getByRole("button", { name: "cohort_variable", exact: true }).click();
  await remaining.fill("Obsolete draft");
  await expect(page.getByText("Save failed —", { exact: true })).toBeVisible();
  await component.update({ presetId, mounted: false });
  await editElsewhere(caller, presetId, (config) => ({
    ...config,
    variables: [choiceBlockSchema.parse({ name: "cohort_variable", question: "Remote question", options: [{ label: "Remote option", value: "remote" }] })],
  }));
  await component.update({ presetId, runtimeEpoch: 1 });
  await page.getByRole("tab", { name: "Data", exact: true }).click();
  await page.getByRole("button", { name: "cohort_variable", exact: true }).click();
  await expect(remaining).toHaveValue("Remote option");
  const variableScreenshot = testInfo.outputPath("variable-after-stale-draft-refusal.png");
  await page.screenshot({ path: variableScreenshot });
  await testInfo.attach("variable-after-stale-draft-refusal", { path: variableScreenshot });
});

test("pending writes cannot replace newer edits, and explicit reset admits a new usable list owner", async ({ corpus, mount, page }) => {
  const library = corpus.libraryRelations;
  if (library === undefined) {
    throw new Error("The committed corpus omitted the preset library");
  }
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const base = presetDetailSchema.parse(library.reads.presetDetail.output);
  const presetId = base.id;
  await caller.preset.update({
    id: presetId,
    config: {
      ...base.config,
      variables: [choiceBlockSchema.parse({ name: "queued_variable", question: "Choose", options: [{ label: "Original", value: "original" }] })],
    },
  });
  const first = holdServed();
  const second = holdServed();
  let writes = 0;
  const trpc = await routeTrpc(page, {
    ...serveCorpusProcedures(caller, PRESET_READS),
    // The first two writes wait until the test lets the server apply them, in the order the test chooses.
    ...serveCorpusProcedures(caller, ["preset.update"], () => {
      writes += 1;
      if (writes === 1) {
        return first;
      }
      return writes === 2 ? second : undefined;
    }),
  });
  const component = await mount<typeof PresetListLifetimeStory>("tests/client/features/preset/components/_list-lifetime-stories/PresetListLifetimeStory", {
    presetId,
  });
  await page.getByRole("tab", { name: "Data", exact: true }).click();
  await page.getByRole("button", { name: "queued_variable", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit variable", exact: true });
  const label = dialog.locator('input[name="variables[0].options[0].label"]');
  await label.fill("Submitted");
  await first.requested;
  await label.fill("Newer");
  await editElsewhere(caller, presetId, (config) => ({
    ...config,
    variables: [choiceBlockSchema.parse({ name: "queued_variable", question: "External question", options: [{ label: "External echo", value: "external" }] })],
  }));
  await component.update({ presetId, revision: 1 });
  await expect(page.getByLabel("Read revision", { exact: true })).toHaveText("1");
  await expect(label).toHaveValue("Newer");
  await expect(label).toBeFocused();
  first.release();
  await second.requested;
  await expect(label).toHaveValue("Newer");
  await expect(page.getByText("Saved", { exact: true })).toHaveCount(0);
  second.release();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await component.update({ presetId, revision: 2 });
  await expect(page.getByLabel("Read revision", { exact: true })).toHaveText("2");
  await expect(label).toHaveValue("Newer");
  await expect(label).toBeFocused();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Reset to starter arrangement", exact: true }).click();
  await page.getByRole("alertdialog", { name: "Reset to the starter arrangement?", exact: true }).getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByRole("button", { name: "queued_variable", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Add variable", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Question", exact: true }).fill("New owner after reset");
  await expect(dialog.getByRole("textbox", { name: "Question", exact: true })).toBeFocused();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(trpc.lastInput("preset.update")?.config?.variables?.[0]?.question).toBe("New owner after reset");
  expect(trpc.lastInput("preset.update")?.config).not.toHaveProperty("variableRowIds");
});
