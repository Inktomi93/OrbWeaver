// The Corpus Insights CONTEXT-panel BAND identity (north-star §4 N4 / §6.3 / P4) — the Content ↔ Context
// bind: the band names the leaderboard-drilled character (avatar + name), so the Models/Time/Personas tabs
// read as "the detail of the character in Content". Nothing drilled (the dashboard) ⇒ the neutral mode
// identity. Supplied as the Insights mode's `contextHeader` (`insights-mode.tsx`).
//
// The name/avatar come from a plain non-suspending `useQuery` on `character.get` (the sanctioned
// cross-feature tRPC read): the header degrades to a neutral name until the cache populates, and never
// suspends the band on its own account.

import { blobUrl } from "@orb/contracts/assets";
import type { CharacterId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { CORPUS_MODE_LABELS } from "#lib";
import { useSelectedAnalyticsCharacterId } from "#state";

export function AnalyticsContextHeader(): ReactElement {
  const characterId = useSelectedAnalyticsCharacterId();
  if (characterId === null) {
    return (
      <Text voice="label" className="text-muted-foreground">
        {CORPUS_MODE_LABELS.insights}
      </Text>
    );
  }
  return <DrilledCharacterIdentity characterId={characterId} />;
}

function DrilledCharacterIdentity({ characterId }: { readonly characterId: CharacterId }): ReactElement {
  const trpc = useTRPC();
  const { data: character } = useQuery(trpc.character.get.queryOptions({ characterId }));
  const name = character?.name.trim() ?? "";
  const title = name.length > 0 ? name : "Character";
  const avatarHash = character?.avatarHash ?? null;
  return (
    <Row gap="row" align="center" className="min-w-0">
      <Avatar size="sm" fallbackDelay={0} hueSeed={characterId} {...(avatarHash === null ? {} : { src: blobUrl(avatarHash) })}>
        {initialsFor(title)}
      </Avatar>
      <Text className="truncate text-title leading-title font-semibold">{title}</Text>
    </Row>
  );
}
