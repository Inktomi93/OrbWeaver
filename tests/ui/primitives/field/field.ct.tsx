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
import { resolvedTokenColor } from "../../../support/ct/resolved-token-color.ts";
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

test("FieldValidity exposes the raw validity state as a render-prop", async ({ mount, page }) => {
  // The render-prop itself is defined in the fixture, not inline here — Playwright CT proxies
  // inline children-callback props back to Node (event-style), it does not render their JSX
  // return value in-browser (see field-validity.fixtures.tsx).
  await mount(<FieldValidityStory />);
  const input = page.getByLabel("Age");
  await input.fill("13");
  await expect(page.getByText("field is invalid", { exact: true })).toBeVisible();
});
