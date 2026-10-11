// The topbar's room title: who you are chatting with leads, the room's own name follows only when the user
// set one, and the creation date is quiet metadata. For the host, clicking it renames the room in place.

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Input } from "@orb/ui/input";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { timeLib } from "#lib";
import { useUpdateChatTitle } from "../hooks/use-chat-row-mutations.ts";

export interface ChatHeaderTitleProps {
  readonly chatId: ChatId;
  /** The participants' names, or the untitled fallback when the room has no characters. */
  readonly label: string;
  /** The user's own name for the room; `null` when they never set one. */
  readonly roomName: string | null;
  readonly createdAt: number;
  /** Renaming is a host verb server-side; anyone else gets plain text. */
  readonly canRename: boolean;
}

/** The title is its own full value on hover (the ellipsis is the layout's floor, the tooltip is the way back). */
function TitleText({ label, roomName, createdAt }: Pick<ChatHeaderTitleProps, "label" | "roomName" | "createdAt">): ReactElement {
  return (
    <>
      <Text voice="promoted" className="shell-topbar-title min-w-0 truncate" title={label}>
        {label}
      </Text>
      {roomName === null ? null : (
        <Text as="span" voice="quiet" className="shell-topbar-subtitle min-w-0 truncate" title={roomName}>
          {roomName}
        </Text>
      )}
      <Text as="span" voice="quiet" className="shell-topbar-date shrink-0 whitespace-nowrap">
        {timeLib.formatDate(createdAt)}
      </Text>
    </>
  );
}

export function ChatHeaderTitle({ chatId, label, roomName, createdAt, canRename }: ChatHeaderTitleProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateTitle = useUpdateChatTitle({ trpc, invalidation });
  // `null` = not editing. Kept as the live text so a failed save leaves the user's words in the box.
  const [draft, setDraft] = useState<string | null>(null);
  // A second Enter can land before the pending flag has re-rendered; the ref closes that window.
  const inFlight = useRef(false);

  if (draft === null) {
    if (!canRename) {
      return (
        <Row gap="row" align="baseline" className="min-w-0">
          <TitleText label={label} roomName={roomName} createdAt={createdAt} />
        </Row>
      );
    }
    return (
      <Button
        type="button"
        intent="ghost"
        size="sm"
        aria-label={`Rename chat — ${label}`}
        className="min-w-0 shrink justify-start"
        onClick={(): void => setDraft(roomName ?? "")}
      >
        <TitleText label={label} roomName={roomName} createdAt={createdAt} />
      </Button>
    );
  }

  const save = (): void => {
    if (inFlight.current) {
      return;
    }
    const next = draft.trim();
    if (next === (roomName ?? "")) {
      setDraft(null);
      return;
    }
    inFlight.current = true;
    updateTitle.mutate(
      { chatId, title: next === "" ? null : next },
      {
        onSuccess: (): void => setDraft(null),
        onSettled: (): void => {
          inFlight.current = false;
        },
      },
    );
  };

  return (
    <Input
      aria-label="Chat name"
      placeholder="Name this chat"
      value={draft}
      readOnly={updateTitle.isPending}
      onValueChange={setDraft}
      ref={(node: HTMLInputElement | null): void => node?.focus()}
      onFocus={(event): void => event.currentTarget.select()}
      onBlur={(): void => {
        if (!inFlight.current) {
          setDraft(null);
        }
      }}
      onKeyDown={(event): void => {
        if (event.nativeEvent.isComposing) {
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          save();
        } else if (event.key === "Escape") {
          event.preventDefault();
          setDraft(null);
        }
      }}
    />
  );
}
