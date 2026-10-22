import { choiceBlockSchema, presetDetailSchema, userMacroSchema } from "@orb/contracts/preset";
import { expect, test } from "@orb/testkit/node/ct-corpus.ts";
import { routeTrpc, trpcError, trpcHold } from "@orb/testkit/node/route-trpc.ts";
import type { PresetListLifetimeStory } from "./_list-lifetime-stories.tsx";

test.use({ trace: "on" });

test("native nested lists preserve typing and successor bindings, retain own echoes, and close replaced draft editors", async ({
  corpus,
  mount,
  page,
}, testInfo) => {
  const library = corpus.libraryRelations;
  const settings = corpus.reads["settings.getUserSettings"][0]?.output;
  const viewer = corpus.reads["sessions.me"][0]?.output;
  if (library === undefined || settings === undefined || viewer === undefined) {
    throw new Error("The committed corpus omitted the preset owner/library");
  }
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
  let preset = presetDetailSchema.parse({
    ...library.reads.presetDetail.output,
    config: {
      ...library.reads.presetDetail.output.config,
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
  const presetId = preset.id;
  let failSaves = false;
  const trpc = await routeTrpc(page, {
    "settings.getUserSettings": () => settings,
    "sessions.me": () => viewer,
    "preset.get": () => preset,
    "preset.list": () => library.reads.presetList.output,
    "preset.resolveEffective": () => library.reads.presetEffective.output,
    "connection.resolveChatCapability": () => trpcError({ code: "BAD_REQUEST" }),
    "connection.providersAvailable": () => [],
    "connection.list": () => [],
    "preset.update": (input) => {
      if (failSaves) {
        return trpcError();
      }
      preset = presetDetailSchema.parse({ ...preset, config: input.config ?? preset.config });
      return preset;
    },
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

  preset = presetDetailSchema.parse({ ...preset, config: { ...preset.config, params: { ...preset.config.params, temperature: 0.63 } } });
  await component.update({ presetId, revision: 2 });
  await expect(page.getByLabel("Read revision", { exact: true })).toHaveText("2");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[name="userMacros[0].args[0].name"]')).toHaveValue("second_edited");

  preset = presetDetailSchema.parse({ ...preset, config: { ...preset.config, userMacros: [userMacroSchema.parse({ ...macro, name: "remote_macro" })] } });
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
  preset = presetDetailSchema.parse({
    ...preset,
    config: {
      ...preset.config,
      variables: [choiceBlockSchema.parse({ name: "cohort_variable", question: "Remote question", options: [{ label: "Remote option", value: "remote" }] })],
    },
  });
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
  const settings = corpus.reads["settings.getUserSettings"][0]?.output;
  const viewer = corpus.reads["sessions.me"][0]?.output;
  if (library === undefined || settings === undefined || viewer === undefined) {
    throw new Error("The committed corpus omitted the preset owner/library");
  }
  const original = presetDetailSchema.parse(library.reads.presetDetail.output);
  let preset = presetDetailSchema.parse({
    ...original,
    config: {
      ...original.config,
      variables: [choiceBlockSchema.parse({ name: "queued_variable", question: "Choose", options: [{ label: "Original", value: "original" }] })],
    },
  });
  const presetId = preset.id;
  const first = trpcHold<"preset.update">();
  const second = trpcHold<"preset.update">();
  let firstAnswer = preset;
  let secondAnswer = preset;
  let writes = 0;
  const trpc = await routeTrpc(page, {
    "settings.getUserSettings": () => settings,
    "sessions.me": () => viewer,
    "preset.get": () => preset,
    "preset.list": () => library.reads.presetList.output,
    "preset.resolveEffective": () => library.reads.presetEffective.output,
    "connection.resolveChatCapability": () => trpcError({ code: "BAD_REQUEST" }),
    "connection.providersAvailable": () => [],
    "connection.list": () => [],
    "preset.update": (input) => {
      preset = presetDetailSchema.parse({ ...preset, config: input.config ?? preset.config });
      writes += 1;
      if (writes === 1) {
        firstAnswer = preset;
        return first;
      }
      if (writes === 2) {
        secondAnswer = preset;
        return second;
      }
      return preset;
    },
    "preset.resetToDefault": () => {
      preset = original;
      return preset;
    },
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
  preset = presetDetailSchema.parse({
    ...preset,
    config: {
      ...preset.config,
      variables: [
        choiceBlockSchema.parse({ name: "queued_variable", question: "External question", options: [{ label: "External echo", value: "external" }] }),
      ],
    },
  });
  await component.update({ presetId, revision: 1 });
  await expect(page.getByLabel("Read revision", { exact: true })).toHaveText("1");
  await expect(label).toHaveValue("Newer");
  await expect(label).toBeFocused();
  first.release(firstAnswer);
  await second.requested;
  await expect(label).toHaveValue("Newer");
  await expect(page.getByText("Saved", { exact: true })).toHaveCount(0);
  second.release(secondAnswer);
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
