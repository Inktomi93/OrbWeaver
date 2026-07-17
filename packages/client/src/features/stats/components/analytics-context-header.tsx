// The Analytics CONTEXT-panel BAND identity (north-star §4 N4 / §6.3 / P4) — the Content ↔ Context bind:
// the context header names the leaderboard-drilled character (avatar + name), so the Models/Time/Personas
// dimension tabs read as "the detail of the character in Content". Nothing drilled (the overview
// dashboard) ⇒ the neutral "Analytics" section identity. Definition-owned + mint-supplied via the
// `defineContextTabs` `header` slot (`analytics-section.tsx`), the same §6b-posture channel the chats lane
// minted at N4 — never a route-fed prop or a shell-side switch.
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
import type { AnalyticsContextState } from "#lib";

export function AnalyticsContextHeader({ state }: { readonly state: AnalyticsContextState }): ReactElement {
  if (state.characterId === null) {
    return (
      <Text size="label" weight="medium" tone="muted">
        Analytics
      </Text>
    );
  }
  return <DrilledCharacterIdentity characterId={state.characterId} />;
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
      <Text size="title" weight="semibold" className="truncate">
        {title}
      </Text>
    </Row>
  );
}
