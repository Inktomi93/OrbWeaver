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

const DATE_QUALIFIER = "Jun 15, 2025, 04:06 PM";
const SHORT_NAME = "Keeper";
const LONG_NAME = "The long vigil kept at the Ninth Epoch's orbital loom, told in full for whoever asks";

/** A short name and a long one beside the same date qualifier, and the short name alone, in a pane of a fixed width. */
export function NameFitStory({ width }: { readonly width: number }): ReactElement {
  return (
    <CtIsolation subject="ListRow title floor" isolates="Whether a name shares its line with a qualifier needs no application services.">
      <Container style={{ inlineSize: width }}>
        <ListRow title={SHORT_NAME} titleQualifier={DATE_QUALIFIER} />
        <ListRow title={LONG_NAME} titleQualifier={DATE_QUALIFIER} />
        <ListRow title={SHORT_NAME} />
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

/** Clickable rows that each carry a trailing datum: two of one name told apart by it, one plain, and two inline-placed rows with and
 *  without a subtitle, in a pane of a fixed width. */
export function MetaSlotStory({ width }: { readonly width: number }): ReactElement {
  return (
    <CtIsolation subject="ListRow meta slot" isolates="Where a row's trailing datum sits and what it names needs no application services.">
      <Container style={{ inlineSize: width }}>
        <ListRow clickable={true} meta="2h" metaQualifiesTitle={true} onClick={(): void => undefined} title="Chat with Eleni" />
        <ListRow clickable={true} meta="3w" metaQualifiesTitle={true} onClick={(): void => undefined} title="Chat with Eleni" />
        <ListRow clickable={true} meta="5d" onClick={(): void => undefined} title="Aveline" />
        <ListRow clickable={true} meta="#1" onClick={(): void => undefined} subtitle="A gloss" subtitlePlacement="inline" title="Keeper" />
        <ListRow clickable={true} meta="#2" onClick={(): void => undefined} subtitlePlacement="inline" title="Warden" />
      </Container>
    </CtIsolation>
  );
}

const WRAPPING_STAMP = "Oct 5, 2026, 07:57 AM";

/** A clickable row whose stamp tells it from a same-titled sibling and runs past the line, in a pane of a fixed width. */
export function WrappedStampStory({ width }: { readonly width: number }): ReactElement {
  return (
    <CtIsolation subject="ListRow meta slot" isolates="Where a wrapped stamp's lines sit needs no application services.">
      <Container style={{ inlineSize: width }}>
        <ListRow clickable={true} meta={WRAPPING_STAMP} metaQualifiesTitle={true} onClick={(): void => undefined} title="Chat with Eleni" />
      </Container>
    </CtIsolation>
  );
}
