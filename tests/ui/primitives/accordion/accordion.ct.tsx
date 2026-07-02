// CT: the accordion seal — a section opens on click AND via keyboard (Enter on the focused trigger),
// exposing aria-expanded and revealing its panel. Base UI owns the roving nav + single-open logic.
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
