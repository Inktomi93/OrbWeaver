// CT: the tool-call-block seal — the D48 generic tool-invocation fallback block (tool-use-design/
// 03 §4 + 05 §T7). THREE states driven ONLY by the record; arguments/result JSON.parse with a
// raw-string fallback that never blanks; native <details> collapse.
import { ToolCallBlock } from "@orb/ui/tool-call-block";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../../support/ct/resolved-token-color.ts";

test("success: pretty-prints arguments and result JSON, no error styling", async ({ mount, page }) => {
  await mount(
    <ToolCallBlock
      defaultOpen={true}
      record={{
        arguments: '{"sides":20}',
        durationMs: 42,
        isError: false,
        name: "roll_dice",
        result: '{"total":17}',
        toolCallId: "call_1",
      }}
    />,
  );
  await expect(page.getByText("roll_dice", { exact: true })).toBeVisible();
  await expect(page.getByText("Success", { exact: true })).toBeVisible();
  await expect(page.getByText("42ms", { exact: true })).toBeVisible();
  const pres = page.locator("pre");
  await expect(pres.nth(0)).toHaveText('{\n  "sides": 20\n}');
  await expect(pres.nth(1)).toHaveText('{\n  "total": 17\n}');
});

test("isError renders the danger token badge + the result document as the error section", async ({ mount, page }) => {
  await mount(
    <ToolCallBlock
      defaultOpen={true}
      record={{
        arguments: "{}",
        durationMs: 5,
        isError: true,
        name: "tick_clock",
        result: '{"error":"clock not found"}',
        toolCallId: "call_2",
      }}
    />,
  );
  const badge = page.locator('[data-slot="tool-call-block-status"] span').first();
  await expect(badge).toHaveText("Error");
  await expect(page.getByText("clock not found")).toBeVisible();
  await expect(badge).toHaveCSS("background-color", resolvedTokenColor("color.destructive"));
});

test("result === null renders the neutral requested-not-run badge and no result section", async ({ mount, page }) => {
  await mount(
    <ToolCallBlock
      defaultOpen={true}
      record={{
        arguments: "{}",
        durationMs: null,
        isError: false,
        name: "tick_clock",
        result: null,
        toolCallId: "call_3",
      }}
    />,
  );
  await expect(page.getByText("Requested, not run")).toBeVisible();
  await expect(page.locator('[data-slot="tool-call-block-body"]')).not.toContainText("Result");
  await expect(page.locator("pre")).toHaveCount(1); // arguments only — no result section
});

test("malformed arguments JSON falls back to the raw string, never blank", async ({ mount, page }) => {
  await mount(
    <ToolCallBlock
      defaultOpen={true}
      record={{
        arguments: "{not valid json",
        durationMs: null,
        isError: false,
        name: "broken_tool",
        result: null,
        toolCallId: "call_4",
      }}
    />,
  );
  await expect(page.locator("pre").first()).toHaveText("{not valid json");
});

test("malformed result JSON also falls back to the raw string, never blank", async ({ mount, page }) => {
  await mount(
    <ToolCallBlock
      defaultOpen={true}
      record={{
        arguments: "{}",
        durationMs: 3,
        isError: false,
        name: "broken_tool",
        result: "{not valid json either",
        toolCallId: "call_6",
      }}
    />,
  );
  const pres = page.locator("pre");
  await expect(pres.nth(1)).toHaveText("{not valid json either");
});

test("the status region announces state via aria-live=polite", async ({ mount, page }) => {
  await mount(
    <ToolCallBlock
      record={{
        arguments: "{}",
        durationMs: 1,
        isError: false,
        name: "roll_dice",
        result: "{}",
        toolCallId: "call_7",
      }}
    />,
  );
  await expect(page.locator('[data-slot="tool-call-block-status"]')).toHaveAttribute("aria-live", "polite");
});

test("closed by default; clicking the summary reveals the body", async ({ mount, page }) => {
  await mount(
    <ToolCallBlock
      record={{
        arguments: "{}",
        durationMs: 1,
        isError: false,
        name: "roll_dice",
        result: "{}",
        toolCallId: "call_5",
      }}
    />,
  );
  const details = page.locator('[data-slot="tool-call-block"]');
  await expect(details).not.toHaveJSProperty("open", true);
  await expect(page.locator('[data-slot="tool-call-block-body"]')).toBeHidden();
  await page.getByText("roll_dice", { exact: true }).click();
  await expect(details).toHaveJSProperty("open", true);
  await expect(page.locator('[data-slot="tool-call-block-body"]')).toBeVisible();
});
