// CT: the scroll-area seal — overflowing content renders inside a genuinely scrollable viewport
// (Base UI preserves native scroll physics; the styled scrollbar overlay is cosmetic).
import { ScrollArea } from "@orb/ui/scroll-area";
import { expect, test } from "@playwright/experimental-ct-react";

test("renders content in a scrollable viewport", async ({ mount, page }) => {
  await mount(
    <ScrollArea style={{ height: 120 }}>
      <div style={{ height: 1200 }}>
        <p>Top marker</p>
        <p>Bottom marker</p>
      </div>
    </ScrollArea>,
  );

  const viewport = page.locator('[data-slot="scroll-area-viewport"]');
  await expect(viewport).toBeVisible();
  await expect(page.getByText("Top marker")).toBeVisible();

  const overflows = await viewport.evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(overflows).toBe(true);

  await viewport.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});
