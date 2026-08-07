// The topbar notifications bell — a durable per-user inbox surface, deliberately separate from the
// transient toast region. An unread-badged bell opening an anchored popover of inbox rows: an invite
// row carries inline Accept/Decline; a handoff-nominated row carries Accept/Dismiss (no decline verb —
// a nomination is host-retractable, not invitee-settleable); other reasons render copy + a dismiss.
// Mounted only while the deployment is multi-human capable.
//
// Read/act contract: opening the popover marks every unread row read via one markAllRead mutation (the
// badge is "new since you looked", not "un-acted"); acting on an invite dismisses its row.
//
// No data-testid inside the trigger: the bell is addressed by its role + accessible name.

import type { NotificationEvent, NotificationType } from "@orb/contracts/notifications";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Bell, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { testId } from "#lib";
import type { ChromePresentation } from "#state";
import { selectChat, setActiveSection } from "#state";
import { useAcceptHostHandoff } from "../hooks/use-handoff-actions.ts";
import { useDismissNotification, useInbox, useMarkAllNotificationsRead } from "../hooks/use-inbox.ts";
import { useInboxStream } from "../hooks/use-inbox-stream.ts";
import { useAcceptInvite, useDeclineInvite } from "../hooks/use-invite-actions.ts";

type InboxItem = inferOutput<Trpc["notifications"]["list"]>["items"][number];

/** The per-reason row copy — a mapped Record so a new NotificationEvent member fails tsc until it says
 *  what the inbox row reads. */
const ROW_COPY: {
  readonly [K in NotificationType]: (payload: Extract<NotificationEvent, { type: K }>) => string;
} = {
  invite: (p) => `${p.invitedByHandle} invited you to a chat`,
  kicked: () => "You were removed from a chat",
  "handoff-nominated": () => "You've been nominated to host a chat",
  "handoff-accepted": (p) => `${p.newHostHandle} is now hosting your chat`,
  "deferred-turn-dropped": (p) =>
    p.reason === "consent" ? "An AI reply couldn't run — the host hasn't allowed it" : "An AI reply couldn't run — that chat is no longer available",
  "automation-notice": (p) => `Automation notice: ${p.message}`,
  "plugin-disabled": () => "A plugin was disabled",
};

function rowCopy(payload: NotificationEvent): string {
  const handler = ROW_COPY[payload.type] as (p: NotificationEvent) => string;
  return handler(payload);
}

export interface NotificationBellProps {
  /** Which lens renders the inbox (`ChromePresentation`). `"bar"` = the topbar's badged bell + popover;
   *  `"sheet"` = the mobile You-sheet's INLINE section — a phone's overflow home is a scrolling drawer, so
   *  the inbox is a titled block in it rather than a popover anchored to a control that is not there.
   *  @defaultValue "bar" */
  readonly presentation?: ChromePresentation;
}

