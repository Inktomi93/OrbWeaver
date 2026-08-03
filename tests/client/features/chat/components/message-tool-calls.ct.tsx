// CT: the tool-renderer seam (message-tool-calls.tsx). Three layers, asserted by BEHAVIOUR (what the
// reader can see / which renderer owned the block), never by layout geometry: the generic @orb/ui
// `ToolCallBlock` fallback every unregistered tool name lands on, the per-tool-NAME `ToolRenderer`
// specialization that wins on a match, and the whole-message `MessageToolsRenderer` with first refusal
// (returning null falls through to the per-record path, byte-identical to having no Provider at all).

import type { ToolCallRecord } from "@orb/contracts/chat";
import { expect, test } from "@playwright/experimental-ct-react";
import { MessageToolCallsStory } from "../_ct-stories.tsx";

const BLOCK = '[data-slot="tool-call-block"]';
const LIST = '[data-slot="message-tool-calls"]';

function record(overrides: Partial<ToolCallRecord> = {}): ToolCallRecord {
  return {
    toolCallId: "call_1",
    name: "lookup_lore",
    arguments: '{"query":"aria"}',
    result: '{"entries":1}',
    isError: false,
    durationMs: 12,
    ...overrides,
  };
}

test("renders each record through the generic fallback — name + result visible", async ({ mount }) => {
  const component = await mount(<MessageToolCallsStory records={[record(), record({ toolCallId: "call_2", name: "roll_check" })]} />);
  await expect(component.locator(BLOCK)).toHaveCount(2);
  await expect(component).toContainText("lookup_lore");
  await expect(component).toContainText("roll_check");
  // The result lives in the collapsed <details> body — open the first block and read it.
  await component.locator(BLOCK).first().locator("summary").click();
  await expect(component.locator(BLOCK).first()).toContainText("entries");
});

test("an isError record is visibly distinguishable from a successful one", async ({ mount }) => {
  const component = await mount(
    <MessageToolCallsStory records={[record({ isError: true, result: '{"message":"boom"}' }), record({ toolCallId: "call_2", name: "roll_check" })]} />,
  );
  const failed = component.locator(BLOCK).first();
  const ok = component.locator(BLOCK).nth(1);
  await expect(failed).toContainText("Error");
  await expect(ok).toContainText("Success");
  // Not merely different words: the error badge paints a different colour than the success badge.
  const failedColor = await failed.locator('[data-slot="tool-call-block-status"]').evaluate((el) => getComputedStyle(el.firstElementChild ?? el).color);
  const okColor = await ok.locator('[data-slot="tool-call-block-status"]').evaluate((el) => getComputedStyle(el.firstElementChild ?? el).color);
  expect(failedColor).not.toBe(okColor);
});

test("an empty record set renders nothing at all — no list, no empty shell", async ({ mount }) => {
  const component = await mount(<MessageToolCallsStory records={[]} />);
  await expect(component.locator(LIST)).toHaveCount(0);
  await expect(component.locator(BLOCK)).toHaveCount(0);
});

test("a registered ToolRenderer wins for its own tool NAME", async ({ mount }) => {
  const component = await mount(<MessageToolCallsStory records={[record()]} customToolName="lookup_lore" />);
  await expect(component.getByTestId("custom-tool")).toHaveText("custom:lookup_lore");
  await expect(component.locator(BLOCK)).toHaveCount(0);
});

test("a NON-matching tool name falls back to the generic block beside the specialized one", async ({ mount }) => {
  const component = await mount(
    <MessageToolCallsStory records={[record(), record({ toolCallId: "call_2", name: "roll_check" })]} customToolName="lookup_lore" />,
  );
  await expect(component.getByTestId("custom-tool")).toHaveCount(1);
  const fallback = component.locator(BLOCK);
  await expect(fallback).toHaveCount(1);
  await expect(fallback).toContainText("roll_check");
});

// Asserted against `page`, not the mounted-component locator: a claiming renderer makes the story's root
// render a bare FRAGMENT, which Playwright's `internal:control=component` anchor cannot scope into.
test("a whole-message renderer that CLAIMS the message owns the entire block", async ({ mount, page }) => {
  await mount(<MessageToolCallsStory records={[record(), record({ toolCallId: "call_2" })]} messageRenderer="claims" />);
  await expect(page.getByTestId("message-fold")).toHaveText("2 tool calls");
  await expect(page.locator(BLOCK)).toHaveCount(0);
});

test("a whole-message renderer returning null falls through to per-record rendering", async ({ mount }) => {
  const component = await mount(<MessageToolCallsStory records={[record(), record({ toolCallId: "call_2" })]} messageRenderer="abstains" />);
  await expect(component.getByTestId("message-fold")).toHaveCount(0);
  await expect(component.locator(BLOCK)).toHaveCount(2);
});
