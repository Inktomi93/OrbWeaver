// The topbar notifications bell — a durable per-user inbox surface, deliberately separate from the
// transient toast region. A dot-marked bell opening an anchored popover of inbox rows: an invite
// row carries inline Accept/Decline; a handoff-nominated row carries Accept/Dismiss (no decline verb —
// a nomination is host-retractable, not invitee-settleable), where Accept opens the DISCLOSURE confirm
// (#1762) rather than firing the verb — accepting copies four classes of the departing host's property into
// your own library; other reasons render copy + a dismiss.
// Mounted for every authed principal (#1627 — the inbox has single-human sources: a crash-disabled plugin,
// an auto-disabled automation rule, the plugin consent prompt).
//
// Read/act contract: opening the popover marks every unread row read via one markAllRead mutation (the
// mark is "new since you looked", not "un-acted" — #1799 is where that meaning widens); acting on an invite
// dismisses its row. The mark itself is a DOT and carries NO number (#1798): the count lives in the
// trigger's accessible name and in the rows below it.
//
// No data-testid inside the trigger: the bell is addressed by its role + accessible name.

import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Bell, Icon } from "@orb/ui/icons";
import { Section, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Separator } from "@orb/ui/separator";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { Fragment, useEffect, useState } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { testId } from "#lib";
import type { ChromePresentation } from "#state";
import { closeModal, openConfigTo, selectChat, setActiveSection } from "#state";
import { useInbox, useMarkAllNotificationsRead } from "../hooks/use-inbox.ts";
import { useInboxStream } from "../hooks/use-inbox-stream.ts";
import { HandoffAcceptConfirm } from "./handoff-accept-confirm.tsx";
import { InboxRow } from "./notification-inbox-row.tsx";

/** The `notifications.list` row shape — a private local alias (each file that needs it derives its own,
 *  the `use-character-mutations.ts` house pattern): the ONE home is the router's own inference, not a
 *  hand-declared shape, so `no-inline-types` does not apply and this is never exported. */
type InboxItem = inferOutput<Trpc["notifications"]["list"]>["items"][number];

/** The sheet lens's heading id — the block points its `aria-labelledby` at it, so the group and the heading
 *  are one mint of one name (the You sheet's own `MORE_HEADING_ID` precedent). Static: a document has exactly
 *  one You sheet, and the bar lens renders no heading at all. */
const SHEET_HEADING_ID = "notifications-inbox-heading";

export interface NotificationBellProps {
  /** Which lens renders the inbox (`ChromePresentation`). `"bar"` = the topbar's dot-marked bell + popover;
   *  `"sheet"` = the mobile You-sheet's INLINE section — a phone's overflow home is a scrolling drawer, so
   *  the inbox is a titled block in it rather than a popover anchored to a control that is not there.
   *  @defaultValue "bar" */
  readonly presentation?: ChromePresentation;
}

