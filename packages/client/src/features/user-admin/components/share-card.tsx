// The owner's Share card: the share preconditions as rows with their fixes, then Start sharing, the live link
// and its controls. It polls `share.status`; `/api/auth/config` is memoized per session and would go stale here.
// The link-change memory lives in this card, so a notice survives polls but not leaving the section.

import type { RelayDownReason, RelayStatus, ShareRelayKind, ShareState } from "@orb/contracts/identity";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { CopyButton } from "@orb/ui/copy-button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useId, useState } from "react";
import { ConfirmDialog, QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useAuthConfig, useInvalidation, useTRPC } from "#data";
import { setActiveSection } from "#state";
import { useRevokeUserSessions } from "../hooks/use-admin-mutations.ts";
import { useStartSharing, useStopSharing } from "../hooks/use-share-mutations.ts";
import type { ShareLinkMemory } from "../lib/share-model.ts";
import { dismissLinkChange, EMPTY_SHARE_LINK_MEMORY, rememberShareLink, sharePollMs, shareStartFailure } from "../lib/share-model.ts";
import { SharePreconditions } from "./share-preconditions.tsx";

const STATE_BADGE: Record<ShareState, { readonly label: string; readonly intent: "success" | "info" | "neutral" | "danger" }> = {
  off: { label: "Not sharing", intent: "neutral" },
  starting: { label: "Starting", intent: "info" },
  up: { label: "Sharing", intent: "success" },
  down: { label: "Down", intent: "danger" },
};

const RELAY_NAME: Record<ShareRelayKind, string> = {
  quick: "Cloudflare quick tunnel",
};

