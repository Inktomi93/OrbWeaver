import { FlowDialog } from "@orb/client/components";
import { expect, test } from "@playwright/experimental-ct-react";

test("scrolls a tall stage below its pinned heading and keeps its action visible", async ({ mount, page }) => {
  await page.setViewportSize({ width: 430, height: 740 });
  await mount(
    <FlowDialog defaultOpen={true} title="Join a room" footer={<button type="button">Continue</button>}>
      <div style={{ height: 1600, flexShrink: 0 }}>Preview</div>
    </FlowDialog>,
  );
  const dialog = page.getByRole("dialog", { name: "Join a room", exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "Join a room", exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeInViewport({ ratio: 1 });
});
