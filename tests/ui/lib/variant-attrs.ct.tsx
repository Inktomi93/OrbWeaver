// CT: the variant-axis stamp AS RENDERED (#1080). The unit test pins the derivation; this pins that the
// TRANCHE-1 pilot primitives actually put the attributes in the DOM — `done ≠ rendered` — including the
// default arm (no props at all) and the no-collision claim beside Base UI's own runtime state attributes.
//
// The two-arm assertion is the audit's F8 defect verbatim: two authored size arms of ONE primitive inside
// ONE home used to be indistinguishable in the DOM, so the walker folded them into one "authored
// target-size decision".
import { Avatar } from "@orb/ui/avatar";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Dialog, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Container } from "@orb/ui/layout";
import { SegmentedClock } from "@orb/ui/meter";
import { NumberField } from "@orb/ui/number-field";
import { Skeleton } from "@orb/ui/skeleton";
import { Slider } from "@orb/ui/slider";
import { StatusChip } from "@orb/ui/status-chip";
import { Switch } from "@orb/ui/switch";
import { Heading, Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { expect, test } from "@playwright/experimental-ct-react";
import { SwatchPairStory } from "../content/theme-swatch/theme-swatch.fixtures.tsx";

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

// ── TRANCHE 2 (#1097): the SLOT-recipe door, and the per-primitive authoring decision ────────────────
// A slot recipe has no single element to stamp, so each primitive CHOOSES one — and the choice is only
// provable in the rendered DOM, which is what these pin. The rule (recorded beside each stamp site):
// stamp the element the ui-audit walker TARGETS, because `authoredTargetClaim`
// (tooling/src/ui-audit/ops/walker/target-identity.ts) reads the variant attributes off the target
// element ITSELF and never walks ancestors — a stamp on a wrapper is invisible to the census it exists
// to feed. So: the interactive element where the axis differentiates an interactive box, else the
// painted element the axis paints.

test("avatar stamps its size on the ROOT — the box the axis sizes, not the image or the fallback", async ({ mount }) => {
  // The mount locator IS the component's own root element — a `.locator()` off it searches DESCENDANTS.
  const avatar = await mount(<Avatar alt="Zephyrine" size="lg" />);
  await expect(avatar).toHaveAttribute("data-slot", "avatar-root");
  await expect(avatar).toHaveAttribute("data-size", "lg");
  await expect(avatar.locator("[data-size]")).toHaveCount(0);
});

test("collapsible stamps its size on the TRIGGER — the axis is the trigger's tap box", async ({ mount }) => {
  const tree = await mount(
    <Collapsible>
      <CollapsibleTrigger>Advanced</CollapsibleTrigger>
      <CollapsiblePanel>body</CollapsiblePanel>
    </Collapsible>,
  );
  await expect(tree.locator('[data-slot="collapsible-trigger"]')).toHaveAttribute("data-size", "control");
  await expect(tree.locator('[data-slot="collapsible-root"][data-size]')).toHaveCount(0);
});

test("dialog stamps its size on the POPUP — the painted surface the axis widths", async ({ mount, page }) => {
  await mount(
    <Dialog defaultOpen={true}>
      <DialogPopup size="lg">
        <DialogTitle>Settings</DialogTitle>
      </DialogPopup>
    </Dialog>,
  );
  await expect(page.locator('[data-slot="dialog-popup"]')).toHaveAttribute("data-size", "lg");
});

test("number-field stamps its size on the INPUT — the interactive box the axis heights", async ({ mount }) => {
  const field = await mount(<NumberField aria-label="Temperature" defaultValue={1} size="inline" />);
  await expect(field.locator('[data-slot="number-field-input"]')).toHaveAttribute("data-size", "inline");
});

test("slider stamps its tone on the THUMB — the interactive element the tone repaints", async ({ mount, page }) => {
  await mount(<Slider defaultValue={50} label="Top P" tone="ghost" />);
  await expect(page.locator('[data-slot="slider-thumb"]')).toHaveAttribute("data-tone", "ghost");
});

test("status-chip stamps its size on the ROOT — the chip's own identity, beside the Badge's own stamp", async ({ mount }) => {
  const chip = await mount(<StatusChip size="md" status="running" summary="3 of 5" />);
  await expect(chip).toHaveAttribute("data-slot", "status-chip-root");
  await expect(chip).toHaveAttribute("data-size", "md");
  // The composed Badge carries its OWN stamp from its OWN recipe — two elements, two authored decisions.
  await expect(chip.locator('[data-slot="status-chip-badge"]')).toHaveAttribute("data-intent", "info");
});

test("switch stamps its tone on the ROOT beside Base UI's runtime state", async ({ mount }) => {
  const toggle = await mount(<Switch defaultChecked={true} tone="quiet" />);
  const root = toggle.locator('[data-slot="switch-root"]');
  await expect(root).toHaveAttribute("data-tone", "quiet");
  await expect(root).toHaveAttribute("data-checked", "");
});

test("segmented-clock stamps its size on the svg it sizes", async ({ mount }) => {
  const clock = await mount(<SegmentedClock filled={2} label="Clock" segments={4} size="lg" />);
  await expect(clock).toHaveAttribute("data-size", "lg");
});

test("theme-swatch stamps its size on the STRIP — the slot the size axis sizes", async ({ mount, page }) => {
  await mount(<SwatchPairStory />);
  await expect(page.locator('[data-testid="as-strip"] [data-slot="theme-swatch-strip"]')).toHaveAttribute("data-size", "row");
  await expect(page.locator('[data-testid="as-card"] [data-slot="theme-swatch-strip"]')).toHaveAttribute("data-size", "card");
});

test("container stamps its size", async ({ mount }) => {
  const sized = await mount(<Container size="md">body</Container>);
  await expect(sized).toHaveAttribute("data-size", "md");
});

// `containerVariants` declares no `defaultVariants`, so there is no arm to report — the seam emits
// NOTHING rather than the string "undefined" or a guessed default.
test("container stamps nothing when the axis is unset and the recipe has no default arm", async ({ mount }) => {
  const bare = await mount(<Container>body</Container>);
  await expect(bare.locator("xpath=self::*[@data-size]")).toHaveCount(0);
});

test("Text stamps the size/tone arms that painted", async ({ mount }) => {
  const text = await mount(
    <Text size="label" tone="muted">
      body
    </Text>,
  );
  await expect(text).toHaveAttribute("data-size", "label");
  await expect(text).toHaveAttribute("data-tone", "muted");
});

// Heading resolves `size` from `level` when the caller states none — the stamp reports the arm that
// actually PAINTED, which is the level-derived one, not the absent prop.
test("Heading stamps the level-derived size arm and the tone default", async ({ mount }) => {
  const heading = await mount(<Heading level={2}>Title</Heading>);
  await expect(heading).toHaveAttribute("data-size", "title");
  await expect(heading).toHaveAttribute("data-tone", "default");
});
