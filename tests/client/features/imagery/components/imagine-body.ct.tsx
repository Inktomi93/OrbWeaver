// imagine-body CT (interaction-direction-spec.md §7 B5) — the /imagine preview-before-spend surface.
// Free mode: Generate requests chat.generateImage with the typed prompt verbatim. Extraction mode: Preview
// fills the prompt from imagery.extractPrompt, then Generate sends that resolved prompt as free mode. Asserts
// the RECORDED tRPC inputs (routeTrpc is the spy) against the exact seed the story used.

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ImagineExtractStory, ImagineFreeStory } from "../_ct-stories.tsx";

test("imagine free mode: Generate requests chat.generateImage with the verbatim prompt", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  const rec = await routeTrpc(page, { "chat.generateImage": {} });
  const cmp = await mount(<ImagineFreeStory chatId={chatId} />);

  const generate = cmp.getByRole("button", { name: "Generate" });
  await expect(generate).toBeEnabled();
  await generate.click();

  await expect.poll(() => rec.count("chat.generateImage")).toBe(1);
  // ONESHOT-OK: the preceding expect.poll(rec.count).toBe(1) barriers on the call being recorded, so this reads a settled input.
  expect(rec.lastInput("chat.generateImage")).toMatchObject({ mode: "free", prompt: "a dragon over the castle" });
});

test("imagine extraction mode: Preview fills the prompt from extractPrompt, then Generate sends it verbatim", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  const extracted = "a dim tavern, wooden beams, candlelight";
  const rec = await routeTrpc(page, {
    "imagery.extractPrompt": { prompt: extracted, mode: "scenario", source: "extracted", costUsd: 0.001 },
    "chat.generateImage": {},
  });
  const cmp = await mount(<ImagineExtractStory chatId={chatId} />);

  const preview = cmp.getByRole("button", { name: "Preview prompt" });
  await expect(preview).toBeVisible();
  await preview.click();

  const prompt = cmp.getByRole("textbox", { name: "Image prompt" });
  await expect(prompt).toHaveValue(extracted);
  // ONESHOT-OK: toHaveValue(extracted) only passes AFTER extractPrompt resolved and set the prompt, so its input is recorded and settled.
  expect(rec.lastInput("imagery.extractPrompt")).toMatchObject({ mode: "scenario" });

  await cmp.getByRole("button", { name: "Generate" }).click();
  await expect.poll(() => rec.count("chat.generateImage")).toBe(1);
  // A resolved prompt IS the image — sent verbatim as free mode even though the mode strip said "scenario".
  // ONESHOT-OK: the preceding expect.poll(rec.count).toBe(1) barriers on the call being recorded, so this reads a settled input.
  expect(rec.lastInput("chat.generateImage")).toMatchObject({ mode: "free", prompt: extracted });
});
