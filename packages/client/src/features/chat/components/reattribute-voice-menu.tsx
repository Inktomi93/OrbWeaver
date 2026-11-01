// The host's "Reattribute" submenu on a reply: re-voice this one row onto a character seated in the room. It restamps
// `characterId`; "Reattribute from here" restamps a user line's persona, a different column and authority.

import type { MessageView, ParticipantView } from "@orb/contracts/chat";
import { isReattributableReply } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { Icon, Users } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { MenuItem, MenuPopup, MenuSubmenuRoot, MenuSubmenuTrigger } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId } from "react";
import { DescribedMenuItem } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { isLiveTurnPhase, useTurnPhase } from "#state";
import { useReattributeVoice } from "../hooks/reattribute-voice-menu-mutations.ts";
import { MESSAGE_REATTRIBUTE_GENERATING, MESSAGE_REATTRIBUTE_NO_OTHER_SEAT, MESSAGE_REATTRIBUTE_VOICE_NAME } from "../lib/message-action-names.ts";

interface VoiceSubmenuProps {
  readonly message: MessageView;
  /** The room's character seats, as the transcript holds them. */
  readonly seats: readonly ParticipantView[];
}

export interface ReattributeVoiceMenuProps extends VoiceSubmenuProps {
  readonly viewerIsHost: boolean;
}

/** The seats a reply can move to. `leftSeq === null` mirrors the verb's present-seat gate, which is the authority. */
function targetSeats(message: MessageView, seats: readonly ParticipantView[]): readonly (ParticipantView & { readonly characterId: CharacterId })[] {
  return seats.flatMap((seat) =>
    seat.characterId !== null && seat.characterId !== message.characterId && seat.leftSeq === null ? [{ ...seat, characterId: seat.characterId }] : [],
  );
}

/** Renders for a host on an ordinary reply. The verb is the authority; this only spares a member a refused item. */
export function ReattributeVoiceMenu({ viewerIsHost, message, seats }: ReattributeVoiceMenuProps): ReactElement | null {
  return viewerIsHost && isReattributableReply(message) ? <VoiceSubmenu message={message} seats={seats} /> : null;
}

// With nowhere to move the reply, or a turn generating (the verb refuses a re-voice then), the door stays in the
// menu and says why.
function VoiceSubmenu({ message, seats }: VoiceSubmenuProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const reattribute = useReattributeVoice({ trpc, invalidation });
  const liveTurn = isLiveTurnPhase(useTurnPhase(message.chatId));
  const labelId = useId();
  const detailId = useId();
  const targets = targetSeats(message, seats);
  if (targets.length === 0) {
    return <DescribedMenuItem detail={MESSAGE_REATTRIBUTE_NO_OTHER_SEAT} disabled={true} icon={Users} label={MESSAGE_REATTRIBUTE_VOICE_NAME} />;
  }
  // The submenu root stays mounted while a turn runs: swapping it for a plain item would close a submenu the
  // host just opened. Only the trigger disables.
  return (
    <MenuSubmenuRoot disabled={liveTurn}>
      <MenuSubmenuTrigger aria-describedby={liveTurn ? detailId : undefined} aria-labelledby={labelId}>
        <Icon icon={Users} size="sm" />
        <Stack gap="tight">
          <span id={labelId}>{MESSAGE_REATTRIBUTE_VOICE_NAME}</span>
          {liveTurn ? (
            <Text id={detailId} voice="gloss">
              {MESSAGE_REATTRIBUTE_GENERATING}
            </Text>
          ) : null}
        </Stack>
      </MenuSubmenuTrigger>
      <MenuPopup>
        {targets.map((seat) => (
          <MenuItem
            key={seat.characterId}
            onClick={(): void => reattribute.mutate({ chatId: message.chatId, messageIds: [message.id], characterId: seat.characterId })}
          >
            {seat.displayName}
          </MenuItem>
        ))}
      </MenuPopup>
    </MenuSubmenuRoot>
  );
}
