// Probe for the inline-flank-fit CT (CT mounts from a non-test module): two readers of the one store beside two
// buttons that publish the room's verdict, the way the room does.
import { publishInlineFlankFit, useInlineFlankFits } from "@orb/client/lib";
import type { ReactElement } from "react";

function Reader({ name }: { readonly name: string }): ReactElement {
  return <output aria-label={name}>{String(useInlineFlankFits())}</output>;
}

export function InlineFlankFitProbe(): ReactElement {
  return (
    <>
      <Reader name="inline host" />
      <Reader name="header host" />
      <button onClick={(): void => publishInlineFlankFit(false)} type="button">
        Room narrows
      </button>
      <button onClick={(): void => publishInlineFlankFit(true)} type="button">
        Room widens
      </button>
    </>
  );
}
