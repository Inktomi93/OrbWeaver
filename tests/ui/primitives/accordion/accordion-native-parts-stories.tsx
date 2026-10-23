import { CtIsolation } from "@orb/testkit/browser";
import { Accordion, AccordionHeader, AccordionItem, AccordionPanel, AccordionTrigger } from "@orb/ui/accordion";
import type { ReactElement } from "react";

export function AccordionNativePartsStory({ multiple = false }: { readonly multiple?: boolean }): ReactElement {
  return (
    <CtIsolation subject="Accordion" isolates="Native headings, disclosure, tab order and expansion modes">
      <Accordion multiple={multiple}>
        <AccordionItem value="one">
          <AccordionHeader>
            <AccordionTrigger>Section one</AccordionTrigger>
          </AccordionHeader>
          <AccordionPanel>Body one</AccordionPanel>
        </AccordionItem>
        <AccordionItem disabled={true} value="locked">
          <AccordionHeader>
            <AccordionTrigger>Locked section</AccordionTrigger>
          </AccordionHeader>
          <AccordionPanel>Locked body</AccordionPanel>
        </AccordionItem>
        <AccordionItem value="two">
          <AccordionHeader>
            <AccordionTrigger>Section two</AccordionTrigger>
          </AccordionHeader>
          <AccordionPanel>Body two</AccordionPanel>
        </AccordionItem>
      </Accordion>
    </CtIsolation>
  );
}
