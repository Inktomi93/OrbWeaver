// The Corpus Labels landing (D271): the tag library's own facts — how much of it labels nothing, and how far
// it reaches across each kind of thing. The finder lists the tags; this pane states what no row can.

import { Button } from "@orb/ui/button";
import { Container, Row, Section, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef } from "react";
import { CORPUS_MODE_LABELS, LABELS_BLURB, LABELS_EMPTY, useFocusOnMount, useFocusOnSwap } from "#lib";
import { LabelsSuggestions } from "../components/labels-suggestions.tsx";
import type { TagLibraryFact } from "../hooks/use-tag-library.ts";
import { useTagLibrarySummary } from "../hooks/use-tag-library.ts";
import { LABELS_LIBRARY_SLOT } from "../lib/labels-focus-targets.ts";

/** `returning` marks an in-place swap back from the editor: the control that closed it (Back, merge, delete)
 *  just left the tree, so focus lands here unconditionally. A first arrival keeps the guarded mount focus. */
export function LabelsLibrarySurface({ returning = false }: { readonly returning?: boolean }): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef, !returning);
  useFocusOnSwap(surfaceRef, returning);
  const summary = useTagLibrarySummary();
  return (
    <Container>
      <Stack className="outline-none" data-slot={LABELS_LIBRARY_SLOT} gap="section" ref={surfaceRef} tabIndex={-1}>
        <Stack gap="field">
          <Heading level={2}>{CORPUS_MODE_LABELS.labels}</Heading>
          <Text prose={true} voice="gloss">
            {LABELS_BLURB}
          </Text>
        </Stack>
        <LibraryBody summary={summary} />
        <LabelsSuggestions />
      </Stack>
    </Container>
  );
}

function LibraryBody({ summary }: { readonly summary: ReturnType<typeof useTagLibrarySummary> }): ReactElement {
  if (summary === undefined) {
    return <Skeleton className="h-16 w-full" />;
  }
  // An empty library TEACHES here and offers no second create verb: the finder's band carries the one
  // `New tag`, and one verb on one screen is the ruled count.
  if (summary.count === 0) {
    return (
      <Text prose={true} voice="gloss">
        {LABELS_EMPTY}
      </Text>
    );
  }
  return (
    <Section heading="Library">
      <Stack className="max-w-(--width-content-col)" data-slot="labels-library-facts" gap="field">
        {summary.facts.map((fact: TagLibraryFact) => (
          <Row align="center" gap="field" key={fact.id}>
            <Text as="span" voice="kicker">
              {fact.label}
            </Text>
            <Text as="span" voice="datum">
              {fact.value}
            </Text>
            {fact.open === undefined ? null : (
              <Button className="ms-auto" intent="ghost" onClick={fact.open.run} size="sm" type="button">
                {fact.open.label}
              </Button>
            )}
          </Row>
        ))}
      </Stack>
    </Section>
  );
}
