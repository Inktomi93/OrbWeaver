// CT: the labeled-form-row seal — Base UI wires label→control (getByLabel resolves the input),
// error renders in the destructive token and flips the control invalid (ui-package-design §6.1).
// Also covers the R5 fix (FieldProps extends the full Field.Root surface) and R2 (FieldValidity).

import { Checkbox } from "@orb/ui/checkbox";
import { Field, FieldLayout } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { RadioGroup, RadioGroupItem } from "@orb/ui/radio-group";
import { Switch } from "@orb/ui/switch";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../../support/node/resolved-token-color.ts";
import { FieldValidityStory } from "./field-validity.fixtures.tsx";

test("wires the label to the composed control", async ({ mount, page }) => {
  await mount(
    <Field label="Display name">
      <Input />
    </Field>,
  );
  const input = page.getByLabel("Display name");
  await input.fill("Seraphina");
  await expect(input).toHaveValue("Seraphina");
});

test("error renders destructive and marks the control data-invalid", async ({ mount, page }) => {
  await mount(
    <Field error="Required" label="Name">
      <Input />
    </Field>,
  );
  const error = page.getByText("Required");
  await expect(error).toHaveCSS("color", resolvedTokenColor("color.destructive"));
  await expect(page.getByLabel("Name")).toHaveAttribute("data-invalid", "");
});

test("description renders muted below the control", async ({ mount, page }) => {
  await mount(
    <Field description="Shown on your profile" label="Name">
      <Input />
    </Field>,
  );
  const description = page.getByText("Shown on your profile");
  await expect(description).toHaveCSS("color", TOKENS["color.muted-foreground"].value);
});

test("a hinted field's control accname is the label ALONE (the More-info button is a sibling)", async ({ mount, page }) => {
  await mount(
    <Field hint="Saved every 30 seconds" label="Display name">
      <Input />
    </Field>,
  );
  // The W3C accname of the control is EXACTLY the label — no "More info" leaked from the hint button
  // (which used to be nested inside the associated <label>). `exact: true` fails if the suffix is present.
  await expect(page.getByRole("textbox", { name: "Display name", exact: true })).toBeVisible();
  // The hint trigger exists as its OWN control (a sibling of the label) and its tooltip still opens.
  // Its accname is derived from the field's label so multiple hinted fields on one surface don't
  // collide on a single generic "More info" name (a screen-reader buttons list must disambiguate).
  const info = page.getByRole("button", { name: "More info about Display name" });
  await expect(info).toBeVisible();
  await info.hover();
  await expect(page.getByText("Saved every 30 seconds")).toBeVisible();
});

test("the hint accname fix holds in the horizontal orientation too", async ({ mount, page }) => {
  await mount(
    <FieldLayout orientation="horizontal">
      <Field hint="Saved every 30 seconds" label="Display name">
        <Input />
      </Field>
    </FieldLayout>,
  );
  await expect(page.getByRole("textbox", { name: "Display name", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "More info about Display name" })).toBeVisible();
});

// THE HINT COSTS NO VERTICAL SPACE — the prop's own documented contract (field.tsx: "surfaced as an
// info-icon hover tooltip beside the label (no vertical-space cost)"), and it was false: the trigger was a
// `size="icon"` Button (a full `--spacing-control-md` box), so a hinted label row stood 16px taller than a
// plain one and every side-by-side pair of a hinted and an unhinted field sheared — the preset drill-ins'
// DELIVERY row (crunch item 10, owner-reported live). Only computed geometry can see it.
test("a hinted label row is the SAME height as a plain one, so a hinted/plain pair does not shear", async ({ mount, page }) => {
  await mount(
    <>
      <Field label="Role">
        <Input />
      </Field>
      <Field hint="0 = the tail" label="At depth">
        <Input />
      </Field>
    </>,
  );
  const box = async (locator: ReturnType<typeof page.locator>): Promise<{ height: number }> => {
    const rect = await locator.boundingBox();
    if (rect === null) {
      throw new Error("expected a rendered box");
    }
    return { height: Math.round(rect.height) };
  };
  const plain = await box(page.getByText("Role", { exact: true }));
  const hinted = await box(page.getByText("At depth", { exact: true }).locator(".."));
  expect(hinted.height).toBe(plain.height);
  // The trigger is still a real, hoverable control — shrinking the box must not cost the affordance.
  await page.getByRole("button", { name: "More info about At depth" }).hover();
  await expect(page.getByText("0 = the tail")).toBeVisible();
});

