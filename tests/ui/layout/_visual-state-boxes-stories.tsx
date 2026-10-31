import { CtIsolation } from "@orb/testkit/browser";
import { CurrentGrid, CurrentStack } from "@orb/ui/current";
import { FocalSection } from "@orb/ui/focal-section";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ThemeScope } from "@orb/ui/theme-scope";
import { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import type { ReactElement, ReactNode } from "react";

interface StoryProps {
  readonly theme?: keyof typeof SEED_THEME_VALUE_SETS;
  readonly background?: string;
}

/** The page ground under a seed palette and an optional nested custom scope, so a skin resolves against both. */
function Ground({ theme, background, children }: StoryProps & { readonly children: ReactNode }): ReactElement {
  const ambient = theme === undefined ? undefined : SEED_THEME_VALUE_SETS[theme].vars;
  return (
    <div data-theme={theme} style={{ backgroundColor: "var(--color-background)", color: "var(--color-foreground)", padding: "1rem" }}>
      {background === undefined ? (
        children
      ) : (
        <ThemeScope
          tokens={{ background }}
          {...(ambient === undefined ? {} : { ambientBackground: ambient["--color-background"], ambientAccent: ambient["--color-primary"] })}
        >
          {children}
        </ThemeScope>
      )}
    </div>
  );
}

/** A FocalSection with the focal on and off beside a plain Section, and the neutral probe that names the page ground. */
export function FocalSectionStory(props: StoryProps): ReactElement {
  return (
    <CtIsolation subject="FocalSection" isolates="A focal and an unfocal FocalSection beside a plain Section, under a seed palette and a nested custom scope">
      <Ground {...props}>
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
          <span data-probe="speaker" style={{ color: "var(--color-speaker)" }}>
            speaker
          </span>
        </Stack>
      </Ground>
    </CtIsolation>
  );
}

/** The aria-current boxes at rest and current, and a bare Stack and Grid for the geometry they must keep. */
export function CurrentBoxesStory(props: StoryProps): ReactElement {
  return (
    <CtIsolation subject="CurrentStack and CurrentGrid" isolates="A current and a resting CurrentStack and CurrentGrid beside their bare twins">
      <Ground {...props}>
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
          <Stack data-probe="tint" data-tone="neutral" style={{ backgroundColor: "var(--color-tone-tint-active)" }}>
            tint
          </Stack>
        </Stack>
      </Ground>
    </CtIsolation>
  );
}

/** A tone-stamped divider on a Row and a Stack, a plain divider, and a colour probe under the same stamp. */
export function DividerToneStory(props: StoryProps): ReactElement {
  return (
    <CtIsolation subject="Divider tone stamp" isolates="A primary and a warning divider on a Row and a Stack beside an unstamped one">
      <Ground {...props}>
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
          <Row data-case="probe-primary" tone="primary" style={{ borderStyle: "solid", borderColor: "var(--color-tone-solid)" }}>
            probe
          </Row>
          <Row data-case="probe-warning" tone="warning" style={{ borderStyle: "solid", borderColor: "var(--color-tone-solid)" }}>
            probe
          </Row>
        </Stack>
      </Ground>
    </CtIsolation>
  );
}
