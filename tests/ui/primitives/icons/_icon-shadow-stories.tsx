import type { SeedScopeProps } from "@orb/testkit/browser";
import { CtIsolation, SeedScope } from "@orb/testkit/browser";
import { Icon, Pencil } from "@orb/ui/icons";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

/** A glyph that sits over art, beside a probe that draws the over-art halo token as a drop shadow in the same scope. */
export function IconShadowStory(props: SeedScopeProps): ReactElement {
  return (
    <CtIsolation subject="Icon shadow" isolates="The glyph's legibility halo against the served over-art token, in one seed scope">
      <SeedScope {...props}>
        <span data-case="glyph">
          <Icon shadow={true} icon={Pencil} size="sm" />
        </span>
        <span data-probe="over-art" style={{ display: "block", filter: `drop-shadow(var(${TOKENS["shadow.shell-over-art"].cssVar}))` }} />
      </SeedScope>
    </CtIsolation>
  );
}
