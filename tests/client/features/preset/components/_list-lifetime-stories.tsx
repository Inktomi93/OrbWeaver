import { useTRPC } from "@orb/client/data";
import { PresetEditorSurface } from "@orb/client/features/preset";
import type { PresetId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import { Stack } from "@orb/ui/layout";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

function PresetRead({ presetId, revision }: { readonly presetId: PresetId; readonly revision: number }): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [settled, setSettled] = useState(0);
  useEffect(() => {
    if (revision !== 0) {
      queryClient
        .invalidateQueries(trpc.preset.get.queryFilter({ id: presetId }))
        .then(() => setSettled(revision))
        .catch(globalThis.reportError);
    }
  }, [presetId, queryClient, revision, trpc]);
  return (
    <>
      <output aria-label="Read revision">{settled}</output>
      <PresetEditorSurface presetId={presetId} />
    </>
  );
}

export function PresetListLifetimeStory({
  presetId,
  revision = 0,
  mounted = true,
  runtimeEpoch = 0,
}: {
  readonly presetId: PresetId;
  readonly revision?: number;
  readonly mounted?: boolean;
  readonly runtimeEpoch?: number;
}): ReactElement {
  return (
    <CtClientProviders key={runtimeEpoch}>
      <Stack className="h-screen">{mounted ? <PresetRead presetId={presetId} revision={revision} /> : null}</Stack>
    </CtClientProviders>
  );
}
