import { createEntityMutation, useInvalidation, useTRPC } from "@orb/client/data";
import { CtClientProviders } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

// The production factory over a real write, shaped like a settings section's: a toast, and a section that also renders its own error.
const useProbeWrite = createEntityMutation<{ readonly partial: { readonly promptCacheMinDepth: number } }, unknown>({
  options: (trpc) => trpc.settings.updateAppSettings.mutationOptions(),
  invalidates: () => [],
  errorToast: "Couldn't save the setting.",
});

function Writes(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const save = useProbeWrite({ trpc, invalidation });
  const [secondSaved, setSecondSaved] = useState(false);
  return (
    <Stack>
      <Button onClick={(): void => save.mutate({ partial: { promptCacheMinDepth: 1 } })}>Write first</Button>
      <Button onClick={(): void => save.mutate({ partial: { promptCacheMinDepth: 2 } }, { onSuccess: (): void => setSecondSaved(true) })}>Write second</Button>
      <output aria-label="Second write">{secondSaved ? "Saved" : "Not saved"}</output>
      <Button onClick={save.clearError}>Clear error</Button>
    </Stack>
  );
}

/** A write under the production providers: writes from one mounted section. */
export function SupersededWritesStory(): ReactElement {
  return (
    <CtClientProviders>
      <Writes />
    </CtClientProviders>
  );
}
