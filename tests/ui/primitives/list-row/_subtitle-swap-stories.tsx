import { CtIsolation } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import type { ReactElement } from "react";

/** A clickable row whose subtitle yields to a reveal line in the same grid cell. */
export function SubtitleSwapStory(): ReactElement {
  return (
    <CtIsolation subject="ListRow subtitle swap" isolates="Which pointer and focus states swap the subtitle for its reveal line">
      <Container style={{ inlineSize: 320 }}>
        <ListRow clickable={true} subtitle="Tag line" subtitleReveal="Handle line" title="Swap row" />
      </Container>
    </CtIsolation>
  );
}
