// The Characters CONTEXT pane's HEAD BAND — the open character's identity in the context bracket's band slot
// (#860, owner-ruled 2026-08-30; the mock is `docs/design/mocks/context-bracket/Character.dc.html`): the
// portrait beside the NAME over the handle line, then three chips — Own look · N chats · N tokens. It is fed
// through the section's `defineContextTabs` `header` slot (`characters-section.tsx`); the six-cell meta rail
// (Overview · Chats · Links · Look · History · Trust) sits at the pane's foot, named "Character".
//
// EVERY DATUM HERE HAS ONE HOME ALREADY, and this band only re-states it as the pane's identity (§13 — the
// CONTENT hero is the editing surface, this is the glance):
//   · the portrait + name + `@handle` — `character.get`, the read the editor already suspends on (a plain
//     `useQuery` here: the band never suspends on its own account; it renders the SHAPE of an identity until
//     the read lands, the `chat-header.tsx` "the placeholder may not lie" rule);
//   · OWN LOOK — the hero's own mark (`OwnLookMark`, one component, one predicate, one sentence), rendered
//     only when the card carries a theme override (an override-less card shows nothing — the honest absence);
//   · N CHATS — the census the hero's "N chats ›" spends: `chat.listChats` page-of-one `totalCount`, the SAME
//     query key the Overview card's "Last chat" row reads, so one fetch serves both;
//   · N TOKENS — the editor's own estimator over the card's fields (`totalTokenCount` at greeting 0), so the
//     band and the editor's "N total" agree by construction.

import { blobUrl } from "@orb/contracts/assets";
import type { CharacterId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Badge } from "@orb/ui/badge";
import { Row, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Heading, Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { characterCardFormFromDetail, totalTokenCount } from "../lib/character-card-form-model.ts";
import { OwnLookMark } from "./character-hero-band.tsx";

/** The census read is a page-of-ONE — only `totalCount` is spent here (the Overview card's key). */
const CENSUS_PAGE = 1;
/** The token estimate is taken at the FIRST greeting — the editor's resting arm, so the two agree. */
const RESTING_GREETING = 0;

export interface CharacterContextBandProps {
  readonly characterId: CharacterId;
}

export function CharacterContextBand({ characterId }: CharacterContextBandProps): ReactElement {
  const trpc = useTRPC();
  const { data: detail } = useQuery(trpc.character.get.queryOptions({ characterId }));
  const { data: chats } = useQuery(trpc.chat.listChats.queryOptions({ characterId, limit: CENSUS_PAGE }));

  if (detail === undefined) {
    return (
      <Row gap="block" align="center" aria-busy={true} className="min-w-0">
        <Skeleton className="size-avatar-lg shrink-0 rounded-base" data-slot="character-context-band-pending" />
        <Skeleton className="h-control-sm w-full max-w-cq-sm" />
      </Row>
    );
  }

  const chatCount = chats?.totalCount ?? 0;
  const tokens = totalTokenCount(characterCardFormFromDetail(detail), RESTING_GREETING);
  return (
    <Row gap="block" align="center" data-slot="character-context-band" className="min-w-0">
      <Avatar
        size="lg"
        shape="rounded"
        alt={detail.name}
        hueSeed={detail.id}
        className="shrink-0"
        {...(detail.avatarHash === null ? {} : { src: blobUrl(detail.avatarHash) })}
      >
        {initialsFor(detail.name)}
      </Avatar>
      <Stack gap="field" className="min-w-0 flex-1">
        {/* A real heading — the pane's own h2, like the LIST band's — so the character is a landmark a rotor
            can jump to; the title step + semibold are the level's own. */}
        <Heading level={2} data-slot="character-context-band-name" className="line-clamp-2 text-balance" title={detail.name}>
          {detail.name}
        </Heading>
        <Text voice="gloss" className="truncate font-mono" data-slot="character-context-band-handle">
          @{detail.handle}
        </Text>
        <Row gap="field" align="center" className="flex-wrap">
          <OwnLookMark themeOverride={detail.themeOverride} />
          <Badge tone="soft" size="sm" intent="neutral" data-slot="character-context-band-chats">
            {chatCount === 1 ? "1 chat" : `${chatCount} chats`}
          </Badge>
          <Badge
            tone="soft"
            size="sm"
            intent="neutral"
            data-slot="character-context-band-tokens"
            title="Estimated tokens the card spends at its first greeting — the editor's own count"
          >
            {`${tokens} tokens`}
          </Badge>
        </Row>
      </Stack>
    </Row>
  );
}
