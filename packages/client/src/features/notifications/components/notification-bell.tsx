// The topbar notifications bell — a durable per-user inbox surface, deliberately separate from the
// transient toast region. An unread-badged bell opening an anchored popover of inbox rows: an invite
// row carries inline Accept/Decline; a handoff-nominated row carries Accept/Dismiss (no decline verb —
// a nomination is host-retractable, not invitee-settleable), where Accept opens the DISCLOSURE confirm
// (#1762) rather than firing the verb — accepting copies four classes of the departing host's property into
// your own library; other reasons render copy + a dismiss.
// Mounted for every authed principal (#1627 — the inbox has single-human sources: a crash-disabled plugin,
// an auto-disabled automation rule, the plugin consent prompt).
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
import { openConfigTo, selectChat, setActiveSection } from "#state";
import { useDismissNotification, useInbox, useMarkAllNotificationsRead } from "../hooks/use-inbox.ts";
import { useInboxStream } from "../hooks/use-inbox-stream.ts";
import { useAcceptInvite, useDeclineInvite } from "../hooks/use-invite-actions.ts";
import { HandoffAcceptConfirm } from "./handoff-accept-confirm.tsx";

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
  // THE FRESH-BOOT ASK (#1041/#924). ONE aggregate row, never one per plugin — the count is the whole
  // message, and what each plugin asks for (and why) is read on the consent screen the Review action opens,
  // which is the only place the answer can actually be given. The wording is the Extensions pane's
  // awaiting-consent sentence, deliberately: both surfaces describe the same nine rows, and a reader who
  // meets it twice should not have to work out that it is the same fact.
  "plugins-awaiting-consent": (p) =>
    p.pendingCount === 1
      ? "One plugin is installed but not allowed to do anything yet"
      : `${p.pendingCount} plugins are installed but not allowed to do anything yet`,
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

