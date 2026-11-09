import { DestructiveAction } from "@orb/client/components";
import { createEntityMutation, useInvalidation, useTRPC } from "@orb/client/data";
import { CtClientProviders } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";

// The production factory over a real write, shaped like a confirm-class consumer: a toast-class hook whose one consumer
// declares the confirm's alert line, so the confirm owns every failure surface.
const useProbeWrite = createEntityMutation<{ readonly partial: { readonly promptCacheMinDepth: number } }, unknown>({
  options: (trpc) => trpc.settings.updateAppSettings.mutationOptions(),
  invalidates: () => [],
  errorToast: "Couldn't save the setting.",
});

function ProbeConfirm(): ReactElement {
  const save = useProbeWrite({ trpc: useTRPC(), invalidation: useInvalidation(), failureShownInline: "the probe confirm's alert line" });
  return (
    <DestructiveAction
      confirm={{ confirmLabel: "Write it", title: "Write the setting?" }}
      onConfirm={(): Promise<void> => save.mutateAsync({ partial: { promptCacheMinDepth: 1 } }).then(() => undefined)}
      trigger={<Button tone="destructive">Write</Button>}
    />
  );
}

/** A confirm-class consumer under the production providers. */
export function ConfirmFailureStory(): ReactElement {
  return (
    <CtClientProviders>
      <ProbeConfirm />
    </CtClientProviders>
  );
}
