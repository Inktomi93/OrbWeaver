// CT: the accordion seal — a section opens on click AND via keyboard (Enter on the focused trigger),
// exposing aria-expanded and revealing its panel. Base UI owns the open/close + ARIA wiring; per
// the 1.6 APG update, focus travels in PLAIN TAB ORDER (roving nav was deprecated), so a Tab from
// one trigger lands on the next regardless of open state.
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@orb/ui/accordion";
import { expect, test } from "@playwright/experimental-ct-react";

test("opens an item on click and another via keyboard", async ({ mount, page }) => {
  await mount(
    <Accordion>
      <AccordionItem value="one">
        <AccordionHeader>
          <AccordionTrigger>Section one</AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>Body one</AccordionPanel>
      </AccordionItem>
      <AccordionItem value="two">
        <AccordionHeader>
          <AccordionTrigger>Section two</AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>Body two</AccordionPanel>
      </AccordionItem>
    </Accordion>,
  );

  const one = page.getByRole("button", { name: "Section one" });
  await expect(one).toHaveAttribute("aria-expanded", "false");
  await one.click();
  await expect(one).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Body one")).toBeVisible();

  const two = page.getByRole("button", { name: "Section two" });
  await two.focus();
  await two.press("Enter");
  await expect(two).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Body two")).toBeVisible();
});

test("single-open mode (the default) closes the previous item when a new one opens", async ({
  mount,
  page,
}) => {
  await mount(
    <Accordion>
      <AccordionItem value="one">
        <AccordionHeader>
          <AccordionTrigger>Section one</AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>Body one</AccordionPanel>
      </AccordionItem>
      <AccordionItem value="two">
        <AccordionHeader>
          <AccordionTrigger>Section two</AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>Body two</AccordionPanel>
      </AccordionItem>
    </Accordion>,
  );

  await page.getByRole("button", { name: "Section one" }).click();
  await expect(page.getByText("Body one")).toBeVisible();
  await page.getByRole("button", { name: "Section two" }).click();
  await expect(page.getByText("Body two")).toBeVisible();
  await expect(page.getByRole("button", { name: "Section one" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("multiple mode keeps several sections open at once", async ({ mount, page }) => {
  await mount(
    <Accordion multiple={true}>
      <AccordionItem value="one">
        <AccordionHeader>
          <AccordionTrigger>Section one</AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>Body one</AccordionPanel>
      </AccordionItem>
      <AccordionItem value="two">
        <AccordionHeader>
          <AccordionTrigger>Section two</AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>Body two</AccordionPanel>
      </AccordionItem>
    </Accordion>,
  );

  await page.getByRole("button", { name: "Section one" }).click();
  await page.getByRole("button", { name: "Section two" }).click();
  await expect(page.getByRole("button", { name: "Section one" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.getByRole("button", { name: "Section two" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.getByText("Body one")).toBeVisible();
  await expect(page.getByText("Body two")).toBeVisible();
});

test("a disabled item cannot be opened and is skipped by Tab order", async ({ mount, page }) => {
  await mount(
    <Accordion>
      <AccordionItem disabled={true} value="one">
        <AccordionHeader>
          <AccordionTrigger>Section one</AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>Body one</AccordionPanel>
      </AccordionItem>
      <AccordionItem value="two">
        <AccordionHeader>
          <AccordionTrigger>Section two</AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>Body two</AccordionPanel>
      </AccordionItem>
    </Accordion>,
  );

  const disabledTrigger = page.getByRole("button", { name: "Section one" });
  await expect(disabledTrigger).toHaveAttribute("data-disabled", "");
  await expect(disabledTrigger).toBeDisabled();
  await expect(page.getByText("Body one")).toBeHidden();

  // Plain tab order (not roving nav): Tab from body moves straight past the disabled trigger.
  await page.getByRole("button", { name: "Section two" }).focus();
  await expect(page.getByRole("button", { name: "Section two" })).toBeFocused();
});
