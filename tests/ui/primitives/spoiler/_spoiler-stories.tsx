import type { SeedScopeProps } from "@orb/testkit/browser";
import { CtIsolation, SeedScope } from "@orb/testkit/browser";
import { Card } from "@orb/ui/card";
import { Stack } from "@orb/ui/layout";
import { Spoiler } from "@orb/ui/spoiler";
import { TOKENS, TONES } from "@orb/ui/tokens";
import type { ReactElement } from "react";

/** A layout twin: the same gap on a bare Stack, so the Spoiler's forwarded layout reads against it. */
function Rows(): ReactElement {
  return (
    <div
      style={{
        display: "grid",
        gap: "0.5rem",
        backgroundColor: `var(${TOKENS["color.background"].cssVar})`,
        color: `var(${TOKENS["color.foreground"].cssVar})`,
      }}
    >
      <Stack data-probe="stack" gap="row">
        <span>one</span>
        <span>two</span>
      </Stack>
      <Spoiler data-case="concealed" gap="row" concealed={true}>
        <span>one</span>
        <span>two</span>
      </Spoiler>
      <Spoiler data-case="revealed" gap="row" concealed={false}>
        <span>one</span>
        <span>two</span>
      </Spoiler>
      {TONES.map((tone) => (
        <Card key={tone} data-case={`card-${tone}`} tone={tone} variant="soft">
          <Spoiler data-case={`spoiler-${tone}`} gap="row" concealed={true}>
            <span>{`${tone} hidden`}</span>
          </Spoiler>
        </Card>
      ))}
    </div>
  );
}

export function SpoilerStory(props: SeedScopeProps): ReactElement {
  return (
    <CtIsolation subject="Spoiler" isolates="A concealed and a revealed Spoiler beside a Stack twin, and a concealed Spoiler inside a Card of every tone">
      <SeedScope {...props}>
        <Rows />
      </SeedScope>
    </CtIsolation>
  );
}