test("two hinted fields on one surface get DISTINCT hint-trigger accnames", async ({ mount, page }) => {
  await mount(
    <>
      <Field hint="Shown on your profile" label="Display name">
        <Input />
      </Field>
      <Field hint="Only visible to the GM" label="Notes">
        <Input />
      </Field>
    </>,
  );
  await expect(page.getByRole("button", { name: "More info about Display name" })).toBeVisible();
  await expect(page.getByRole("button", { name: "More info about Notes" })).toBeVisible();
});

// THE HINT'S TOUCH PSEUDO MUST CLEAR THE LABEL, AND NOTHING PINNED IT (#871 → #1286).
//
// `HintTrigger` renders `size="inline"` here: a 12px icon box whose layout-neutral touch-target `::after`
// (button/variants.ts's `inline` arm) is centred on the box and reaches `(touch-target − 12)/2` past each
// edge — 8px at a fine pointer. `labelRow`'s `gap-field` (6px) left 2px of that pseudo painted over the
// adjacent label TEXT, and a pseudo does NOT self-report to `elementFromPoint` (measured, #807), so the
// point resolved to the label span. design-audit read that as "another element's text owns this pixel" and
// filed NINE P1 `tap-target` rows at 22×22 on the presets editor — the auditor was RIGHT and the surface
// was the defect. #1286 (08e2b0436) fixed it with `pointer-fine:gap-row` (8px — reach 8, overlap 0) and
// shipped NO geometry pin, so re-spelling that one utility back to `gap-field` would silently re-open all
// nine.
//
// This asserts the AFFORDANCE, not the class: a pointer just inside the pseudo's near edge must land on
// something that CONTAINS the trigger, which is exactly the ownership question the auditor asks. Fine
// pointer is the arm under test — at a coarse pointer `HintTrigger` swaps to a real `size-touch-target`
// box that occupies flex space, so 6px was always correct there and this row measures nothing.
test("the hint trigger's touch pseudo clears the label text, so its near edge is still the trigger's", async ({ mount, page }) => {
  await mount(
    <Field hint="Saved every 30 seconds" label="Display name">
      <Input />
    </Field>,
  );
  const probe = await page.evaluate(() => {
    const trigger = document.querySelector('[data-slot="hint-trigger"]');
    if (!(trigger instanceof HTMLElement) || trigger.parentElement === null) {
      throw new Error("no hint trigger rendered");
    }
    const rect = trigger.getBoundingClientRect();
    const reach = Number.parseFloat(getComputedStyle(trigger, "::after").width) / 2;
    // One pixel INSIDE the pseudo's near edge — the widest point the trigger can still claim.
    const hit = document.elementFromPoint(rect.left + rect.width / 2 - (reach - 1), rect.top + rect.height / 2);
    return {
      boxPx: Math.round(Math.min(rect.width, rect.height)),
      pseudoWidthPx: Math.round(reach * 2),
      labelRowGap: getComputedStyle(trigger.parentElement).columnGap,
      hitOwnsTrigger: hit !== null && (hit === trigger || hit.contains(trigger)),
      hitText: (hit?.textContent ?? "").trim().slice(0, 40),
    };
  });
  // The anatomy this row is about, stated so a failure names which half moved.
  expect(probe.boxPx, "the inline arm keeps the 12px icon box — a control height would shear the row").toBe(12);
  expect(probe.pseudoWidthPx, "the fine-pointer touch pseudo is 28px, an 8px reach past each edge of the box").toBe(28);
  expect(probe.labelRowGap, "labelRow's fine-pointer gap must be gap-row (8px), not gap-field (6px) — #1286").toBe("8px");
  // The verdict: no other element's text sits under the pseudo's near edge.
  expect(probe.hitOwnsTrigger, `the label paints over the hint's touch target — hit carried "${probe.hitText}"`).toBe(true);
});

test("a hinted field with no label falls back to the plain 'More info' name", async ({ mount, page }) => {
  await mount(
    <Field hint="Saved every 30 seconds" label="">
      <Input />
    </Field>,
  );
  await expect(page.getByRole("button", { name: "More info", exact: true })).toBeVisible();
});

