// The shared chat-summary list row — the hue-seeded avatar / title / participants / relative-time shell
// rendered by BOTH the chats-list surface (with a kebab menu) and the landing "Recent chats" strip. The
// display-field derivation is the ONE `chatSummaryRowView` (lib/chat-summary-row.ts), so the two surfaces
// can't drift (derive-modernization §W5).
import type { ChatId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Row } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { timeLib } from "#lib";
import { chatSummaryRowView } from "../lib/chat-summary-row";

type ChatSummaryItem = Parameters<typeof chatSummaryRowView>[0];

interface ChatSummaryRowProps {
  readonly chat: ChatSummaryItem;
  readonly onSelect: (chatId: ChatId) => void;
  readonly selected?: boolean;
  /** Extra trailing controls (the chats-list kebab menu), rendered after the relative-time stamp. */
  readonly menu?: ReactNode;
  /** Row root className (the chats-list `group` hover-reveal root). */
  readonly className?: string;
}

/** One chat-summary row: hue-seeded avatar · title · participants subtitle · relative-time stamp, plus an
 *  optional trailing `menu`. The clickable body calls `onSelect(chat.id)`. */
export function ChatSummaryRow({ chat, onSelect, selected = false, menu, className }: ChatSummaryRowProps): ReactElement {
  const { title, subtitle, when } = chatSummaryRowView(chat);
  return (
    <ListRow
      actions={
        <Row align="center" gap="field">
          <Text className="whitespace-nowrap font-mono" size="micro" tone="muted">
            {timeLib.formatRelative(when)}
          </Text>
          {menu}
        </Row>
      }
      clickable={true}
      leading={
        <Avatar fallbackDelay={0} hueSeed={chat.id} size="sm">
          {initialsFor(title)}
        </Avatar>
      }
      onClick={(): void => onSelect(chat.id)}
      selected={selected}
      subtitle={subtitle}
      title={title}
      {...(className === undefined ? {} : { className })}
    />
  );
}
