import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Container } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import type { ReactElement } from "react";

/** One row of a pane of a fixed width whose action controls are passed bare, as the slot's own children, with no wrapper or class from the call site. */
export function ActionsStory({ width, labels }: { readonly width: number; readonly labels: readonly string[] }): ReactElement {
  return (
    <CtIsolation subject="ListRow actions" isolates="Where a row's action controls sit and wrap when they cannot share a line with the row body">
      <Container style={{ inlineSize: width }}>
        <ListRow
          actions={labels.map((label) => (
            <Button key={label} variant="ghost">
              {label}
            </Button>
          ))}
          subtitle="A subtitle under the title"
          title="First row"
        />
      </Container>
    </CtIsolation>
  );
}
