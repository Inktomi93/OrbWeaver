import { CtIsolation } from "@orb/testkit/browser";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { Container } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import type { ReactElement } from "react";

const LONG_NAME = "Calamity, Doomblade of the Ninth Epoch, Keeper of the Orbital Loom";

/** One pane of a fixed width holding a short-named and a long-named row with the same leading element and actions. */
export function TitleFloorStory({ width }: { readonly width: number }): ReactElement {
  const actions = <Button variant="ghost">Edit</Button>;
  const leading = (
    <Avatar fallbackDelay={0} hueSeed="floor" size="sm">
      AB
    </Avatar>
  );
  return (
    <CtIsolation
      subject="ListRow title floor"
      isolates="Where a row wraps its actions: only when padding, leading, the title floor and the actions cannot share a line"
    >
      <Container style={{ inlineSize: width }}>
        <ListRow actions={actions} leading={leading} title="Short" />
        <ListRow actions={actions} leading={leading} title={LONG_NAME} />
      </Container>
    </CtIsolation>
  );
}
