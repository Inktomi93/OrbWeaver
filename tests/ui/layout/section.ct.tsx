// <Section> CT — the block-spacing wrapper: an internal `gap-block` rhythm + the conditional heading
// slot. It NO LONGER self-pads (commit 428707a: between-section spacing is the container's `gap`, not
// Section's own `py` — padding-as-margin double-counted the gap; UI layout doctrine).
import { Section } from "@orb/ui/layout";
import { expect, test } from "@playwright/experimental-ct-react";

test("renders the heading slot and does NOT self-pad (spacing is the container gap)", async ({ mount }) => {
  const component = await mount(
    <Section heading="Sampling">
      <p>content</p>
    </Section>,
  );
  await expect(component.getByRole("heading", { name: "Sampling" })).toBeVisible();
  // Section is a flex-col with an internal gap-block (12px), never its own vertical padding.
  await expect(component).toHaveCSS("padding-top", "0px");
  await expect(component).toHaveCSS("padding-bottom", "0px");
  await expect(component).toHaveCSS("row-gap", "12px");
});

test("no heading prop → no heading element", async ({ mount }) => {
  const component = await mount(
    <Section>
      <p>content</p>
    </Section>,
  );
  await expect(component.getByRole("heading")).toHaveCount(0);
});

test("hint renders an info trigger whose name derives from the heading, without polluting the heading name", async ({ mount, page }) => {
  const component = await mount(
    <Section heading="Sampling" hint="How the sampler shapes the distribution.">
      <p>content</p>
    </Section>,
  );
  // The heading's own accessible name stays clean — the hint trigger is a SIBLING, never a descendant.
  await expect(component.getByRole("heading", { name: "Sampling" })).toHaveAccessibleName("Sampling");
  const trigger = component.getByRole("button", { name: "More info about Sampling" });
  await expect(trigger).toBeVisible();
  // Hover surfaces the explainer copy in the tooltip.
  await trigger.hover();
  await expect(page.locator('[data-slot="tooltip-popup"]')).toHaveText("How the sampler shapes the distribution.");
});

test("kicker renders the section NAME as a real heading in the micro-caps voice, plus the hairline rule", async ({ mount }) => {
  // The CD1 replacement for a box (UI-Density-Law.md §3.2): a read-only grouping gets a name + a rule,
  // never a border+radius+bg. Asserted by COMPUTED value against the document-resolved token, because the
  // whole point is the type STEP DOWN — an authored-class assertion would pass on the wrong size.
  const component = await mount(
    <Section kicker="On stage">
      <p>content</p>
    </Section>,
  );
  const heading = component.getByRole("heading", { name: "On stage" });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveAttribute("data-voice", "kicker");
  await expect(heading).toHaveCSS("text-transform", "uppercase");
  const sized = await heading.evaluate((el) => {
    const probe = el.ownerDocument.createElement("div");
    probe.style.fontSize = "var(--text-micro)";
    el.ownerDocument.body.append(probe);
    const micro = getComputedStyle(probe).fontSize;
    probe.remove();
    return { actual: getComputedStyle(el).fontSize, micro };
  });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(sized.actual).toBe(sized.micro);
  // The hairline still PAINTS — it is a real element in the DOM (`data-slot="separator"`, visible).
  await expect(component.locator('[data-slot="separator"]')).toBeVisible();
  // …but it is DECORATIVE (a11y #199): the `<h3>` kicker beside it already carries the section name +
  // the document outline, so the rule is `aria-hidden` and MUST NOT surface as an orphan `role="separator"`
  // to a screen reader (it announced as an anonymous divider on every kicker surface before this).
  await expect(component.getByRole("separator")).toHaveCount(0);
});

test("no hint → no info trigger beside the heading", async ({ mount }) => {
  const component = await mount(
    <Section heading="Sampling">
      <p>content</p>
    </Section>,
  );
  await expect(component.getByRole("button")).toHaveCount(0);
});