test("composes Checkbox/Switch/RadioGroup — every control registers independently", async ({ mount, page }) => {
  await mount(
    <>
      <Field label="Terms">
        <Checkbox />
      </Field>
      <Field label="Streaming">
        <Switch />
      </Field>
      <Field label="Who runs the game">
        <RadioGroup>
          <RadioGroupItem value="ai">An AI</RadioGroupItem>
          <RadioGroupItem value="human">A human GM</RadioGroupItem>
        </RadioGroup>
      </Field>
    </>,
  );
  await expect(page.getByRole("checkbox")).toBeVisible();
  await expect(page.getByRole("switch")).toBeVisible();
  await expect(page.getByRole("radiogroup")).toBeVisible();
});

test("validate/validationMode flow through — internal validation drives data-invalid", async ({ mount, page }) => {
  // Field only renders its OWN `error` prop as visible text (§ field.tsx doc-comment); internal
  // `validate` results still drive `data-invalid` on the control without one (see FieldValidity
  // below for surfacing the message text itself). Confirms passing `validate` doesn't force
  // `invalid` — Base UI's own computation must be free to run un-overridden.
  await mount(
    <Field label="Age" validate={(value): string | null => (value === "13" ? "Too young" : null)} validationMode="onChange">
      <Input />
    </Field>,
  );
  const input = page.getByLabel("Age");
  await expect(input).not.toHaveAttribute("data-invalid", "");
  await input.fill("13");
  await expect(input).toHaveAttribute("data-invalid", "");
});

// ── The description-less horizontal row's baseline (side-eye 2026-08-06 P2) ────────────────────────
// `items-start` is right only when a column is genuinely multi-line: a description wraps under the label
// and the control must hold the first line. With neither a description nor an error the two boxes are
// single-line and unequal height (a `label` text step vs a `control-md` box), and top-alignment sheared
// every such settings row — the label rode the control's TOP edge, ~8px above its centre.
//
// Asserted as GEOMETRY (centre lines, not a class): the fix is a visual claim, and a class assertion would
// survive a variant that resolves to something else.
test("a horizontal row with NO description centres its label against the control", async ({ mount, page }) => {
  await mount(
    <Field label="Avatar size" orientation="horizontal">
      <Switch />
    </Field>,
  );
  await expect
    .poll(
      async () =>
        await page.locator('[data-slot="field-root"]').evaluate((root: HTMLElement): number => {
          const label = root.querySelector('[data-slot="field-label"]') as HTMLElement;
          const control = root.querySelector('[data-slot="field-control-col"]') as HTMLElement;
          const labelBox = label.getBoundingClientRect();
          const controlBox = control.getBoundingClientRect();
          return Math.abs(labelBox.top + labelBox.height / 2 - (controlBox.top + controlBox.height / 2));
        }),
    )
    .toBeLessThan(1.5);
});

test("a horizontal row WITH a description keeps the control on the first line", async ({ mount, page }) => {
  await mount(
    <Field description="Bubble tints each message; flat is full-width; document is a centered manuscript column." label="Chat display" orientation="horizontal">
      <Switch />
    </Field>,
  );
  // The label BLOCK is now two lines tall; the control must sit at its top, not float to its middle.
  const tops = await page.locator('[data-slot="field-root"]').evaluate((root: HTMLElement): readonly [number, number, number] => {
    const block = root.querySelector('[data-slot="field-label-block"]') as HTMLElement;
    const control = root.querySelector('[data-slot="field-control-col"]') as HTMLElement;
    return [block.getBoundingClientRect().top, control.getBoundingClientRect().top, block.getBoundingClientRect().height];
  });
  const [blockTop, controlTop, blockHeight] = tops;
  expect(blockHeight).toBeGreaterThan(24); // genuinely multi-line, or the test proves nothing
  expect(Math.abs(controlTop - blockTop)).toBeLessThan(1.5);
});

test("FieldValidity exposes the raw validity state as a render-prop", async ({ mount, page }) => {
  // The render-prop itself is defined in the fixture, not inline here — Playwright CT proxies
  // inline children-callback props back to Node (event-style), it does not render their JSX
  // return value in-browser (see field-validity.fixtures.tsx).
  await mount(<FieldValidityStory />);
  const input = page.getByLabel("Age");
  await input.fill("13");
  await expect(page.getByText("field is invalid", { exact: true })).toBeVisible();
});
