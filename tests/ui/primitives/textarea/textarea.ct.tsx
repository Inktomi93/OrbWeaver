// CT: the textarea seal — a multi-line control that accepts input and wears the token skin
// (border-border oklch) plus native field-sizing autosize.
import { Field } from "@orb/ui/field";
import { Textarea } from "@orb/ui/textarea";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../../support/ct/resolved-token-color.ts";
import { ValueChangeDetailsStory } from "./textarea.fixtures.tsx";

const NON_EMPTY = /.+/u;

// `onValueChange` is Field.Control's native change arm: (value, eventDetails). The eventDetails
// object is what makes `cancel()` / `allowPropagation()` reachable, and it is exactly what a
// hand-spelled `(value: string) => void` seal signature silently deletes.
test("onValueChange delivers Base UI's eventDetails alongside the value", async ({ mount, page }) => {
  await mount(<ValueChangeDetailsStory />);
  await expect(page.getByTestId("details-readout")).toHaveText("no-change-yet");
  await page.getByRole("textbox").fill("hello");
  await expect(page.getByTestId("details-readout")).toHaveText("hello|none|cancellable");
});

test("inside a <Field>, the label associates with the textarea (Field.Control registration)", async ({ mount, page }) => {
  await mount(
    <Field label="Bio" description="A short blurb">
      <Textarea />
    </Field>,
  );
  // getByLabel resolves only if the label's htmlFor points at the textarea's id — i.e. the control
  // registered with the Field context (a plain <textarea> would fail this).
  const control = page.getByLabel("Bio");
  await expect(control).toBeVisible();
  await control.fill("hello");
  await expect(control).toHaveValue("hello");
  await expect(control).toHaveAttribute("aria-describedby", NON_EMPTY);
});

test("accepts multi-line input", async ({ mount, page }) => {
  await mount(<Textarea aria-label="Scene" placeholder="Describe the scene…" />);
  const control = page.getByRole("textbox");
  await control.fill("A tavern at dusk.\nRain on the shutters.");
  await expect(control).toHaveValue("A tavern at dusk.\nRain on the shutters.");
});

test("inside an invalid <Field>, data-invalid lands and the border swaps to destructive", async ({ mount, page }) => {
  await mount(
    <Field error="Required" label="Bio">
      <Textarea />
    </Field>,
  );
  const control = page.getByRole("textbox");
  // Base UI Field.Control marks the control invalid — the seal keys its skin off data-invalid.
  await expect(control).toHaveAttribute("data-invalid", "");
  await expect(control).toHaveCSS("border-top-color", resolvedTokenColor("color.destructive"));
});

test("wears the token skin and autosizes to content", async ({ mount, page }) => {
  await mount(<Textarea aria-label="Scene" />);
  const control = page.getByRole("textbox");
  const border = await control.evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(border).toContain("oklch");
  const sizing = await control.evaluate((el) => getComputedStyle(el).fieldSizing);
  expect(sizing).toBe("content");
});

test("disabled blocks input and drops the interactive skin", async ({ mount, page }) => {
  await mount(<Textarea aria-label="Scene" disabled={true} />);
  const control = page.getByRole("textbox");
  await expect(control).toBeDisabled();
  await expect(control).toHaveCSS("opacity", "0.5");
});

// field-sizing: content makes the browser ignore `rows` for sizing — an empty rows={3} field would
// collapse to a single line without the rows-floor min-height re-establishing "at least 3 lines".
// The OTHER half of the same law: `rows` floors, `maxRows` ceilings. Without a ceiling the autosize is
// unbounded, and a long-but-legal value (a capped 4500-char prose override) rendered a 2333px control that
// pushed its own counter/error/save-status off the fold — the affordances that state the cap, hidden by the
// value the cap is about (side-eye PROSE-LIMIT P1).
test("maxRows caps the autosize and the overflow becomes the field's OWN scroll", async ({ mount, page }) => {
  const long = `${"a paragraph that will certainly wrap several times over. ".repeat(60)}`;
  await mount(<Textarea aria-label="Scene" defaultValue={long} maxRows={6} rows={3} />);
  const control = page.getByRole("textbox");
  const measured = await control.evaluate((el: HTMLTextAreaElement) => ({
    lineHeight: Number.parseFloat(getComputedStyle(el).lineHeight),
    client: el.clientHeight,
    content: el.scrollHeight,
    overflowY: getComputedStyle(el).overflowY,
  }));
  // The ceiling is the SAME line-box arithmetic the floor uses (6 lines + block padding + borders), so it is
  // asserted against the resolved line-height rather than a px literal. The +2 lines of slack is the padding
  // + border the formula adds; the point of the assertion is that it is SIX-ish, not sixty.
  expect(measured.client).toBeLessThanOrEqual(measured.lineHeight * 8);
  // Not a clip: every byte is still reachable inside the control.
  expect(measured.content).toBeGreaterThan(measured.client);
  expect(measured.overflowY).toBe("auto");
});

test("rows sets a min-height floor under field-sizing: content", async ({ mount, page }) => {
  await mount(<Textarea aria-label="Scene" rows={3} />);
  const control = page.getByRole("textbox");
  const singleLineHeight = await control.evaluate((el) => Number.parseFloat(getComputedStyle(el).lineHeight));
  const minHeight = await control.evaluate((el) => Number.parseFloat(getComputedStyle(el).minHeight));
  // Empty content collapses under field-sizing: content, so the rendered height IS the floor.
  const box = await control.boundingBox();
  expect(minHeight).toBeGreaterThanOrEqual(singleLineHeight * 3);
  expect(box?.height).toBeGreaterThanOrEqual(minHeight - 1);
});
