import type { SeedScopeProps } from "@orb/testkit/browser";
import { CtIsolation, SeedScope } from "@orb/testkit/browser";
import { CurrentGrid, CurrentStack } from "@orb/ui/current";
import { FocalSection } from "@orb/ui/focal-section";
import { Row, Section, Stack } from "@orb/ui/layout";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

/** A FocalSection with the focal on and off beside a plain Section, and the neutral probe that names the page ground. */
export function FocalSectionStory(props: SeedScopeProps): ReactElement {
  return (
    <CtIsolation subject="FocalSection" isolates="A focal and an unfocal FocalSection beside a plain Section, under a seed palette and a nested custom scope">
      <SeedScope {...props}>
        <Stack gap="block">
          <FocalSection data-case="focal" heading="Focal">
            on
          </FocalSection>
          <FocalSection data-case="unfocal" focal={false} heading="Unfocal">
            off
          </FocalSection>
          <Section data-case="plain" heading="Plain">
            plain
          </Section>
          <span data-probe="speaker" style={{ color: `var(${TOKENS["color.speaker"].cssVar})` }}>
            speaker
          </span>
        </Stack>
      </SeedScope>
    </CtIsolation>
  );
}

/** The aria-current boxes at rest and current, and a bare Stack and Grid for the geometry they must keep. */
export function CurrentBoxesStory(props: SeedScopeProps): ReactElement {
  return (
    <CtIsolation subject="CurrentStack and CurrentGrid" isolates="A current and a resting CurrentStack and CurrentGrid beside their bare twins">
      <SeedScope {...props}>
        <Stack gap="block">
          <CurrentStack aria-current="true" data-case="stack-current" gap="row">
            <span>one</span>
            <span>two</span>
          </CurrentStack>
          <CurrentStack data-case="stack-rest" gap="row">
            <span>one</span>
            <span>two</span>
          </CurrentStack>
          <Stack data-probe="stack" gap="row">
            <span>one</span>
            <span>two</span>
          </Stack>
          <CurrentGrid aria-current="true" data-case="grid-current" gap="row">
            <span>one</span>
            <span>two</span>
          </CurrentGrid>
          <CurrentGrid data-case="grid-rest" gap="row">
            <span>one</span>
            <span>two</span>
          </CurrentGrid>
          <Stack data-probe="tint" data-tone="neutral" style={{ backgroundColor: `var(${TOKENS["color.tone-tint-active"].cssVar})` }}>
            tint
          </Stack>
          <span data-probe="tight" style={{ display: "block", inlineSize: `var(${TOKENS["spacing.tight"].cssVar})` }} />
          <span
            data-probe="ring"
            style={{ display: "block", blockSize: "1rem", inlineSize: "2rem", backgroundColor: `var(${TOKENS["color.input-border"].cssVar})` }}
          />
          <span
            data-probe="ground"
            style={{ display: "block", blockSize: "1rem", inlineSize: "2rem", backgroundColor: `var(${TOKENS["color.background"].cssVar})` }}
          />
        </Stack>
      </SeedScope>
    </CtIsolation>
  );
}

/** A tone-stamped divider on a Row and a Stack, a plain divider, and a colour probe under the same stamp. */
export function DividerToneStory(props: SeedScopeProps): ReactElement {
  return (
    <CtIsolation subject="Divider tone stamp" isolates="A primary and a warning divider on a Row and a Stack beside an unstamped one">
      <SeedScope {...props}>
        <Stack gap="block">
          <Row data-case="row-primary" divider="start" dividerWeight="rule" tone="primary">
            primary
          </Row>
          <Stack data-case="stack-warning" divider="start" dividerWeight="rule" tone="warning">
            warning
          </Stack>
          <Row data-case="row-plain" divider="start" dividerWeight="rule">
            plain
          </Row>
          <Row data-case="probe-primary" tone="primary" style={{ borderStyle: "solid", borderColor: `var(${TOKENS["color.tone-solid"].cssVar})` }}>
            probe
          </Row>
          <Row data-case="probe-warning" tone="warning" style={{ borderStyle: "solid", borderColor: `var(${TOKENS["color.tone-solid"].cssVar})` }}>
            probe
          </Row>
        </Stack>
      </SeedScope>
    </CtIsolation>
  );
}
