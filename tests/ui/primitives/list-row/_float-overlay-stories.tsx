import { CtIsolation } from "@orb/testkit/browser";
import { GlyphButton } from "@orb/ui/glyph-button";
import { Icon, Pencil, Trash } from "@orb/ui/icons";
import { Container } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import type { ReactElement } from "react";

/** Two clickable rows whose hover-revealed actions float over the row body on a fine pointer, or stay in flow. */
export function FloatOverlayStory({ float }: { readonly float: boolean }): ReactElement {
  const actions = (
    <>
      <GlyphButton aria-label="Rename row" glyph="sm" variant="ghost">
        <Icon icon={Pencil} size="sm" />
      </GlyphButton>
      <GlyphButton aria-label="Delete row" glyph="sm" variant="ghost">
        <Icon icon={Trash} size="sm" />
      </GlyphButton>
    </>
  );
  return (
    <CtIsolation subject="ListRow floated actions" isolates="Where a floated action cluster lies over its own row body">
      <Container style={{ inlineSize: 320 }}>
        <ListRow actions={actions} actionsFloat={float} className="group" clickable={true} subtitle="A subtitle under the title" title="First row" />
        <ListRow actions={actions} actionsFloat={float} className="group" clickable={true} subtitle="A subtitle under the title" title="Second row" />
      </Container>
    </CtIsolation>
  );
}
