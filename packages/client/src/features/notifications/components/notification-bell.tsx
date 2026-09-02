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
import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Bell, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
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

/** The sheet lens's heading id — the block points its `aria-labelledby` at it, so the group and the heading
 *  are one mint of one name (the You sheet's own `MORE_HEADING_ID` precedent). Static: a document has exactly
 *  one You sheet, and the bar lens renders no heading at all. */
const SHEET_HEADING_ID = "notifications-inbox-heading";

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
  const [open, setOpen] = useState(false);

  // THE SHEET LENS HAS NO "OPEN" EVENT — its rows just ARE, so its "you looked" moment is the mount (the
  // popover's `onOpenChange` below is the bar lens's equivalent). This effect is what made the claim in the
  // sheet branch's comment TRUE: it was written as if a mark-read fired there, and none did, so a phone
  // user's unread count could never clear (side-eye 2026-08-07 P2).
  //
  // Keyed on the BOOLEAN, not the count: the read lands after mount, so `hasUnread` flips false→true once and
  // the mutation fires once; the invalidated refetch then flips it back to false and the effect cannot re-arm
  // while the same rows stay read. `markAllRead.mutate` is react-query's stable handle (the mutation OBJECT
  // is a fresh identity every render and would loop).
  const isSheet = presentation === "sheet";
  const hasUnread = unreadCount > 0;
  const markAllReadNow = markAllRead.mutate;
  useEffect(() => {
    if (isSheet && hasUnread) {
      markAllReadNow(undefined);
    }
  }, [isSheet, hasUnread, markAllReadNow]);

  const onOpenChange = (next: boolean): void => {
    setOpen(next);
    if (next && unreadCount > 0) {
      markAllRead.mutate(undefined);
    }
  };

  const onAccepted = (chatId: ChatId): void => {
    setOpen(false);
    setActiveSection("chats");
    selectChat(chatId);
  };

  const onHandoffAccepted = (chatId: ChatId): void => {
    setOpen(false);
    setActiveSection("chats");
    selectChat(chatId);
  };

  const bellLabel = unreadCount === 0 ? "Notifications" : `Notifications (${unreadCount} unread)`;
  const inbox = (
    <Stack gap="row" className="min-w-64">
      {items.length === 0 ? (
        <Text voice="quiet">No notifications.</Text>
      ) : (
        items.map((item) => <InboxRow key={item.id} item={item} onAccepted={onAccepted} onHandoffAccepted={onHandoffAccepted} />)
      )}
    </Stack>
  );

  if (isSheet) {
    // THE PHONE'S INBOX IS A BLOCK, NOT A POPOVER (side-eye leg-4 P2 + the topbar budget). On a 320px row
    // the bell was a 48px control competing with the one thing that says where you are — and the sheet is
    // already this app's phone-overflow home. Rendered OPEN: there is nothing to anchor to and nothing to
    // reveal, so the rows just are. Opening the sheet is the "you looked" moment the badge measures, so the
    // same markAllRead the popover fires on open fires here on mount (the effect above — this sentence used
    // to describe code that did not exist).
    //
    // `Section kicker`, not a bare `<Text voice="kicker">` (side-eye 2026-08-07 P3b / §13.10 N7). The block's
    // NAME was a `<span>`, so in a long overflow sheet the only way to find the inbox was to scroll past
    // everything else looking for it — heading navigation could not reach it. `Section` renders exactly this
    // voice on a real `<h3>` (`@orb/ui/layout` — "Still a real <h3>, so the document outline survives"), so
    // the fix is the house primitive, not a hand-rolled role/aria-labelledby pair.
    //
    // …and it is a NAMED GROUP, not a heading with loose siblings (#1129). The You sheet's two other blocks
    // are named containers ("Account and settings", "More"), so an inventory of the sheet — a group/landmark
    // walk, or `snap --mobile --map`, which lists containers and controls and never headings — named every
    // block in the sheet EXCEPT the phone's ONLY notifications door, and a reader who landed on an invite
    // row was inside nothing. `aria-labelledby` at the heading rather than a second copy of the string: one
    // mint of the name, and the group and its heading can never drift.
    return (
      <Section
        aria-labelledby={SHEET_HEADING_ID}
        data-testid={testId("notificationsInbox")}
        kicker={<span id={SHEET_HEADING_ID}>{bellLabel}</span>}
        role="group"
      >
        {inbox}
      </Section>
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
  readonly onAccepted: (chatId: ChatId) => void;
  readonly onHandoffAccepted: (chatId: ChatId) => void;
}

/** One inbox row: the delivery copy + its actions (invite → Accept/Decline; handoff-nominated →
 *  Accept/Dismiss; the rest → Dismiss). */
function InboxRow({ item, onAccepted, onHandoffAccepted }: InboxRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const dismiss = useDismissNotification({ trpc, invalidation });
  const accept = useAcceptInvite({ trpc, invalidation });
  const decline = useDeclineInvite({ trpc, invalidation });
  const acceptHandoff = useAcceptHostHandoff({ trpc, invalidation });
  const actionOwned = useRef(false);
  const isInvite = item.payload.type === "invite";
  const isHandoff = item.payload.type === "handoff-nominated";
  const isPending = accept.isPending || decline.isPending || acceptHandoff.isPending || dismiss.isPending;
  let pendingCopy = "Dismissing notification…";
  if (isInvite) {
    pendingCopy = `Updating invitation from ${item.payload.invitedByHandle}…`;
  } else if (isHandoff) {
    pendingCopy = "Updating host handoff…";
  }

  const ownAction = (work: () => Promise<void>): void => {
    if (actionOwned.current) {
      return;
    }
    actionOwned.current = true;
    // @orb-gate-ignore caught-failure-ownership(promise:work): every `work` this wraps (accept/decline/
    // acceptHandoff/dismiss) carries its own errorToast — the toast is the surface. Ends if a new `work`
    // caller lacks an errorToast.
    void work()
      .catch(() => undefined)
      .finally(() => {
        actionOwned.current = false;
      });
  };

  const acceptInvite = (): void => {
    const payload = item.payload;
    if (payload.type !== "invite") {
      return;
    }
    ownAction(async () => {
      const result = await accept.mutateAsync({ inviteId: payload.inviteId });
      await dismiss.mutateAsync({ notificationId: item.id });
      onAccepted(result.chat.id);
    });
  };

  const declineInvite = (): void => {
    const payload = item.payload;
    if (payload.type !== "invite") {
      return;
    }
    ownAction(async () => {
      await decline.mutateAsync({ inviteId: payload.inviteId });
      await dismiss.mutateAsync({ notificationId: item.id });
    });
  };

  const acceptHostHandoff = (): void => {
    const payload = item.payload;
    if (payload.type !== "handoff-nominated") {
      return;
    }
    ownAction(async () => {
      await acceptHandoff.mutateAsync({ chatId: payload.chatId });
      await dismiss.mutateAsync({ notificationId: item.id });
      onHandoffAccepted(payload.chatId);
    });
  };

  const dismissRow = (): void => {
    ownAction(async () => {
      await dismiss.mutateAsync({ notificationId: item.id });
    });
  };
  return (
    <Row gap="field" align="center" justify="between" data-slot="inbox-row">
      <Text as="span" size="label" weight={item.readAt === null ? "medium" : undefined}>
        {rowCopy(item.payload)}
      </Text>
      <Row gap="field" align="center">
        {isInvite ? (
          <>
            <Button
              aria-label={`Accept invitation from ${item.payload.invitedByHandle}`}
              type="button"
              disabled={isPending}
              intent="secondary"
              size="sm"
              onClick={acceptInvite}
            >
              Accept
            </Button>
            <Button
              aria-label={`Decline invitation from ${item.payload.invitedByHandle}`}
              type="button"
              disabled={isPending}
              intent="ghost"
              size="sm"
              onClick={declineInvite}
            >
              Decline
            </Button>
          </>
        ) : null}
        {isHandoff ? (
          <Button type="button" disabled={isPending} intent="secondary" size="sm" onClick={acceptHostHandoff}>
            Accept
          </Button>
        ) : null}
        {isInvite ? null : (
          <Button type="button" disabled={isPending} intent="ghost" size="sm" onClick={dismissRow}>
            Dismiss
          </Button>
        )}
        {isPending ? (
          <Text role="status" voice="gloss">
            {pendingCopy}
          </Text>
        ) : null}
      </Row>
    </Row>
  );
}
