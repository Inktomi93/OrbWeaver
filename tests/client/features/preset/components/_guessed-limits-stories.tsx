import { PresetEditorSurface } from "@orb/client/features/preset";
import { useActiveConfigGroup, useRequestedConnectionEditor } from "@orb/client/state";
import type { PresetId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { GUESSED_LIMITS_PROBE } from "./_guessed-limits-probe.ts";

/** Where the app's navigation state points: the config group in front, and the connection editor a door asked for. */
function NavigationProbe(): ReactElement {
  const group = useActiveConfigGroup();
  const requested = useRequestedConnectionEditor();
  return (
    <>
      <output aria-label={GUESSED_LIMITS_PROBE.group}>{group ?? ""}</output>
      <output aria-label={GUESSED_LIMITS_PROBE.editor}>{requested === null ? "" : `${requested.connectionId} ${String(requested.openAdvanced)}`}</output>
    </>
  );
}

/** The preset editor beside a read of the navigation state its doors write. */
export function GuessedLimitsPresetStory({ presetId }: { readonly presetId: PresetId }): ReactElement {
  return (
    <CtClientProviders>
      <Stack className="h-screen">
        <NavigationProbe />
        <Container className="h-full min-h-0">
          <PresetEditorSurface presetId={presetId} />
        </Container>
      </Stack>
    </CtClientProviders>
  );
}