/** The unread-badged bell + inbox popover. No deployment gate — see the file header (#1627). */
export function NotificationBell({ presentation = "bar" }: NotificationBellProps = {}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { items, unreadCount } = useInbox();
  useInboxStream({ invalidation });
  const markAllRead = useMarkAllNotificationsRead({ trpc, invalidation });
  const [open, setOpen] = useState(false);
  const [handoffDecision, setHandoffDecision] = useState<InboxItem | null>(null);
  // The nominations this session has already accepted — #1501's "the verb landed" flag, kept HERE because
  // the confirm that fires the verb outlives the row that opened it (and the row is re-created from the
  // list a failed dismiss left unchanged).
  const [acceptedHandoffIds, setAcceptedHandoffIds] = useState<readonly string[]>([]);

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

  // The consent ask's door: the popover closes and the Plugins config group opens, the same
  // close-then-navigate shape the invite/handoff arms use.
  const onOpenPlugins = (): void => {
    setOpen(false);
    openConfigTo("plugins");
  };

  const onHandoffAccepted = (chatId: ChatId): void => {
    setHandoffDecision(null);
    setActiveSection("chats");
    selectChat(chatId);
  };

  // THE NOMINATION BEING DECIDED (#1762) — hoisted OUT of the row on purpose: the bar lens's rows live
  // inside a Popover, and a modal dialog opened from inside one dies with it the moment focus leaves. So
  // Accept closes the popover and this state carries the decision, in both lenses.
  const onRequestHandoff = (item: InboxItem): void => {
    setOpen(false);
    setHandoffDecision(item);
  };
  const handoffPayload = handoffDecision?.payload.type === "handoff-nominated" ? handoffDecision.payload : null;
  const handoffConfirm =
    handoffDecision === null || handoffPayload === null ? null : (
      <HandoffAcceptConfirm
        chatId={handoffPayload.chatId}
        notificationId={handoffDecision.id}
        offer={handoffPayload.offer}
        onAccepted={(chatId): void => {
          setAcceptedHandoffIds((ids) => [...ids, handoffDecision.id]);
          onHandoffAccepted(chatId);
        }}
        onClose={(): void => setHandoffDecision(null)}
      />
    );

  const bellLabel = unreadCount === 0 ? "Notifications" : `Notifications (${unreadCount} unread)`;
  const inbox = (
    <Stack gap="row" className="min-w-64">
      {items.length === 0 ? (
        <Text voice="quiet">No notifications.</Text>
      ) : (
        items.map((item) => (
          <InboxRow
            key={item.id}
            item={item}
            acceptedHandoff={acceptedHandoffIds.includes(item.id)}
            onAccepted={onAccepted}
            onOpenPlugins={onOpenPlugins}
            onRequestHandoff={onRequestHandoff}
          />
        ))
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
      <>
        <Section
          aria-labelledby={SHEET_HEADING_ID}
          data-testid={testId("notificationsInbox")}
          kicker={<span id={SHEET_HEADING_ID}>{bellLabel}</span>}
          role="group"
        >
          {inbox}
        </Section>
        {handoffConfirm}
      </>
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
      {/* OUTSIDE the popup, inside the root: the popover closes the moment the modal confirm takes focus,
          and a dialog rendered in `PopoverPopup` would unmount with it mid-decision. */}
      {handoffConfirm}
    </Popover>
  );
}

interface InboxRowProps {
  readonly item: InboxItem;
  readonly onAccepted: (chatId: ChatId) => void;
  /** Open the DISCLOSURE confirm for this nomination (#1762) — the row no longer accepts anything itself. */
  readonly onRequestHandoff: (item: InboxItem) => void;
  /** This nomination has already been accepted through that confirm, so its Accept must not come back
   *  (#1501, held across the hoist: the row is re-rendered from a list the failed dismiss did not change). */
  readonly acceptedHandoff: boolean;
  readonly onOpenPlugins: () => void;
}

/** One inbox row: the delivery copy + its actions (invite → Accept/Decline; handoff-nominated →
 *  Accept/Dismiss; the rest → Dismiss). The handoff's Accept OPENS the disclosure confirm rather than
 *  firing the verb — what a nomination copies into your library is the bell's one two-step decision. */
function InboxRow({ item, onAccepted, onRequestHandoff, acceptedHandoff, onOpenPlugins }: InboxRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const dismiss = useDismissNotification({ trpc, invalidation });
  const accept = useAcceptInvite({ trpc, invalidation });
  const decline = useDeclineInvite({ trpc, invalidation });
  const actionOwned = useRef(false);
  // THE VERB LANDED — the invite/handoff is accepted or declined, whatever happened to the follow-up dismiss
  // (#1501). It exists because the two writes are NOT one transaction: a row whose accept succeeded and whose
  // dismiss failed must never offer Accept again (re-accepting an already-joined invite just fails), but it
  // must still offer the Dismiss that failed. So the affordances follow what has actually happened rather
  // than what the row was born as.
  const [acted, setActed] = useState(false);
  const isInvite = item.payload.type === "invite";
  const isHandoff = item.payload.type === "handoff-nominated";
  const isConsent = item.payload.type === "plugins-awaiting-consent";
  const isPending = accept.isPending || decline.isPending || dismiss.isPending;
  // The handoff's own in-flight copy moved to the confirm with the verb (#1762): the only write this row
  // still owns for a nomination is the dismiss.
  const pendingCopy = isInvite ? `Updating invitation from ${item.payload.invitedByHandle}…` : "Dismissing notification…";

  const ownAction = (work: () => Promise<void>): void => {
    if (actionOwned.current) {
      return;
    }
    actionOwned.current = true;
    // @orb-gate-ignore caught-failure-ownership(promise:work): every `work` this wraps (accept/decline/
    // dismiss) carries its own errorToast — the toast is the surface. Ends if a new `work` caller lacks an errorToast.
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
      // NAVIGATE ON THE JOIN, NOT ON THE CLEANUP (#1501). `onAccepted` sat AFTER the dismiss, so a failed
      // dismiss — swallowed by `ownAction`'s catch, which is correct: the dismiss carries its own errorToast —
      // stranded a reader who HAD joined the room in the inbox they opened, with an Accept button that could
      // only fail from then on.
      setActed(true);
      onAccepted(result.chat.id);
      await dismiss.mutateAsync({ notificationId: item.id });
    });
  };

  const declineInvite = (): void => {
    const payload = item.payload;
    if (payload.type !== "invite") {
      return;
    }
    ownAction(async () => {
      await decline.mutateAsync({ inviteId: payload.inviteId });
      setActed(true);
      await dismiss.mutateAsync({ notificationId: item.id });
    });
  };

  // THE PATH TO THE ANSWER, not a second copy of the ask (owner ruling on #924, defaults 1-2). The consent
  // surface is the EXISTING Plugins group, which already sorts rows needing attention to the top
  // (`plugins-installed-section.tsx`), so landing on the group IS landing on the pending rows — and the
  // group's own anchor ids stay in the plugin feature where they are minted (a client feature must not
  // import another feature's internals, `client-features-no-cross`), which is why this is the group-level
  // door rather than a second spelling of the Extensions pane's deep link.
  //
  // It deliberately does NOT dismiss the row: the ask stands until it is ANSWERED, and the producer
  // retracts it the moment the last plugin is settled (`domain/plugin/substrate/consent-prompt.ts`). A
  // reader who wants it gone anyway has the Dismiss beside it — that is the "deny is recoverable" arm:
  // the plugins stay installed and ungranted, and this screen is still one click away.
  const reviewConsent = (): void => {
    onOpenPlugins();
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
        {isInvite && !acted ? (
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
        {isHandoff && !acted && !acceptedHandoff ? (
          <Button
            aria-label="Accept the host handoff"
            type="button"
            disabled={isPending}
            intent="secondary"
            size="sm"
            onClick={(): void => onRequestHandoff(item)}
          >
            Accept
          </Button>
        ) : null}
        {isConsent ? (
          <Button aria-label="Review what your plugins ask for" type="button" disabled={isPending} intent="secondary" size="sm" onClick={reviewConsent}>
            Review
          </Button>
        ) : null}
        {isInvite && !acted ? null : (
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
