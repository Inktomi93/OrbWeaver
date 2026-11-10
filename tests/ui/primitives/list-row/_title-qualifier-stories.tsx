import { CtIsolation } from "@orb/testkit/browser";
import { Badge } from "@orb/ui/badge";
import { Container } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import type { ReactElement } from "react";

const SHORT_QUALIFIER = "2d";
const LONG_QUALIFIER = "Jun 15, 2025, 04:09 PM · #1 · Keeper of the Orbital Loom, companion to the Ninth Epoch";
/** Two rows of one name that only their stamp tells apart. */
const PAIR_QUALIFIERS = ["Oct 5, 2026, 07:57 AM · 14 messages", "Oct 5, 2026, 07:58 AM · 14 messages"] as const;

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

/** Two rows with one title, apart only by a stamp that outgrows the line at the phone's enlarged text. */
export function QualifierPairStory({ width }: { readonly width: number }): ReactElement {
  return (
    <CtIsolation subject="ListRow title qualifier" isolates="Whether two rows told apart by their qualifier stay apart needs no application services.">
      <Container style={{ inlineSize: width }}>
        {PAIR_QUALIFIERS.map((qualifier) => (
          <ListRow key={qualifier} title="Chat with Eleni" titleQualifier={qualifier} />
        ))}
      </Container>
    </CtIsolation>
  );
}
