// CT: the per-message METADATA row (WS3, D44 §12.1). The behavior is a two-factor gate on EACH datum —
// its own visibility toggle AND the datum actually being present on the MessageView — plus the
// render-nothing floor (no empty <Row> shell) and the `·` separators only BETWEEN present items. These
// pins drive the toggle×presence matrix, not "a row renders": a toggle-on/datum-absent case must stay
// empty, and a datum-present/toggle-off case must stay empty. Timestamps live in the name row (a sibling
// component), so they never appear here even when `showTimestamps` is on.

import type { UserConnectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { MessageMetadataVisibility } from "../../../../../packages/client/src/features/chat/components/message-metadata-row.tsx";
import { MessageMetadataRowStory } from "../_ct-stories.tsx";

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

// #167: the MODEL credit left this row for the action cluster (message-actions-row.tsx, pinned in
// message-row.ct.tsx). `showModelIcon` on must therefore produce NOTHING here — including no empty shell,
// which is exactly the regression an "it moved" change leaves behind if the item list still branches.
test("model toggle on: this row renders nothing — the credit moved to the action cluster (#167)", async ({ mount }) => {
  const component = await mount(<MessageMetadataRowStory visibility={{ ...ALL_OFF, showModelIcon: true }} />);
  await expect(component.locator('[data-slot="message-metadata-model"]')).toHaveCount(0);
  await expect(component.locator(ROW)).toHaveCount(0);
});

test("token toggle on + the datum present: only the token datum shows, no separator", async ({ mount }) => {
  const component = await mount(<MessageMetadataRowStory visibility={{ ...ALL_OFF, showTokenCount: true }} />);
  await expect(component.locator('[data-slot="message-metadata-tokens"]')).toBeVisible();
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

test("an estimated token count is visibly approximate", async ({ mount }) => {
  const estimated = await mount(
    <MessageMetadataRowStory visibility={{ ...ALL_OFF, showTokenCount: true }} message={{ tokensOut: 128, tokenProvenance: "estimated" }} />,
  );
  await expect(estimated.locator('[data-slot="message-metadata-tokens"]')).toHaveText("~128 tok");
});

test("an unrecorded legacy number stays hidden until provenance is settled", async ({ mount }) => {
  const unrecorded = await mount(
    <MessageMetadataRowStory visibility={{ ...ALL_OFF, showTokenCount: true }} message={{ tokensOut: 128, tokenProvenance: "unrecorded" }} />,
  );
  await expect(unrecorded.locator('[data-slot="message-metadata-tokens"]')).toHaveCount(0);
  await expect(unrecorded.locator(ROW)).toHaveCount(0);
});

test("two datums on: both render with exactly one `·` separator between them", async ({ mount }) => {
  const component = await mount(<MessageMetadataRowStory visibility={{ ...ALL_OFF, showMessageId: true, showTokenCount: true }} />);
  await expect(component.locator('[data-slot="message-metadata-id"]')).toBeVisible();
  await expect(component.locator('[data-slot="message-metadata-tokens"]')).toBeVisible();
  // One separator glyph — between the two, never leading/trailing.
  const seps = component.locator(`${ROW} [aria-hidden="true"]`);
  await expect(seps).toHaveCount(1);
});

test("the generation timer renders a duration label from gen start/finish stamps", async ({ mount }) => {
  const component = await mount(<MessageMetadataRowStory visibility={{ ...ALL_OFF, showGenerationTimer: true }} />);
  await expect(component.locator('[data-slot="message-metadata-gen-duration"]')).toBeVisible();
});

// ── #1032, the viewgap WIRE batch: three MessageView fields the row served and never read ──────────────

test("cache economics ride the TOKEN toggle — present datum, token toggle on", async ({ mount }) => {
  const component = await mount(
    <MessageMetadataRowStory visibility={{ ...ALL_OFF, showTokenCount: true }} message={{ cacheReadTokens: 1024, cacheWriteTokens: 512 }} />,
  );
  await expect(component.locator('[data-slot="message-metadata-cache"]')).toHaveText("cache 1024 read / 512 written");
});

test("cache economics stay hidden with the token toggle OFF (they are the token number's own explanation)", async ({ mount }) => {
  const component = await mount(<MessageMetadataRowStory visibility={ALL_OFF} message={{ cacheReadTokens: 1024, cacheWriteTokens: 512 }} />);
  await expect(component.locator('[data-slot="message-metadata-cache"]')).toHaveCount(0);
  await expect(component.locator(ROW)).toHaveCount(0);
});

test("a turn with no cache activity adds no datum — presence gates, not just the toggle", async ({ mount }) => {
  const component = await mount(
    <MessageMetadataRowStory visibility={{ ...ALL_OFF, showTokenCount: true }} message={{ cacheReadTokens: 0, cacheWriteTokens: 0 }} />,
  );
  await expect(component.locator('[data-slot="message-metadata-cache"]')).toHaveCount(0);
});

test("time-to-first-token rides the TIMER toggle, in the timer's own duration shape", async ({ mount }) => {
  const component = await mount(<MessageMetadataRowStory visibility={{ ...ALL_OFF, showGenerationTimer: true }} message={{ ttftMs: 820 }} />);
  await expect(component.locator('[data-slot="message-metadata-ttft"]')).toHaveText("820ms to first token");
});

test("time-to-first-token stays hidden with the timer toggle off", async ({ mount }) => {
  const component = await mount(<MessageMetadataRowStory visibility={ALL_OFF} message={{ ttftMs: 820 }} />);
  await expect(component.locator('[data-slot="message-metadata-ttft"]')).toHaveCount(0);
});

// THE OUTCOME NOTICE WAS KILLED (#1876, owner ruling). The "cut off — length cap" badge and its
// supporting derivation were removed entirely. The two CTs that pinned it are deleted with the feature.

// THE COST SLOT'S OWN TWO-FACTOR GATE (inference audit B7). The row must ask the readout's predicate, not
// "is there a generationId": the id is now the provider's response id on EVERY hosted wire, so an id-keyed
// row gate pushes an item whose child renders null — which is a `·` separator with nothing after it.
test("the cost slot is gated on the provider's dialect: an anthropic swipe with a msg_… id adds no datum", async ({ mount }) => {
  const component = await mount(
    <MessageMetadataRowStory
      visibility={{ ...ALL_OFF, showGenerationCost: true }}
      message={{ connectionId: castId<UserConnectionId>("uconn_ct_row"), generationId: "msg_011CfEBkq13YCxSrpf1a13Do", provider: "anthropic" }}
    />,
  );
  await expect(component.locator('[data-slot="message-metadata-cost-trigger"]')).toHaveCount(0);
  await expect(component.locator(ROW)).toHaveCount(0);
});

test("the same row on an openrouter connection DOES get the cost trigger", async ({ mount }) => {
  const component = await mount(
    <MessageMetadataRowStory
      visibility={{ ...ALL_OFF, showGenerationCost: true }}
      message={{ connectionId: castId<UserConnectionId>("uconn_ct_row"), generationId: "gen-1789884256-ZeulFgkGknjAbAgCKe1S", provider: "openrouter" }}
    />,
  );
  await expect(component.locator('[data-slot="message-metadata-cost-trigger"]')).toBeVisible();
});

test("timestamps never render here even when showTimestamps is on (they live in the name row)", async ({ mount }) => {
  const component = await mount(<MessageMetadataRowStory visibility={{ ...ALL_OFF, showTimestamps: true }} />);
  await expect(component.locator('[data-slot="message-metadata-timestamp"]')).toHaveCount(0);
  await expect(component.locator(ROW)).toHaveCount(0);
});
