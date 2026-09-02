// CT: the variant-axis stamp AS RENDERED (#1080). The unit test pins the derivation; this pins that the
// TRANCHE-1 pilot primitives actually put the attributes in the DOM — `done ≠ rendered` — including the
// default arm (no props at all) and the no-collision claim beside Base UI's own runtime state attributes.
//
// The two-arm assertion is the audit's F8 defect verbatim: two authored size arms of ONE primitive inside
// ONE home used to be indistinguishable in the DOM, so the walker folded them into one "authored
// target-size decision".
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Skeleton } from "@orb/ui/skeleton";
import { Toggle } from "@orb/ui/toggle";
import { expect, test } from "@playwright/experimental-ct-react";

test("two authored size arms of one primitive are distinguishable in the DOM", async ({ mount }) => {
  const row = await mount(
    <div>
      <Button aria-label="Dismiss" intent="ghost" size="glyph-xs" />
      <Button intent="primary" size="lg">
        Continue
      </Button>
    </div>,
  );
  await expect(row.locator('[data-slot="button"][data-size="glyph-xs"]')).toHaveCount(1);
  await expect(row.locator('[data-slot="button"][data-size="lg"]')).toHaveCount(1);
  await expect(row.locator('[data-slot="button"][data-intent="ghost"]')).toHaveCount(1);
  await expect(row.locator('[data-slot="button"][data-intent="primary"]')).toHaveCount(1);
});

test("a button with no variant props still stamps the arms that painted", async ({ mount }) => {
  const button = await mount(<Button>Save</Button>);
  await expect(button).toHaveAttribute("data-size", "md");
  await expect(button).toHaveAttribute("data-intent", "primary");
});

test("badge stamps all three of its stamped axes and none it does not declare", async ({ mount }) => {
  const badge = await mount(
    <Badge intent="success" size="md" tone="soft">
      Active
    </Badge>,
  );
  await expect(badge).toHaveAttribute("data-intent", "success");
  await expect(badge).toHaveAttribute("data-tone", "soft");
  await expect(badge).toHaveAttribute("data-size", "md");
  await expect(badge.locator("xpath=self::*[@data-variant]")).toHaveCount(0);
});

test("skeleton stamps the variant axis", async ({ mount }) => {
  const skeleton = await mount(<Skeleton variant="circle" />);
  await expect(skeleton).toHaveAttribute("data-variant", "circle");
});

test("the stamp does not shadow Base UI's own state attributes on the same element", async ({ mount }) => {
  // Toggle is a Base UI control: `data-pressed` is its RUNTIME state, `data-intent`/`data-size` are the
  // AUTHORED choice. Both must be readable on one element — that separation is why the stamped vocabulary
  // is closed to four names Base UI never emits.
  const toggle = await mount(
    <Toggle aria-label="Bold" defaultPressed={true} intent="neutral" size="sm">
      B
    </Toggle>,
  );
  await expect(toggle).toHaveAttribute("data-pressed", "");
  await expect(toggle).toHaveAttribute("data-intent", "neutral");
  await expect(toggle).toHaveAttribute("data-size", "sm");
});
