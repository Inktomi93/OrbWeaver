import { CtIsolation } from "@orb/testkit/browser";
import { Stack } from "@orb/ui/layout";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

/** The parts of the two sums and the sums themselves, measured in one scope. */
function Probes({ scope }: { readonly scope: string }): ReactElement {
  return (
    <>
      <Stack height="control" data-probe={`${scope}-control`} />
      <Stack paddingBlockStart="row" data-probe={`${scope}-row`} />
      <Stack paddingBlockStart="clearance" data-probe={`${scope}-clearance`} />
      <div style={{ inlineSize: `var(${TOKENS["dimension.content-reading-floor"].cssVar})` }} data-probe={`${scope}-floor`} />
      <Stack width="sidebarSm" data-probe={`${scope}-sidebar`} />
      <Stack paddingInline="block" data-probe={`${scope}-block`} />
      <Stack width="flankFit" data-probe={`${scope}-flank-fit`} />
    </>
  );
}

/** The sums outside any density scope, inside a compact one and inside a comfortable one nested under it. */
export function DensitySumsStory(): ReactElement {
  return (
    <CtIsolation
      subject="The control clearance and the flank fit under a density scope"
      isolates="Stack probes of each sum and of its parts, in the root scope and in density scopes"
    >
      <Probes scope="root" />
      <div data-density="compact">
        <Probes scope="compact" />
        <div data-density="comfortable">
          <Probes scope="restored" />
        </div>
      </div>
    </CtIsolation>
  );
}
