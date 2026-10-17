import "@orb/testkit/node/composed-real.ts";
import { IMAGERY_NEGATIVE_SLOT_ID } from "@orb/contracts/imagery";
import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import { proseOverrideFromLegacy, resolveProseText } from "@orb/contracts/prose";
import { parseUserSettings, resolveImageryCaption, resolveImageryTemplate, USER_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import { generationOf } from "@orb/inference";
import type { CaptionImageDeps, ImageProviderDeps } from "@orb/server/domain/imagery";
import { createCaptionImage, createImageProviderOps, createImageryInstructions } from "@orb/server/domain/imagery";
import { makeGenerationUsage } from "@orb/testkit/iso/generation-usage.ts";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { makeResolved } from "@orb/testkit/node/factories/resolved-connection.ts";
import { makeFakeRoleClients } from "@orb/testkit/node/factories/role-clients.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { vi } from "vitest";

const CAPTION_MODE = "character_multimodal";

test("generation resolution uses the run-as Principal and preserves only imagery warnings without changing accounting", async ({ harness }) => {
  const runAs = await principal(harness, (await harness.actor({ role: "admin" })).id);
  const resolved = makeResolved({ task: "generateImage", ownerId: runAs.userId });
  const resolve = vi.fn<ImageProviderDeps["resolve"]>(() => Promise.resolve({ resolved, warnings: [] }));
  const usage = makeGenerationUsage(0.25);
  const generateImage = vi.fn<ImageProviderDeps["generateImage"]>(() =>
    Promise.resolve({
      images: [{ url: undefined, base64: "pixels", mediaType: undefined }],
      model: resolved.model,
      usage,
      warnings: [
        { code: "image_edit_dropped", message: "edit dropped" },
        { code: "sampling_knob_dropped", message: "sampling dropped" },
      ],
    }),
  );
  const ops = createImageProviderOps({ resolve, generateImage });
  expect(await ops.resolveGenerateImage(runAs)).toEqual({ connection: resolved, capability: generationOf(resolved) });
  expect(resolve).toHaveBeenCalledWith({ task: "generateImage", principal: runAs });
  const request = { connection: resolved, capability: generationOf(resolved), model: resolved.model, prompt: "scene" };
  const result = await ops.generateImage(request);
  expect(generateImage).toHaveBeenCalledWith(request);
  expect(result.usage).toBe(usage);
  expect(result.images).toEqual([{ url: undefined, base64: "pixels", mediaType: undefined }]);
  expect(result.warnings).toEqual([{ code: "image_edit_dropped", detail: "edit dropped" }]);
  generateImage.mockRejectedValue(new Error("funding refusal"));
  await expect(ops.generateImage(request)).rejects.toThrow("funding refusal");
});

test("caption sampling and Utility funding follow run-as, trim replies and preserve absent-item semantics", async ({ harness }) => {
  const runAs = await principal(harness, (await harness.actor()).id);
  const summarize = vi.fn(makeFakeRoleClients().summarize);
  summarize.mockResolvedValue({ items: [{ text: "  caption  ", usage: { tokensIn: null, tokensOut: null, costUsd: 0.5 } }], model: "caption-model" });
  const roleClientsFor = vi.fn<CaptionImageDeps["roleClientsFor"]>(() => Promise.resolve({ summarize }));
  const resolveUtilityPresetParams = vi.fn<CaptionImageDeps["resolveUtilityPresetParams"]>(() => Promise.resolve({ temperature: 0.7 }));
  const caption = createCaptionImage({ roleClientsFor, resolveUtilityPresetParams });
  const bytes = new Uint8Array([1, 2]);
  expect(await caption({ runAs, bytes, mime: "image/png", instruction: "caption instruction" })).toEqual({ text: "caption", costUsd: 0.5 });
  expect(roleClientsFor).toHaveBeenCalledWith(runAs.userId);
  expect(resolveUtilityPresetParams).toHaveBeenCalledWith(runAs.userId);
  expect(summarize).toHaveBeenCalledWith([{ systemPrompt: "caption instruction", userPrompt: "Describe the attached image.", images: [bytes] }], {
    ...SIDE_GEN_POSTURES.caption,
    temperature: 0.7,
  });
  summarize.mockResolvedValue({ items: [], model: "caption-model" });
  expect(await caption({ runAs, bytes, mime: "image/png", instruction: "instruction" })).toEqual({ text: "", costUsd: null });
});

test("imagery overrides and shipped template/caption/prose defaults are resolved from the run-as settings", async ({ harness }) => {
  const runAs = await principal(harness, (await harness.actor()).id);
  let settings = parseUserSettings({});
  const loadUserSettings = vi.fn((_: typeof runAs.userId) => Promise.resolve(settings));
  const ops = createImageryInstructions({ loadUserSettings });
  expect(await ops.resolvePromptTemplate(runAs, "character")).toBe(resolveImageryTemplate(settings.imagery, "character"));
  expect(await ops.resolveCaptionInstruction(runAs, "character_multimodal")).toBe(resolveImageryCaption(settings.imagery, "character_multimodal"));
  expect(await ops.resolveNegativeBase(runAs)).toBe(resolveProseText(IMAGERY_NEGATIVE_SLOT_ID, settings.prose));
  settings = parseUserSettings({
    schemaVersion: USER_SETTINGS_SCHEMA_VERSION,
    imagery: { templates: { character: "custom template" }, captions: { [CAPTION_MODE]: "custom caption" } },
    prose: { [IMAGERY_NEGATIVE_SLOT_ID]: proseOverrideFromLegacy("custom negative") },
  });
  expect(await ops.resolvePromptTemplate(runAs, "character")).toBe("custom template");
  expect(await ops.resolveCaptionInstruction(runAs, "character_multimodal")).toBe("custom caption");
  expect(await ops.resolveNegativeBase(runAs)).toBe("custom negative");
  expect(loadUserSettings.mock.calls.every(([userId]) => userId === runAs.userId)).toBe(true);
});
