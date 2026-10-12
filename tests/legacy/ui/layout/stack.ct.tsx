// <Stack> CT — the intent-token mapping is the component's whole job, so assert the computed
// pixel value of a gap token (gap-row = --spacing-row = 0.5rem = 8px), not just that it mounts.
import { Stack } from "@orb/ui/layout";
import { expect, test } from "@playwright/experimental-ct-react";

test("gap='row' computes to the 8px intent token on a column flex", async ({ mount }) => {
  const component = await mount(
    <Stack gap="row">
      <span>alpha</span>
      <span>beta</span>
    </Stack>,
  );
  await expect(component).toHaveCSS("display", "flex");
  await expect(component).toHaveCSS("flex-direction", "column");
  await expect(component).toHaveCSS("row-gap", "8px");
});

test("padding variant maps to the intent scale (padding='section' = 24px)", async ({ mount }) => {
  const component = await mount(
    <Stack gap="field" padding="section">
      <span>alpha</span>
    </Stack>,
  );
  await expect(component).toHaveCSS("padding-top", "24px");
  await expect(component).toHaveCSS("row-gap", "6px");
});

// rows="control" (#884 C3 — the #850 vertical-pitch class): every DIRECT child is floored at the
// pointer-conditional --spacing-control-sm, so a stack of text-height inline-edit rows seats its own
// controls' hit pseudos instead of lending them to the row below. Asserted against the LIVE token, never
// a literal (32px fine / 44px coarse would each be wrong on the other pointer).
test("rows='control' floors every direct child at the control-sm token; without it a text row keeps its bare height", async ({ mount, page }) => {
  await mount(
    <>
      <Stack gap="field" rows="control">
        <span>floored</span>
      </Stack>
      <Stack gap="field">
        <span>bare</span>
      </Stack>
    </>,
  );
  const floor = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.height = "var(--spacing-control-sm)";
    document.body.append(probe);
    const resolved = Number.parseFloat(getComputedStyle(probe).height);
    probe.remove();
    return resolved;
  });
  expect(floor, "the control-sm token must resolve, or this assertion is vacuous").toBeGreaterThan(0);
  const floored = await page.getByText("floored").boundingBox();
  const bare = await page.getByText("bare").boundingBox();
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(floored?.height).toBeGreaterThanOrEqual(floor);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(bare?.height).toBeLessThan(floor);
});
