// Names the images an index run could not read, so the owner knows which pictures to re-upload. An asset resolves to the
// character whose avatar it is through the library read; one the viewer's library does not hold shows by its id.

import { CHARACTER_LIST_MAX_LIMIT } from "@orb/contracts/character";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { useGatedQuery, useTRPC } from "#data";

type WorkloadItem = inferOutput<Trpc["workloads"]["list"]>[number];

const LIBRARY_KEY = "failed-asset-library";

export function WorkloadFailedAssets({ workload }: { readonly workload: WorkloadItem }): ReactElement | null {
  const trpc = useTRPC();
  const failed = !workload.poison && workload.kind === "index" && workload.status === "succeeded" ? (workload.result?.failedAssets ?? []) : [];
  const library = useGatedQuery(failed.length === 0 ? null : LIBRARY_KEY, () => trpc.character.list.queryOptions({ limit: CHARACTER_LIST_MAX_LIMIT }));
  if (failed.length === 0) {
    return null;
  }
  const characterByAvatar = new Map<string, string>();
  for (const item of library.data?.items ?? []) {
    if (item.avatarAssetId !== null) {
      characterByAvatar.set(item.avatarAssetId, item.name);
    }
  }
  const names = failed.map((assetId) => {
    const character = characterByAvatar.get(assetId);
    return character === undefined ? `image ${assetId}` : `${character}'s avatar`;
  });
  return (
    <Text tone="warning" voice="gloss">
      Stored file missing for {names.join(", ")}. Upload the picture again to index it.
    </Text>
  );
}
