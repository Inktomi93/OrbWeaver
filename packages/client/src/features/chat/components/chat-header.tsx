// ChatHeaderSurface — the active chat's identity for the shell TOPBAR (UIP-202 / ux-flow-revamp J3).
// The route composes this into `AppShell`'s `header` slot for a COMMITTED chat, so the topbar shows the
// chat identity ONCE (killing the triple-title smell) while the shell stays domain-agnostic — it only
// forwards a ReactNode. Falls back nowhere: the route passes this only for a committed chat, so a
// draft/none renders the shell's section-name default.
//
// MINIMAL by design (this lane = L2 shell chrome). It renders the chat title + a lead avatar (initials
// fallback, mirroring ChatCastBar). The FULL identity header — real avatar images, a participants/scene
// chip, an AvatarStack for groups, and the ⋯ thread-actions menu — is L4 (ux-flow-revamp J3/J6); do not
// build it here.
//
//   TODO(L4): real avatar image (needs the D21 asset-blob URL seam — the roster carries `avatarAssetId`
//   but no surface resolves it to a URL yet), a participants/scene chip, group AvatarStack, and the ⋯
//   options menu. Until then this is names + initials only, fabricating no data it doesn't have.
//
// SHARED-CACHE, NON-SUSPENSE (the ChatCastBar precedent): reads the SAME `chat.getChat` query the room
// already suspends on (usually warm), via a plain `useQuery` so the always-present topbar never suspends
// on its own account — it degrades to a neutral "Chat" label until the cache populates.

import type { ParticipantView } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { Avatar } from "@orb/ui/avatar";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { initialsForAttribution } from "../lib/attribution";

export interface ChatHeaderSurfaceProps {
  /** A COMMITTED chat id — the route composes this only for a committed chat (a draft has no server row). */
  readonly chatId: ChatId;
}

function isCharacter(p: ParticipantView): boolean {
  return p.kind === "character" && p.characterId !== null;
}

/** The topbar chat-identity header: lead avatar (initials) + title. Route-composed into `AppShell.header`. */
export function ChatHeaderSurface({ chatId }: ChatHeaderSurfaceProps): ReactElement {
  const trpc = useTRPC();
  // Non-suspense: the topbar must never suspend on its own account (the ChatCastBar pattern). Degrades
  // to a neutral "Chat" label until the (usually warm) getChat cache populates.
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const title = chat?.title ?? "Untitled chat";
  const lead = chat?.participants.find(isCharacter);

  return (
    <Row gap="row" align="center" className="min-w-0">
      {lead === undefined ? null : (
        <Avatar size="sm" fallbackDelay={0}>
          {initialsForAttribution(lead.displayName)}
        </Avatar>
      )}
      <Text size="title" weight="semibold" className="truncate">
        {title}
      </Text>
    </Row>
  );
}
