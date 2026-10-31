import { CtIsolation } from "@orb/testkit/browser";
import { Card } from "@orb/ui/card";
import { Stack } from "@orb/ui/layout";
import { Spoiler } from "@orb/ui/spoiler";
import { ThemeScope } from "@orb/ui/theme-scope";
import { SEED_THEME_VALUE_SETS, TONES } from "@orb/ui/tokens";
import type { ReactElement } from "react";

/** A layout twin: the same gap on a bare Stack, so the Spoiler's forwarded layout reads against it. */
function Rows(): ReactElement {
  return (
    <div style={{ display: "grid", gap: "0.5rem", backgroundColor: "var(--color-background)", color: "var(--color-foreground)" }}>
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

/** A Spoiler beside its Stack twin and inside a Card of every tone, under a seed palette and an optional nested custom scope. */
export function SpoilerStory({ theme, background }: { readonly theme?: keyof typeof SEED_THEME_VALUE_SETS; readonly background?: string }): ReactElement {
  const ambient = theme === undefined ? undefined : SEED_THEME_VALUE_SETS[theme].vars;
  return (
    <CtIsolation subject="Spoiler" isolates="A concealed and a revealed Spoiler beside a Stack twin, and a concealed Spoiler inside a Card of every tone">
      <div data-theme={theme} style={{ backgroundColor: "var(--color-background)", padding: "1rem" }}>
        {background === undefined ? (
          <Rows />
        ) : (
          <ThemeScope
            tokens={{ background }}
            {...(ambient === undefined ? {} : { ambientBackground: ambient["--color-background"], ambientAccent: ambient["--color-primary"] })}
          >
            <Rows />
          </ThemeScope>
        )}
      </div>
    </CtIsolation>
  );
}
