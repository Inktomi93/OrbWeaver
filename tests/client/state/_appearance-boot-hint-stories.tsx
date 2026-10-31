import type { SeedThemeName } from "@orb/client/state";
import { APPEARANCE_BOOT_AXES, rememberAppearanceBootHint, rememberDataThemeHint, useAppearanceBootHint } from "@orb/client/state";
import { pickKeys } from "@orb/kit/objects";
import { CtClientProviders } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

type BootAxes = Parameters<typeof rememberAppearanceBootHint>[0];

interface BootHintStoryProps {
  /** The appearance axes the authoritative read reports, as plain data from the spec. */
  readonly axes: BootAxes;
  /** The shipped defaults the same axes fall back to. */
  readonly defaults: BootAxes;
  readonly theme: SeedThemeName;
}

function Hint(props: BootHintStoryProps): ReactElement {
  const hint = useAppearanceBootHint();
  return (
    <Stack>
      <output aria-label="Boot hint">{JSON.stringify({ ...pickKeys(hint, APPEARANCE_BOOT_AXES), dataTheme: hint.dataTheme })}</output>
      <Button onClick={(): void => rememberAppearanceBootHint(props.axes)}>Server reports axes</Button>
      <Button onClick={(): void => rememberAppearanceBootHint(props.defaults)}>Server reports default axes</Button>
      <Button onClick={(): void => rememberDataThemeHint(props.theme)}>Server reports seed theme</Button>
      <Button onClick={(): void => rememberDataThemeHint(null)}>Server reports base theme</Button>
    </Stack>
  );
}

/** The device's remembered appearance, read through the production hook and written through the production seams. */
export function AppearanceBootHintStory(props: BootHintStoryProps): ReactElement {
  return (
    <CtClientProviders>
      <Hint {...props} />
    </CtClientProviders>
  );
}