/** The dot-marked bell + inbox popover. No deployment gate — see the file header (#1627). */
export function NotificationBell({ presentation = "bar" }: NotificationBellProps = {}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { items, unreadCount, pendingCount } = useInbox();
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
  // THE INDICATOR PREDICATE — ONE boolean, computed here, so the bar lens's dot is never re-derived at the
  // JSX. It means NEW **OR** PENDING (owner ruling, #1799), and the two halves clear on different acts:
  //   · NEW  (`hasUnread`) — "something arrived since you looked". OPENING the popover clears it, because
  //     opening IS looking; that is what `onOpenChange` fires markAllRead for.
  //   · PENDING (`hasPending`) — "something is still waiting on your decision": an invite nobody has
  //     answered, a nomination nobody has confirmed, a standing consent ask. Reading it changes NOTHING.
  //     Only acting — accept / decline / confirm / dismiss — takes the row out of the actionable set, and
  //     the server is what decides that (`InboxView.actionable`, derived from the chat domain's own state),
  //     so an invite settled from a share link stops lighting the bell without anyone touching the inbox.
  // Deliberately two derivations rather than one: `hasUnread` is ALSO the mark-read trigger below, and
  // folding pending into it would make opening the bell mark-read on a loop it can never satisfy.
  const hasPending = pendingCount > 0;
  const showIndicator = hasUnread || hasPending;
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

  // EVERY HANDLER THAT MOVES THE SHELL CLOSES THE POPOVER ITSELF — an INHERITED invariant is the rot shape
  // (#1795's float class, re-derived here 2026-09-06). #1795 rules that a float must not stay attached to
  // content that has navigated away, and this popover is out of reach of that fix's mechanism twice over: a
  // row's action is an INSIDE press, so Base UI's outside-press close never fires, and the inbox is not a
  // modal slot, so the shell's float teardown cannot see it. The invariant has to be local.
  //
  // This handler was the one that did not state it. It was still CORRECT — `onRequestHandoff` closes two
  // steps up the chain before the confirm ever opens — and that is precisely the problem: correctness by
  // inheritance from a caller three hops away survives exactly until someone opens the confirm from
  // somewhere else (the sheet lens's own Accept, a deep link, a retry), at which point the bar's inbox hangs
  // over the room it just left and nothing in the file looks wrong. `setOpen(false)` is idempotent, so
  // stating it here costs nothing and removes the dependency.
  const onHandoffAccepted = (chatId: ChatId): void => {
    setOpen(false);
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
  // THE INBOX BODY, in ONE place for both lenses (#1799 restyle). `gap="block"` rather than `row`: the rows
  // are now two-line blocks with their own action cluster, and at `row` the copy of one row sat closer to
  // the buttons of the next than to its own. The width floor grew with them — a decision row's copy plus
  // two buttons could not share 16rem without the buttons wrapping under a truncated sentence.
  //
  // NOT `ListRow` (checked before inventing, UI-Primitives-and-Reuse §13.7): that primitive's whole shape is
  // a CLICKABLE row whose accessible name is its `title` string, and an inbox row is a statement with its
  // own buttons inside it — nesting Accept/Decline in a button is invalid, and a row-level click has nowhere
  // to go (a notification is not a destination). The composed `Row`/`Stack`/`Text` grammar is the fit.
  const inbox = (
    <Stack gap="block" className="min-w-80">
      {items.length === 0 ? (
        // A STATE, not a shrug (`empty-states-are-load-bearing`): the old bare "No notifications." read as a
        // failed load. `titleAs="p"` because the sheet lens already renders a heading above this block and a
        // second one would invent structure the pane does not have.
        //
        // THE ACTION IS "Done", not a destination (`empty-state-has-action`, D62 rule-1): a caught-up inbox
        // has nothing further to point at — "Go to chats" would be an arbitrary door this state has no
        // opinion about — so the CTA is the popover's own next step, closing it. The two lenses close through
        // DIFFERENT doors because there are two different chrome pieces to dismiss: the bar lens closes the
        // Popover it is inside (`setOpen(false)`, the same call `onOpenChange` already uses); the sheet lens
        // has no popover — it rides the You MODAL (`you-modal.tsx`), so its door is `closeModal()`, the same
        // one `ManageDoor`'s sheet arm uses to leave the sheet on a section navigation.
        <EmptyState
          title="You're all caught up"
          titleAs="p"
          description="Invitations, host handoffs and notices from your plugins land here."
          icon={<Icon icon={Bell} size="md" />}
          action={
            <Button intent="secondary" size="sm" onClick={isSheet ? (): void => closeModal() : (): void => setOpen(false)}>
              Done
            </Button>
          }
        />
      ) : (
        // A HAIRLINE BETWEEN ROWS, and it is a MEASURED fix rather than decoration. Two CT-browser shots
        // (gap `field`-in/`block`-out, then `tight`-in/`block`-out) both came back with the same defect:
        // a row's copy sat ~28px above its own buttons and ~35px above the NEXT row's copy, because a
        // `size="sm"` Button's own box height dominates a flex gap — so no gap ratio this list can afford
        // makes the action cluster visibly belong to one row. The rule states the boundary instead of
        // implying it, and it is the house primitive `Section` already uses for exactly this.
        items.map((item, index) => (
          <Fragment key={item.id}>
            {index > 0 ? <Separator aria-hidden={true} /> : null}
            <InboxRow
              item={item}
              acceptedHandoff={acceptedHandoffIds.includes(item.id)}
              onAccepted={onAccepted}
              onOpenPlugins={onOpenPlugins}
              onRequestHandoff={onRequestHandoff}
            />
          </Fragment>
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
                <Button intent="ghost" size="icon" className="relative shell-topbar-icon-btn" aria-label={bellLabel}>
                  <Icon icon={Bell} size="sm" />
                  {/* A DOT, NOT A NUMBER (#1798, owner ruling). What rode here was a full status pill — the
                      same lozenge that marks `always` on a lore entry — printing the count INLINE beside a
                      16px glyph inside the icon button, with no corner positioning. The count is not lost:
                      it is in the button's own accessible name (`bellLabel`) and in the popover's rows. So
                      the mark says only "something is here", and the button is its positioning context
                      (`relative`) — one `tight` step off its own top/end corner, clear of the glyph. */}
                  {showIndicator ? <Badge intent="primary" size="dot" aria-hidden={true} className="absolute end-tight top-tight" /> : null}
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