function downReason(reason: RelayDownReason): string {
  switch (reason) {
    case "exited":
      return "The relay stopped.";
    case "no_url":
      return "The relay did not report a link in time.";
    case "launch_failed":
      return "The relay could not be started again.";
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

/** The seating settings the card reads, and the one confirmed write that turns the missing ones on. */
export interface ShareCardProps {
  readonly localMultiUser: boolean;
  readonly discreetLogin: boolean;
  readonly onEnableSeating: () => Promise<void>;
}

/** Owner-only: the caller omits it for anyone else. Its own boundary, so a failed read leaves the section standing. */
export function ShareCard(props: ShareCardProps): ReactElement {
  return (
    // RESERVED (#1098) — the Share card settles into its precondition rows or its running panel.
    <QueryBoundary
      fallback={<SkeletonRows count={4} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="sharing — the owner only" onRetry={retry} />}
      reserveKey="config.admin.multiUser.share"
    >
      <ShareCardBody {...props} />
    </QueryBoundary>
  );
}

function ShareCardBody({ localMultiUser, discreetLogin, onEnableSeating }: ShareCardProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const headingId = useId();
  const { data: status } = useSuspenseQuery({
    ...trpc.share.status.queryOptions(),
    refetchInterval: (query): number | false => (query.state.data === undefined ? false : sharePollMs(query.state.data.relay)),
  });
  const mode = useAuthConfig().data?.mode;
  const start = useStartSharing({ trpc, invalidation });
  const stop = useStopSharing({ trpc, invalidation });

  const [memory, setMemory] = useState<ShareLinkMemory>(EMPTY_SHARE_LINK_MEMORY);
  const nextMemory = rememberShareLink(memory, status.relay);
  if (nextMemory !== memory) {
    setMemory(nextMemory);
  }

  const failure = shareStartFailure(start.error);
  // The sticky start.error slot carries a coded refusal to its row; the factory toasts anything else.
  const startSharing = (): void => start.mutate(undefined);
  const relay = status.relay;

  return (
    <Stack gap="field" role="region" aria-labelledby={headingId} data-share-state={relay.state}>
      <Text voice="label" id={headingId}>
        Share over the internet
      </Text>
      <Text voice="gloss">A public link to this server over a free relay, so friends outside your network can sign in.</Text>
      <Row gap="field" align="center" role="status" aria-live="polite">
        <Badge intent={STATE_BADGE[relay.state].intent}>{STATE_BADGE[relay.state].label}</Badge>
        <Text voice="gloss">{stateSentence(relay)}</Text>
      </Row>
      {nextMemory.changed === null ? null : <LinkChangedNotice url={nextMemory.changed.to} onDismiss={(): void => setMemory(dismissLinkChange(nextMemory))} />}
      {relay.state === "off" ? (
        <SharePreconditions
          mode={mode}
          failure={failure}
          localMultiUser={localMultiUser}
          discreetLogin={discreetLogin}
          onEnableSeating={onEnableSeating}
          onStart={startSharing}
          starting={start.isPending}
        />
      ) : (
        <RunningPanel relay={relay} liveSocketCount={status.liveSocketCount} onRestart={startSharing} restarting={start.isPending} />
      )}
      <Row gap="field" align="center" className="flex-wrap">
        {relay.state === "off" ? null : (
          <ConfirmDialog
            title="Stop sharing?"
            description="The link stops working at once. Accounts stay signed in until their sessions expire; sign everyone out to end them too. A new share gets a new link."
            confirmLabel="Stop sharing"
            onConfirm={(): Promise<void> => stop.mutateAsync().then(() => undefined)}
            trigger={
              <Button type="button" intent="secondary" size="sm">
                Stop sharing
              </Button>
            }
          />
        )}
        <SignEveryoneOut />
      </Row>
    </Stack>
  );
}

const SETTLED_SENTENCE: Record<Exclude<ShareState, "down">, string> = {
  off: "Nothing is shared. Every row below must be ready before a link goes out.",
  starting: "Starting the relay. The link appears here in a few seconds.",
  up: "Friends can reach the sign-in page at the link below.",
};

function stateSentence(relay: RelayStatus): string {
  if (relay.state !== "down") {
    return SETTLED_SENTENCE[relay.state];
  }
  return relay.restarting
    ? `${downReason(relay.reason)} Restarting it now; the link will change.`
    : `${downReason(relay.reason)} It stopped retrying after repeated failures.`;
}

interface RunningPanelProps {
  readonly relay: Exclude<RelayStatus, { readonly state: "off" }>;
  readonly liveSocketCount: number;
  readonly onRestart: () => void;
  readonly restarting: boolean;
}

function RunningPanel({ relay, liveSocketCount, onRestart, restarting }: RunningPanelProps): ReactElement {
  return (
    <Stack gap="field">
      {relay.state === "up" ? <ShareLink url={relay.url} /> : null}
      <Text voice="gloss" data-share-relay={relay.relay}>
        Relay: {RELAY_NAME[relay.relay]}.
      </Text>
      <Text voice="gloss" data-live-sockets={liveSocketCount}>
        {liveSocketCount === 1 ? "1 live connection to this server right now." : `${String(liveSocketCount)} live connections to this server right now.`}
      </Text>
      <Row gap="field" align="center" className="flex-wrap">
        {relay.state === "down" && !relay.restarting ? (
          <Button type="button" intent="primary" size="sm" loading={restarting} onClick={onRestart}>
            Start sharing
          </Button>
        ) : null}
        {relay.state === "up" ? (
          <Button type="button" intent="ghost" size="sm" onClick={(): void => setActiveSection("chats")}>
            Invite someone to a room
          </Button>
        ) : null}
      </Row>
      {relay.state === "up" ? (
        <Text voice="gloss">
          Invites are made per room: open a room, then choose Invite people in its Members tab. Each friend also needs an account from Users.
        </Text>
      ) : null}
    </Stack>
  );
}

function ShareLink({ url }: { readonly url: string }): ReactElement {
  return (
    <Stack gap="tight">
      <Text voice="gloss">For anything longer than a session, use a Tailscale Funnel or a named Cloudflare tunnel, whose names survive a restart.</Text>
      <CopyButton text={url} what={`the share link ${url}`}>
        <Text voice="label" className="font-mono break-all" data-share-url={url}>
          {url}
        </Text>
      </CopyButton>
      <Text voice="gloss">
        Anyone with this link reaches your sign-in page, and only the accounts you made can get past it. Sign-in attempts are throttled per visitor address, and
        per handle at three times that.
      </Text>
    </Stack>
  );
}

function LinkChangedNotice({ url, onDismiss }: { readonly url: string; readonly onDismiss: () => void }): ReactElement {
  const titleId = useId();
  return (
    <Stack gap="tight" role="alert" aria-labelledby={titleId} data-share-notice="link-changed">
      <Row gap="field" align="center">
        <Badge intent="warning">Link changed</Badge>
        <Text voice="label" id={titleId}>
          Your friends need the new link
        </Text>
      </Row>
      <CopyButton text={url} what={`the new share link ${url}`}>
        <Text voice="label" className="font-mono break-all">
          {url}
        </Text>
      </CopyButton>
      <Text voice="gloss">Send it to your friends again. The old link is dead, and the relay cannot forward anyone from it.</Text>
      <Text voice="gloss">
        Everyone is signed out at the new link and signs in again there. Drafts and appearance choices kept in the old link's browser storage stay behind;
        settings saved on this server are kept. Tabs still open on the old link have stopped: close them.
      </Text>
      <Text voice="gloss">
        Old invite links still work if you replace their host with the new one. To be safe, revoke and mint them again from the room's invite dialog.
      </Text>
      <Row gap="field" align="center">
        <Button type="button" intent="ghost" size="sm" onClick={onDismiss}>
          Dismiss the link notice
        </Button>
      </Row>
    </Stack>
  );
}

function SignEveryoneOut(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const describedId = useId();
  const { data: users } = useSuspenseQuery(trpc.admin.listUsers.queryOptions());
  const revoke = useRevokeUserSessions({ trpc, invalidation });
  const members = users.filter((user) => user.role !== "owner");
  const nobody = members.length === 0;
  return (
    <>
      <ConfirmDialog
        title="Sign everyone out?"
        description={`Every session of the ${String(members.length)} other ${members.length === 1 ? "account" : "accounts"} ends on every device, and their open tabs disconnect. They can sign in again. Your own session stays.`}
        confirmLabel="Sign everyone out"
        onConfirm={(): Promise<void> => Promise.all(members.map((member) => revoke.mutateAsync({ userId: member.id }))).then(() => undefined)}
        trigger={
          <Button type="button" intent="secondary" size="sm" disabled={nobody} focusableWhenDisabled={true} aria-describedby={nobody ? describedId : undefined}>
            Sign everyone out
          </Button>
        }
      />
      {nobody ? (
        <Text voice="gloss" id={describedId}>
          No other accounts to sign out.
        </Text>
      ) : null}
    </>
  );
}
