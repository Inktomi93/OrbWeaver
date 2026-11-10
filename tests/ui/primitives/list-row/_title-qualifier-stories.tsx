import { CtIsolation } from "@orb/testkit/browser";
import { Badge } from "@orb/ui/badge";
import { Container } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import type { ReactElement } from "react";

const SHORT_QUALIFIER = "2d";
const LONG_QUALIFIER = "Jun 15, 2025, 04:09 PM · #1 · Keeper of the Orbital Loom, companion to the Ninth Epoch";

/** A short-qualified and a long-qualified row, each with the same markers, in a pane of a fixed width. */
export function TitleQualifierStory({ width }: { readonly width: number }): ReactElement {
  const markers = (
    <Badge size="sm" tone="neutral">
      Game
    </Badge>
  );
  return (
    <CtIsolation subject="ListRow title qualifier" isolates="Where the title line wraps its qualifier and markers needs no application services.">
      <Container style={{ inlineSize: width }}>
        <ListRow markers={markers} title="Pamela" titleQualifier={SHORT_QUALIFIER} />
        <ListRow markers={markers} title="Pamela" titleQualifier={LONG_QUALIFIER} />
      </Container>
    </CtIsolation>
  );
}
