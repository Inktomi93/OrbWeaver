import { CtIsolation } from "@orb/testkit/browser";
import { ListRow } from "@orb/ui/list-row";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";

/** A disclosure row with a switch in its actions, a state line in its detail and the set-state rail, beside a row without the rail. */
export function DisclosureRowStory({ title, detail, panel }: { readonly title: string; readonly detail: string; readonly panel: string }): ReactElement {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(false);
  return (
    <CtIsolation
      subject="ListRow expand"
      isolates="The disclosure row's toggle, its actions sibling, its detail description and its rail, without a feature around it"
    >
      <ListRow
        title={title}
        rail="primary"
        detail={<Text as="span">{detail}</Text>}
        actions={<Switch aria-label={`${title} on`} checked={on} onCheckedChange={setOn} />}
        expand={{ open, onOpenChange: setOpen, panel: <Text>{panel}</Text> }}
      />
      <ListRow title={`${title} unset`} expand={{ open: false, onOpenChange: (): void => undefined, panel: <Text>{panel}</Text> }} />
    </CtIsolation>
  );
}
