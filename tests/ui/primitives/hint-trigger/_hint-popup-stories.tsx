import { CtIsolation } from "@orb/testkit/browser";
import { HintTrigger } from "@orb/ui/hint-trigger";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

/** A label with its hint beside it, the way a field or a section heading seats the trigger. */
export function HintBesideLabelStory({ subject, hint }: { readonly subject: string; readonly hint: string }): ReactElement {
  return (
    <CtIsolation subject="HintTrigger" isolates="The hint popup's text at enlarged text, without the field or heading the hint annotates">
      <Row align="center" gap="field">
        <Text>{subject}</Text>
        <HintTrigger hint={hint} subject={subject} />
      </Row>
    </CtIsolation>
  );
}
