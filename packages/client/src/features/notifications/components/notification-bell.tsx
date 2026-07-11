// The topbar notifications BELL (the multi-human invites lane) — the DURABLE per-user inbox surface,
// deliberately separate from the transient toast region (`@orb/ui/toast` = fire-and-forget; this =
// rows that persist until acted on). An unread-badged bell opening an anchored Popover of inbox rows;
// an `invite` row carries inline Accept (`invites.acceptInvite` → navigate into the joined chat) +
// Decline; the other delivery reasons render their copy + a dismiss. Mounted by the composition root
// in the shell's `topbarTrail` slot ONLY while the deployment is multi-human capable (`/api/auth/config
// .multiHumanCapable` — the honest belt signal, never a probe-and-catch).
//
// Read/act contract: OPENING the popover marks every unread row read (the badge is "new since you
// looked", not "un-acted"); ACTING on an invite (accept or decline) dismisses its row. Navigation on
// accept rides the sanctioned #state seam (`selectChat` + `setActiveSection` — §5.1: leaf writers
// write, the route composes), never a feature→feature import.
//
// Freshness: `useInboxStream` (the tracked SSE subscription) keeps the list live — a new invite appears
// without a refresh, and tRPC's Last-Event-ID resume replays anything missed while disconnected.
//
// NO data-testid inside the trigger: the bell button is addressed by its ROLE + accessible name (the
// aria-label carries the unread count) — `testid-typed-only` cannot distinguish a nested
// `testId()` stamp from a freeform string inside a `render={…}` attribute, and role-addressing is the
// stronger selector anyway (the a11y name IS the contract).

import type { NotificationEvent, NotificationType } from "@orb/contracts/notifications";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve it fine (the roster-panel.tsx precedent).
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
import { selectChat, setActiveSection } from "#state";
import { useDismissNotification, useInbox, useMarkNotificationRead } from "../hooks/use-inbox";
import { useInboxStream } from "../hooks/use-inbox-stream";
import { useAcceptInvite, useDeclineInvite } from "../hooks/use-invite-actions";

type InboxItem = inferOutput<Trpc["notifications"]["list"]>["items"][number];

/** The per-reason row copy — a mapped `Record` over the CLOSED union (§5.5: a new `NotificationEvent`
 *  member fails `tsc` here until it says what the inbox row reads; the `invalidation.ts` dispatch
 *  shape). The `invite` arm deliberately reads only the host's public handle — the richer room preview
 *  is token-keyed and tokens never ride the inbox (contracts/notifications header). */
const ROW_COPY: {
  readonly [K in NotificationType]: (payload: Extract<NotificationEvent, { type: K }>) => string;
} = {
  invite: (p) => `${p.invitedByHandle} invited you to a chat`,
  kicked: () => "You were removed from a chat",
  "handoff-nominated": () => "You've been nominated to host a chat",
  "handoff-accepted": (p) => `${p.newHostHandle} is now hosting your chat`,
};

function rowCopy(payload: NotificationEvent): string {
  // The indexed dispatch is total (mapped type over the union); the cast narrows the handler's param
  // back from the union member the index erased (the invalidation.ts precedent).
  const handler = ROW_COPY[payload.type] as (p: NotificationEvent) => string;
  return handler(payload);
}

/** The unread-badged bell + inbox popover. Mount only while the deployment is multi-human capable. */
export function NotificationBell(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { items, unreadCount } = useInbox();
  useInboxStream({ invalidation });
  const markRead = useMarkNotificationRead({ trpc, invalidation });
  const dismiss = useDismissNotification({ trpc, invalidation });
  const accept = useAcceptInvite({ trpc, invalidation });
  const decline = useDeclineInvite({ trpc, invalidation });
  const [open, setOpen] = useState(false);

  const onOpenChange = (next: boolean): void => {
    setOpen(next);
    if (next) {
      // Opening = "I've seen these" — the badge clears; the rows stay until acted on/dismissed.
      for (const item of items) {
        if (item.readAt === null) {
          markRead.mutate({ notificationId: item.id });
        }
      }
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
    // The sanctioned cross-feature navigation seam (§5.1): land in the joined room.
    setActiveSection("chats");
    selectChat(result.chat.id);
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

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button intent="ghost" size="sm" aria-label={bellLabel}>
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
        <Stack gap="row" className="min-w-64">
          {items.length === 0 ? (
            <Text tone="muted">No notifications.</Text>
          ) : (
            items.map((item) => (
              <InboxRow
                key={item.id}
                item={item}
                onAccept={(): void => void onAccept(item)}
                onDecline={(): void => void onDecline(item)}
                onDismiss={(): void => dismiss.mutate({ notificationId: item.id })}
              />
            ))
          )}
        </Stack>
      </PopoverPopup>
    </Popover>
  );
}

interface InboxRowProps {
  readonly item: InboxItem;
  readonly onAccept: () => void;
  readonly onDecline: () => void;
  readonly onDismiss: () => void;
}

/** One inbox row: the delivery copy + its actions (invite → Accept/Decline; the rest → Dismiss). */
function InboxRow({ item, onAccept, onDecline, onDismiss }: InboxRowProps): ReactElement {
  const isInvite = item.payload.type === "invite";
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
        ) : (
          <Button type="button" intent="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </Row>
    </Row>
  );
}
