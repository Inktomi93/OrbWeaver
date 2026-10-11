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

// A body taller than the viewport scrolls INSIDE the dialog; the footer this composite owns stays in view.
test.describe("form-dialog footer on a phone", () => {
  test.use({ viewport: { width: 430, height: 740 } });
  const tall = <div style={{ height: 1600, flexShrink: 0 }} />;

  test("the prompt footer is inside the viewport and Enter still submits", async ({ mount, page }) => {
    let submitted = 0;
    await mount(
      <FormDialog
        open={true}
        onOpenChange={(): void => undefined}
        submit={{
          label: "Confirm",
          onSubmit: (): void => {
            submitted += 1;
          },
        }}
        title="Tall prompt"
      >
        <input aria-label="Name" />
        {tall}
      </FormDialog>,
    );
    const confirm = page.getByRole("button", { name: "Confirm" });
    await expect(confirm).toBeVisible();
    await expect
      .poll(async () => {
        const box = await confirm.boundingBox();
        return box === null ? Number.POSITIVE_INFINITY : box.y + box.height;
      })
      .toBeLessThanOrEqual(740);
    await page.getByLabel("Name").press("Enter");
    expect(submitted).toBe(1);
  });

  test("the dismiss footer is inside the viewport", async ({ mount, page }) => {
    await mount(
      <FormDialog dismissLabel="Done" open={true} onOpenChange={(): void => undefined} title="Tall form">
        {tall}
      </FormDialog>,
    );
    const done = page.getByRole("button", { name: "Done" });
    await expect(done).toBeVisible();
    await expect
      .poll(async () => {
        const box = await done.boundingBox();
        return box === null ? Number.POSITIVE_INFINITY : box.y + box.height;
      })
      .toBeLessThanOrEqual(740);
  });

  test("a focused last field scrolls clear of the sticky footer", async ({ mount, page }) => {
    await mount(
      <FormDialog open={true} onOpenChange={(): void => undefined} submit={{ label: "Confirm", onSubmit: (): void => undefined }} title="Tall prompt">
        <input aria-label="First" />
        {tall}
        <input aria-label="Last" />
      </FormDialog>,
    );
    // Scroll to the nearest edge, which is where a footer would cover the field.
    await page.getByLabel("Last").evaluate((element) => {
      element.focus({ preventScroll: true });
      element.scrollIntoView({ block: "nearest" });
    });
    await expect
      .poll(async () => {
        const [field, footer] = await Promise.all([page.getByLabel("Last").boundingBox(), page.locator('[data-slot="dialog-footer"]').boundingBox()]);
        return field === null || footer === null ? Number.NaN : footer.y - (field.y + field.height);
      })
      .toBeGreaterThanOrEqual(0);
  });
});

// A short body at desktop size keeps the centred placement and scrolls nothing: the sticky footer adds no height.
test("a short dialog at desktop size stays centred and does not scroll", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mount(
    <FormDialog
      anchor="center"
      open={true}
      onOpenChange={(): void => undefined}
      submit={{ label: "Confirm", onSubmit: (): void => undefined }}
      title="Short prompt"
    >
      <input aria-label="Name" />
    </FormDialog>,
  );
  const popup = page.locator('[data-slot="dialog-popup"]');
  await expect(page.getByRole("button", { name: "Confirm" })).toBeInViewport({ ratio: 1 });
  await expect.poll(() => popup.evaluate((element) => element.getAnimations().length)).toBe(0);
  await expect
    .poll(async () => {
      const box = await popup.boundingBox();
      return box === null ? Number.NaN : Math.abs(box.y - (800 - box.y - box.height));
    })
    .toBeLessThanOrEqual(1);
  await expect
    .poll(() =>
      popup.evaluate((element) => {
        const scrollers = [element, ...element.querySelectorAll("*")].filter(
          (node) => node.scrollHeight > node.clientHeight && getComputedStyle(node).overflowY !== "visible",
        );
        return scrollers.length;
      }),
    )
    .toBe(0);
});
