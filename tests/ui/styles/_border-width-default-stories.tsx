import { CtIsolation } from "@orb/testkit/browser";
import { Stack } from "@orb/ui/layout";
import { TOKENS } from "@orb/ui/tokens";
import type { CSSProperties, ReactElement } from "react";

const DEFAULT_VAR = TOKENS["border-width.default"].cssVar;

function PlainEdges({ scope }: { readonly scope: string }): ReactElement {
  return (
    <div data-scope={scope}>
      <div className="border border-solid" data-probe="border" />
      <div className="border-s border-solid" data-probe="border-s" />
      <div className="divide-x divide-solid">
        <span data-probe="divide-first" />
        <span data-probe="divide-second" />
      </div>
      <div className="ring" data-probe="ring" />
      <Stack divider="start" data-probe="divider" />
      <Stack divider="start" dividerWeight="rule" data-probe="divider-rule" />
      <div className="border-hairline border-solid" data-probe="hairline" />
    </div>
  );
}

/** The same plain edges twice: once under the shipped default step, once under a retuned one. */
export function BorderWidthDefaultStory({ retunedPx }: { readonly retunedPx: number }): ReactElement {
  const retuned: CSSProperties & { readonly [Name in typeof DEFAULT_VAR]: string } = { [DEFAULT_VAR]: `${retunedPx}px` };
  return (
    <CtIsolation subject="Plain border and ring widths" isolates="Utilities that name no step, with only the default border-width token varied">
      <PlainEdges scope="shipped" />
      <div style={retuned}>
        <PlainEdges scope="retuned" />
      </div>
    </CtIsolation>
  );
}
