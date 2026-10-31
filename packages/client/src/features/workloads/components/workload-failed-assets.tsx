// Names the images an index run could not read, so the owner knows which pictures to re-upload. An asset resolves to the
// character whose avatar it is through the by-ids name read; one the viewer's library does not hold shows by its id.

import { CHARACTER_AVATAR_NAMES_MAX_IDS } from "@orb/contracts/character";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { useGatedQuery, useTRPC } from "#data";

type WorkloadItem = inferOutput<Trpc["workloads"]["list"]>[number];

export function WorkloadFailedAssets({ workload }: { readonly workload: WorkloadItem }): ReactElement | null {
  const trpc = useTRPC();
  const failed = !workload.poison && workload.kind === "index" && workload.status === "succeeded" ? (workload.result?.failedAssets ?? []) : [];
  const avatarNames = useGatedQuery(failed.length === 0 ? null : failed.slice(0, CHARACTER_AVATAR_NAMES_MAX_IDS), (assetIds) =>
    trpc.character.namesByAvatarAssets.queryOptions({ assetIds }),
  );
  if (failed.length === 0) {
    return null;
  }
  const characterByAvatar = new Map<string, string>();
  for (const { assetId, name } of avatarNames.data ?? []) {
    if (!characterByAvatar.has(assetId)) {
      characterByAvatar.set(assetId, name);
    }
  }
  const names = failed.map((assetId) => {
    const character = characterByAvatar.get(assetId);
    return character === undefined ? `image ${assetId}` : `${character}'s avatar`;
  });
  return (
    <Text tone="warning" voice="gloss">
      Stored file missing or unreadable for {names.join(", ")}. Upload the picture again to index it.
    </Text>
  );
}
