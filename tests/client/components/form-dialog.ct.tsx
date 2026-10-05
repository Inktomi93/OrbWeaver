// The form-dialog composite carries the native anchor into its promoted popup: intrinsic odd heights must not
// introduce a half-device-pixel landing. Regular dismissal retains native focus restoration.
import { FormDialog } from "@orb/client/components";
import { expect, test } from "@playwright/experimental-ct-react";

for (const dpr of [1, 3]) {
  test.describe(`form-dialog anchor at DPR ${String(dpr)}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test("odd intrinsic content lands on the device grid through anchor=top", async ({ mount, page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await mount(
        <FormDialog anchor="top" open={true} onOpenChange={(): void => undefined} title="Odd intrinsic form" closeButton={true}>
          <div style={{ height: 1, flexShrink: 0 }} />
        </FormDialog>,
      );
      const popup = page.locator('[data-slot="dialog-popup"]');
      await expect(popup).toBeVisible();
      await expect.poll(() => popup.evaluate((element) => element.getAnimations().length)).toBe(0);
      await expect
        .poll(() =>
          popup.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const viewport = element.parentElement;
            if (viewport === null) {
              throw new Error("the dialog owns a viewport");
            }
            return {
              oddHeight: rect.height % 2,
              dpr: devicePixelRatio,
              atGutter: rect.y === Number.parseFloat(getComputedStyle(viewport).paddingTop),
              onGrid: Math.abs(rect.y * devicePixelRatio - Math.round(rect.y * devicePixelRatio)) < 0.01,
            };
          }),
        )
        .toEqual({ oddHeight: 1, dpr, atGutter: true, onGrid: true });
    });
  });
}
