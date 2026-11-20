import { CtIsolation } from "@orb/testkit/browser";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { HintTrigger } from "@orb/ui/hint-trigger";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

/** A panel, open at first, whose first and last rows are a label with its inline hint, flush with the panel's block edges. */
export function HintClipEdgeStory({ subject, keepMounted = false }: { readonly subject: string; readonly keepMounted?: boolean }): ReactElement {
  return (
    <CtIsolation subject="HintTrigger" isolates="The inline hint trigger's box against a clipping panel's block edges, without a feature around it">
      <Collapsible defaultOpen={true}>
        <CollapsibleTrigger>Options</CollapsibleTrigger>
        <CollapsiblePanel keepMounted={keepMounted}>
          <Stack gap="field">
            <Row gap="field" data-probe="first">
              <Text voice="label">{subject}</Text>
              <HintTrigger hint="Make words more or less likely." subject={subject} />
            </Row>
            <Text as="p">Each entry nudges one word.</Text>
            <Row gap="field" data-probe="last">
              <Text voice="label">{subject}</Text>
              <HintTrigger hint="Make words more or less likely." subject={subject} />
            </Row>
          </Stack>
        </CollapsiblePanel>
      </Collapsible>
    </CtIsolation>
  );
}
