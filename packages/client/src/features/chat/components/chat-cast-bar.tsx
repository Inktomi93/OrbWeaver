// The chat cast bar: a thin read-only row of one chip per character participant, mounted above the
// transcript. Per-member controls live in the Members panel + speak-as in the composer — this strip is
// presence-at-a-glance only, no mutations. Size-gated: null unless the roster has >1 of a relevant kind
// (>1 character or >1 present human). Reads the same chat.getChat query the message-list + Context
// panel already suspend on, via a non-suspense useQuery that degrades to null until the cache warms.

import { blobUrl } from "@orb/contracts/assets";
import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Avatar } from "@orb/ui/avatar";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve Crown/Icon fine (the shell-topbar.tsx precedent).
import { Crown, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { cn } from "@orb/ui/lib";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { testId } from "#lib";
import { initialsForAttribution } from "../lib/attribution";
import { filterCharacters, resolveHumanParticipants } from "../lib/roster";
import { AddMemberPopover } from "./add-member-popover";

export interface ChatCastBarProps {
  readonly chatId: ChatId;
}

const HUMAN_CHIP_CAP = 5;

export function ChatCastBar({ chatId }: ChatCastBarProps): ReactElement | null {
  const trpc = useTRPC();
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const cast = filterCharacters(chat?.participants ?? []);
  const humans = resolveHumanParticipants(chat?.participants ?? []);

  if (cast.length <= 1 && humans.length <= 1) {
    return null;
  }

  const isHost = chat?.viewerIsHost === true;
  const existingCharacterIds: readonly CharacterId[] = cast.map((member) => member.characterId);

  return (
    <Row
      gap="field"
      align="center"
      className="flex-wrap px-block py-row"
      data-testid={testId("chatCastBar")}
      aria-label="Cast"
    >
      {(cast.length > 1 ? cast : []).map((member) => (
        <Row
          key={member.id}
          gap="row"
          align="center"
          data-slot="cast-chip"
          data-muted={member.disabled ? "" : undefined}
          className={cn(member.disabled && "opacity-50")}
        >
          <Avatar
            size="sm"
            fallbackDelay={0}
            hueSeed={member.characterId}
            {...(member.avatarHash === null ? {} : { src: blobUrl(member.avatarHash) })}
          >
            {initialsForAttribution(member.displayName)}
          </Avatar>
          <Text as="span" size="label" weight="medium" tone={member.disabled ? "muted" : undefined}>
            {member.displayName}
          </Text>
        </Row>
      ))}
      {isHost ? (
        <AddMemberPopover chatId={chatId} existingCharacterIds={existingCharacterIds} />
      ) : null}
      {humans.length > 1 ? <HumanChips humans={humans} /> : null}
    </Row>
  );
}

function HumanChips({ humans }: { readonly humans: readonly ParticipantView[] }): ReactElement {
  const visible = humans.slice(0, HUMAN_CHIP_CAP);
  const overflow = humans.length - visible.length;
  return (
    <Row gap="row" align="center" aria-label="People" data-slot="cast-bar-humans">
      {visible.map((member) => (
        <Row key={member.id} gap="row" align="center" data-slot="human-chip">
          <Avatar
            size="sm"
            fallbackDelay={0}
            hueSeed={member.id}
            {...(member.avatarHash === null ? {} : { src: blobUrl(member.avatarHash) })}
          >
            {initialsForAttribution(member.displayName)}
          </Avatar>
          <Text as="span" size="label" weight="medium">
            {member.displayName}
          </Text>
          {member.role === "host" ? (
            <Icon icon={Crown} size="xs" aria-label="Host" data-slot="host-crown" />
          ) : null}
        </Row>
      ))}
      {overflow > 0 ? (
        <Text as="span" size="micro" tone="muted" className="font-mono">
          +{overflow}
        </Text>
      ) : null}
    </Row>
  );
}
