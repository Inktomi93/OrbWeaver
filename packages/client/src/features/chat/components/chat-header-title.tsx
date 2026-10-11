// The topbar's room title: who you are chatting with leads, the room's own name follows only when the user
// set one, and the creation date is quiet metadata. For the host, clicking it renames the room in place.

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Input } from "@orb/ui/input";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
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

/** The participants, leading. Its full value is the tooltip (the ellipsis is the layout's floor). */
function ParticipantsText({ label }: { readonly label: string }): ReactElement {
  return (
    <Text voice="promoted" className="shell-topbar-title min-w-0 truncate" title={label}>
      {label}
    </Text>
  );
}

/** The creation date: quiet metadata, the first thing to drop when the row is tight (shell.css). */
function DateText({ createdAt }: { readonly createdAt: number }): ReactElement {
  return (
    <Text as="span" voice="quiet" className="shell-topbar-date shrink-0 whitespace-nowrap">
      {`\u00b7 ${timeLib.formatDate(createdAt)}`}
    </Text>
  );
}

function TitleText({ label, roomName, createdAt }: Pick<ChatHeaderTitleProps, "label" | "roomName" | "createdAt">): ReactElement {
  return (
    <>
      <ParticipantsText label={label} />
      {roomName === null ? null : (
        <Text as="span" voice="quiet" className="shell-topbar-subtitle min-w-0 truncate" title={roomName}>
          {roomName}
        </Text>
      )}
      <DateText createdAt={createdAt} />
    </>
  );
}

/** The one box that owns the title's floor and clips its own overflow, so the title can never spill onto the
 *  chips beside it (the floor lives on the box, never on the text inside it). */
function TitleGroup({ children, width }: { readonly children: ReactNode; readonly width?: number }): ReactElement {
  return (
    <Row gap="row" align="baseline" className="shell-topbar-title-group min-w-0" {...(width === undefined ? {} : { style: { width } })}>
      {children}
    </Row>
  );
}

export function ChatHeaderTitle({ chatId, label, roomName, createdAt, canRename }: ChatHeaderTitleProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateTitle = useUpdateChatTitle({ trpc, invalidation });
  // `null` = not editing. Kept as the live text so a failed save leaves the user's words in the box.
  const [draft, setDraft] = useState<string | null>(null);
  // The title's width when the editor opened: the editing group keeps it, so the chips beside the title stay put.
  const [editWidth, setEditWidth] = useState<number | undefined>(undefined);
  // A second Enter can land before the pending flag has re-rendered; the ref closes that window.
  const inFlight = useRef(false);
  // Set when the editor closes by Enter/Escape, so the title button that replaces the unmounted input takes
  // the focus the input held (a blur-cancel means the user went elsewhere: no restore).
  const restoreFocus = useRef(false);
  const finish = (): void => {
    restoreFocus.current = true;
    setDraft(null);
  };

  if (draft === null) {
    if (!canRename) {
      return (
        <TitleGroup>
          <TitleText label={label} roomName={roomName} createdAt={createdAt} />
        </TitleGroup>
      );
    }
    return (
      <Button
        type="button"
        intent="ghost"
        size="sm"
        aria-label={`Rename chat — ${label}${roomName === null ? "" : `, ${roomName}`}`}
        className="shell-topbar-title-group min-w-0 shrink justify-start"
        ref={(node: HTMLButtonElement | null): void => {
          if (node !== null && restoreFocus.current) {
            restoreFocus.current = false;
            node.focus();
          }
        }}
        onClick={(event): void => {
          setEditWidth(event.currentTarget.getBoundingClientRect().width);
          setDraft(roomName ?? "");
        }}
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
      finish();
      return;
    }
    inFlight.current = true;
    updateTitle.mutate(
      { chatId, title: next === "" ? null : next },
      {
        onSuccess: finish,
        onSettled: (): void => {
          inFlight.current = false;
        },
      },
    );
  };

  // The participants keep their place while the name's slot becomes the field, and the group keeps its width,
  // so the chips beside the title do not move as the editor opens. The date steps aside first: the field gets
  // the room it needs.
  return (
    <TitleGroup {...(editWidth === undefined ? {} : { width: editWidth })}>
      <ParticipantsText label={label} />
      <Input
        aria-label="Chat name"
        placeholder="Name this chat"
        className="shell-topbar-rename min-w-0"
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
            finish();
          }
        }}
      />
    </TitleGroup>
  );
}
