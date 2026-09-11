// One inbox row: the delivery copy + its action cluster, split out of notification-bell.tsx by the
// `component-size` cap (#1799's restyle grew the file past 450 lines). The row is a fully self-contained
// leaf — it owns its own per-item mutations (accept/decline/dismiss) and in-flight state — so the split
// costs the bell nothing beyond passing it the four callbacks it already owned. The bell still composes
// the list (`Stack`/`Separator`/`EmptyState`) around it; only the per-row rendering + writes live here.

import type { NotificationEvent, NotificationType } from "@orb/contracts/notifications";
import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { useDismissNotification } from "../hooks/use-inbox.ts";
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

function rowCopy(payload: NotificationEvent): string {
  const handler = ROW_COPY[payload.type] as (p: NotificationEvent) => string;
  return handler(payload);
}

export interface InboxRowProps {
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
export function InboxRow({ item, onAccepted, onRequestHandoff, acceptedHandoff, onOpenPlugins }: InboxRowProps): ReactElement {
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
    // @orb-waive caught-failure-ownership(work): every `work` this wraps (accept/decline/
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
    // THE ROW IS A BLOCK, AND EVERY ROW IS THE SAME BLOCK (#1799 restyle): the statement on its own line,
    // the controls on their own line under it, ended flush right. Side-by-side was the previous shape and it
    // could not hold both — a decision row's sentence truncated to make room for two buttons, so the one row
    // that needed reading was the one that could not be read.
    //
    // `data-pending` IS THE MACHINE-READABLE HALF of the pending/informational distinction — an attribute,
    // not just paint, so a probe (and the CT) can tell the two apart without decoding pixels, and so the
    // fact travels wherever the row does. Present-with-empty-value, the house `data-*` idiom.
    // `gap="tight"` INSIDE against the list's `gap="block"` OUTSIDE, and the ratio is the whole point:
    // MEASURED on the CT-browser shot at the first attempt (`field` inside, `block` outside), a row's own
    // copy sat ~30px from its buttons while the NEXT row's copy sat ~35px from those same buttons — near
    // enough that the cluster read as belonging to whichever row you looked at first. 4px against 12px is
    // unambiguous without a rule between rows.
    <Stack gap="tight" data-slot="inbox-row" {...(item.actionable ? { "data-pending": "" } : {})}>
      <Row gap="field" align="start">
        {/* THE SAME MARK THE BELL WEARS. A row that is still waiting on you gets the dot the trigger got
            (#1798's `size="dot"` arm), so "there is a dot" means one thing in this feature rather than two —
            you open the bell because of a dot and find the dot that put it there. `aria-hidden`: the row's
            own actions are what say it is decidable; the mark is the sighted shorthand. */}
        {item.actionable ? <Badge intent="primary" size="dot" aria-hidden={true} className="mt-field" /> : null}
        <Text as="span" size="label" weight={item.readAt === null || item.actionable ? "medium" : undefined}>
          {rowCopy(item.payload)}
        </Text>
      </Row>
      <Row gap="field" align="center" justify="end">
        {isInvite && !acted ? (
          <>
            <Button
              aria-label={`Accept invitation from ${item.payload.invitedByHandle}`}
              type="button"
              disabled={isPending}
              intent="primary"
              size="sm"
              onClick={acceptInvite}
            >
              Accept
            </Button>
            <Button
              aria-label={`Decline invitation from ${item.payload.invitedByHandle}`}
              type="button"
              disabled={isPending}
              intent="secondary"
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
            intent="primary"
            size="sm"
            onClick={(): void => onRequestHandoff(item)}
          >
            Accept
          </Button>
        ) : null}
        {isConsent ? (
          <Button aria-label="Review what your plugins ask for" type="button" disabled={isPending} intent="primary" size="sm" onClick={reviewConsent}>
            Review
          </Button>
        ) : null}
        {/* DISMISS STAYS GHOST, and that is a deviation from the brief's "Decline/Dismiss = secondary" with
            a reason: Dismiss is on EVERY row, including the nine-strong run of notices and consent asks a
            fresh boot lands, and at `secondary` that run is a wall of bordered boxes with no focal point
            left for the one row that actually asks something. Decline DID move up — it is Accept's peer, a
            real second answer — but Dismiss is the escape hatch, never the row's point. */}
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
    </Stack>
  );
}
