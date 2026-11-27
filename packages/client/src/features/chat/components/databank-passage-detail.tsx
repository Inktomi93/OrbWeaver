// The databank readout of the Preview tab's Diagnostics drawer: which documents the next turn retrieved a passage
// from, and where each passage sits in its document's text. Host-only by inheritance: it renders the `AssembleTrace`
// the host-gated `previewAssembly` read returned.

import type { DatabankPassage } from "@orb/contracts/databank";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { databankPassageSpan, databankPassagesHeading } from "../lib/databank-passage-copy.ts";

/** `undefined` or empty ⇒ the turn retrieved no passage, and the section is omitted. */
export function DatabankPassageDetail({ passages }: { readonly passages: readonly DatabankPassage[] | undefined }): ReactElement | null {
  if (passages === undefined || passages.length === 0) {
    return null;
  }
  return (
    <Section heading={<Text voice="kicker">{databankPassagesHeading(passages.length)}</Text>}>
      <Stack gap="field">
        {passages.map((passage) => (
          <Row
            key={`${passage.documentId}:${passage.charStart}`}
            gap="block"
            justify="between"
            align="center"
            data-slot="databank-passage"
            data-document-id={passage.documentId}
            data-char-start={passage.charStart}
            data-char-end={passage.charEnd}
          >
            <Text voice="datum">{passage.documentName}</Text>
            <Text voice="gloss">{databankPassageSpan(passage.charStart, passage.charEnd)}</Text>
          </Row>
        ))}
      </Stack>
    </Section>
  );
}