/** The unread-badged bell + inbox popover. Mount only while the deployment is multi-human capable. */
export function NotificationBell({ presentation = "bar" }: NotificationBellProps = {}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { items, unreadCount } = useInbox();
  useInboxStream({ invalidation });
  const markAllRead = useMarkAllNotificationsRead({ trpc, invalidation });
  const dismiss = useDismissNotification({ trpc, invalidation });
  const accept = useAcceptInvite({ trpc, invalidation });
  const decline = useDeclineInvite({ trpc, invalidation });
  const acceptHandoff = useAcceptHostHandoff({ trpc, invalidation });
  const [open, setOpen] = useState(false);

  const onOpenChange = (next: boolean): void => {
    setOpen(next);
    if (next && unreadCount > 0) {
      markAllRead.mutate(undefined);
    }
  };

  const onAccept = async (item: InboxItem): Promise<void> => {
    if (item.payload.type !== "invite") {
      return;
    }
    // A refusal surfaces via the mutation's errorToast; the row stays for a retry.
    const result = await accept.mutateAsync({ inviteId: item.payload.inviteId }).catch(() => null);
    if (result === null) {
      return;
    }
    dismiss.mutate({ notificationId: item.id });
    setOpen(false);
    setActiveSection("chats");
    selectChat(result.chat.id);
  };

  const onAcceptHandoff = async (item: InboxItem): Promise<void> => {
    if (item.payload.type !== "handoff-nominated") {
      return;
    }
    const chatId = item.payload.chatId;
    // A stale/withdrawn nomination surfaces via the errorToast; the row stays until dismissed.
    const ok = await acceptHandoff
      .mutateAsync({ chatId })
      .then(() => true)
      .catch(() => false);
    if (!ok) {
      return;
    }
    dismiss.mutate({ notificationId: item.id });
    setOpen(false);
    setActiveSection("chats");
    selectChat(chatId);
  };

  const onDecline = async (item: InboxItem): Promise<void> => {
    if (item.payload.type !== "invite") {
      return;
    }
    const ok = await decline
      .mutateAsync({ inviteId: item.payload.inviteId })
      .then(() => true)
      .catch(() => false);
    if (ok) {
      dismiss.mutate({ notificationId: item.id });
    }
  };

  const bellLabel = unreadCount === 0 ? "Notifications" : `Notifications (${unreadCount} unread)`;
  const inbox = (
    <Stack gap="row" className="min-w-64">
      {items.length === 0 ? (
        <Text tone="muted">No notifications.</Text>
      ) : (
        items.map((item) => (
          <InboxRow
            key={item.id}
            item={item}
            onAccept={(): void => void onAccept(item)}
            onAcceptHandoff={(): void => void onAcceptHandoff(item)}
            onDecline={(): void => void onDecline(item)}
            onDismiss={(): void => dismiss.mutate({ notificationId: item.id })}
          />
        ))
      )}
    </Stack>
  );

  if (presentation === "sheet") {
    // THE PHONE'S INBOX IS A BLOCK, NOT A POPOVER (side-eye leg-4 P2 + the topbar budget). On a 320px row
    // the bell was a 48px control competing with the one thing that says where you are — and the sheet is
    // already this app's phone-overflow home. Rendered OPEN: there is nothing to anchor to and nothing to
    // reveal, so the rows just are. Opening the sheet is the "you looked" moment the badge measures, so
    // the same markAllRead the popover fires on open fires here on mount.
    return (
      <Stack gap="row" data-testid={testId("notificationsInbox")}>
        {/* `voice`, not four internal axes — the section's NAME is exactly what the kicker voice is for
            (density-pass-spec §2.3; the gate exists to keep features off the type axes). */}
        <Text voice="kicker">{bellLabel}</Text>
        {inbox}
      </Stack>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                // The TOPBAR's icon-button shape, not a bare `size="sm"`: at coarse this row's controls
                // are 48×48 and the bell was rendering 40×44 beside three of them (side-eye leg-4 P3 —
                // one control under the touch floor its neighbours all clear).
                <Button intent="ghost" size="icon" className="shell-topbar-icon-btn" aria-label={bellLabel}>
                  <Icon icon={Bell} size="sm" />
                  {unreadCount > 0 ? (
                    <Badge intent="primary" size="sm" aria-hidden={true}>
                      {unreadCount}
                    </Badge>
                  ) : null}
                </Button>
              }
            />
          }
        />
        <TooltipPopup side="bottom">Notifications</TooltipPopup>
      </Tooltip>
      <PopoverPopup aria-label="Notifications" data-testid={testId("notificationsInbox")}>
        {inbox}
      </PopoverPopup>
    </Popover>
  );
}

interface InboxRowProps {
  readonly item: InboxItem;
  readonly onAccept: () => void;
  readonly onAcceptHandoff: () => void;
  readonly onDecline: () => void;
  readonly onDismiss: () => void;
}

/** One inbox row: the delivery copy + its actions (invite → Accept/Decline; handoff-nominated →
 *  Accept/Dismiss; the rest → Dismiss). */
function InboxRow({ item, onAccept, onAcceptHandoff, onDecline, onDismiss }: InboxRowProps): ReactElement {
  const isInvite = item.payload.type === "invite";
  const isHandoff = item.payload.type === "handoff-nominated";
  return (
    <Row gap="field" align="center" justify="between" data-slot="inbox-row">
      <Text as="span" size="label" weight={item.readAt === null ? "medium" : undefined}>
        {rowCopy(item.payload)}
      </Text>
      <Row gap="field" align="center">
        {isInvite ? (
          <>
            <Button type="button" intent="secondary" size="sm" onClick={onAccept}>
              Accept
            </Button>
            <Button type="button" intent="ghost" size="sm" onClick={onDecline}>
              Decline
            </Button>
          </>
        ) : null}
        {isHandoff ? (
          <Button type="button" intent="secondary" size="sm" onClick={onAcceptHandoff}>
            Accept
          </Button>
        ) : null}
        {isInvite ? null : (
          <Button type="button" intent="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </Row>
    </Row>
  );
}
