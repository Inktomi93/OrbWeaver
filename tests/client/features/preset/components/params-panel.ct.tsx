// CT: the ParamsPanel Output-axis additions (retro #7). Proves the panel renders the RESOLVED CAPS line
// (model window + max output), exposes the NEW `maxContextTokens` field alongside `maxOutputTokens`, and
// that both fields CLAMP to the capability ceilings — a typed overflow is pinned to the model's max on
// commit (Base UI NumberField clamps to `max` on blur), not persisted as the overflow value.

import { expect, test } from "@playwright/experimental-ct-react";
import { ParamsPanelOutputStory } from "./_params-panel-stories";

const WINDOW_CAP_RE = /Model context window: 32768 tokens/;
const OUTPUT_CAP_RE = /max output: 8192 tokens/;
const OUT_VALUE_RE = /out=8192/;
const CTX_VALUE_RE = /ctx=32768/;

test("Output axis renders the resolved caps line + both token fields", async ({ mount }) => {
  const panel = await mount(<ParamsPanelOutputStory />);

  // The resolved caps line (window 32768 · output 8192) — the de-hardcoded ceilings the fields clamp against.
  await expect(panel.getByText(WINDOW_CAP_RE)).toBeVisible();
  await expect(panel.getByText(OUTPUT_CAP_RE)).toBeVisible();

  // Both fields present — the pre-existing max-output AND the NEW max-context.
  await expect(panel.getByLabel("Max output tokens", { exact: true })).toBeVisible();
  await expect(panel.getByLabel("Max context tokens", { exact: true })).toBeVisible();
});

test("maxOutputTokens clamps a typed overflow to the model's output cap (8192)", async ({ mount }) => {
  const panel = await mount(<ParamsPanelOutputStory />);
  const field = panel.getByLabel("Max output tokens", { exact: true });

  await field.fill("999999");
  await field.blur();

  // Base UI clamps the committed value to `max` — the field shows the cap, not the overflow.
  await expect(field).toHaveValue("8,192");

  // And the clamped value is what the form holds (not the typed overflow).
  await panel.getByRole("button", { name: "read values" }).click();
  await expect(panel.getByText(OUT_VALUE_RE)).toBeVisible();
});

test("maxContextTokens clamps a typed overflow to the model window (32768)", async ({ mount }) => {
  const panel = await mount(<ParamsPanelOutputStory />);
  const field = panel.getByLabel("Max context tokens", { exact: true });

  await field.fill("999999");
  await field.blur();

  await expect(field).toHaveValue("32,768");
  await panel.getByRole("button", { name: "read values" }).click();
  await expect(panel.getByText(CTX_VALUE_RE)).toBeVisible();
});
