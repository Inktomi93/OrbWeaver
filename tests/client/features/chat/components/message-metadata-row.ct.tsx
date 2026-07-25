// CT: the per-message METADATA row (WS3, D44 §12.1). The behavior is a two-factor gate on EACH datum —
// its own visibility toggle AND the datum actually being present on the MessageView — plus the
// render-nothing floor (no empty <Row> shell) and the `·` separators only BETWEEN present items. These
// pins drive the toggle×presence matrix, not "a row renders": a toggle-on/datum-absent case must stay
// empty, and a datum-present/toggle-off case must stay empty. Timestamps live in the name row (a sibling
// component), so they never appear here even when `showTimestamps` is on.

import { expect, test } from "@playwright/experimental-ct-react";
import type { MessageMetadataVisibility } from "../../../../../packages/client/src/features/chat/components/message-metadata-row";
import { MessageMetadataRowStory } from "../_ct-stories";

const ALL_OFF: MessageMetadataVisibility = {
  showTimestamps: false,
  showMessageId: false,
  showModelIcon: false,
  showTokenCount: false,
  showGenerationTimer: false,
  showGenerationCost: false,
};

const ROW = '[data-slot="message-metadata-row"]';
const SEP = "·";

test("every toggle off: the row renders nothing (no empty shell)", async ({ mount }) => {
  const component = await mount(<MessageMetadataRowStory visibility={ALL_OFF} />);
  await expect(component.locator(ROW)).toHaveCount(0);
});

test("model toggle on + a model present: only the model datum shows, no separator", async ({ mount }) => {
  const component = await mount(<MessageMetadataRowStory visibility={{ ...ALL_OFF, showModelIcon: true }} />);
  await expect(component.locator('[data-slot="message-metadata-model"]')).toHaveText("qwen3-vl");
  await expect(component.locator('[data-slot="message-metadata-tokens"]')).toHaveCount(0);
  // A single datum has no `·` — separators are BETWEEN items only.
  await expect(component.locator(ROW)).not.toContainText(SEP);
});

test("token toggle on but the datum ABSENT (null tokens): stays empty — presence gates, not just the toggle", async ({ mount }) => {
  const component = await mount(<MessageMetadataRowStory visibility={{ ...ALL_OFF, showTokenCount: true }} message={{ tokensOut: null, tokensIn: null }} />);
  await expect(component.locator('[data-slot="message-metadata-tokens"]')).toHaveCount(0);
  await expect(component.locator(ROW)).toHaveCount(0);
});

test("token count uses OUTPUT tokens (the generated length) when present, formatted as 'N tok'", async ({ mount }) => {
  const outOnly = await mount(<MessageMetadataRowStory visibility={{ ...ALL_OFF, showTokenCount: true }} message={{ tokensOut: 128, tokensIn: 64 }} />);
  await expect(outOnly.locator('[data-slot="message-metadata-tokens"]')).toHaveText("128 tok");
});

test("token count FALLS BACK to input tokens when there's no output (never fabricates a sum)", async ({ mount }) => {
  const inOnly = await mount(<MessageMetadataRowStory visibility={{ ...ALL_OFF, showTokenCount: true }} message={{ tokensOut: null, tokensIn: 64 }} />);
  await expect(inOnly.locator('[data-slot="message-metadata-tokens"]')).toHaveText("64 tok");
});

test("two datums on: both render with exactly one `·` separator between them", async ({ mount }) => {
  const component = await mount(<MessageMetadataRowStory visibility={{ ...ALL_OFF, showModelIcon: true, showTokenCount: true }} />);
  await expect(component.locator('[data-slot="message-metadata-model"]')).toBeVisible();
  await expect(component.locator('[data-slot="message-metadata-tokens"]')).toBeVisible();
  // One separator glyph — between the two, never leading/trailing.
  const seps = component.locator(`${ROW} [aria-hidden="true"]`);
  await expect(seps).toHaveCount(1);
});

test("the generation timer renders a duration label from gen start/finish stamps", async ({ mount }) => {
  const component = await mount(<MessageMetadataRowStory visibility={{ ...ALL_OFF, showGenerationTimer: true }} />);
  await expect(component.locator('[data-slot="message-metadata-gen-duration"]')).toBeVisible();
});

test("timestamps never render here even when showTimestamps is on (they live in the name row)", async ({ mount }) => {
  const component = await mount(<MessageMetadataRowStory visibility={{ ...ALL_OFF, showTimestamps: true }} />);
  await expect(component.locator('[data-slot="message-metadata-timestamp"]')).toHaveCount(0);
  await expect(component.locator(ROW)).toHaveCount(0);
});
