// The owner's Share card: the share preconditions with their fixes, Start sharing, the live link and its controls, then
// the IP certificate (D269). It polls `share.status`, since `/api/auth/config` is memoized per session and goes stale.
// Focus never falls to the page when a control it sits on unmounts; `ShareCardBody` names each successor.

import type { CookieAuthMode, RelayDownReason, ShareRelayKind } from "@orb/contracts/identity";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { CopyButton } from "@orb/ui/copy-button";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode, Ref } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { ConfirmDialog, QueryBoundary } from "#components";
import type { AuthConfig } from "#data";
import { QueryErrorState, SkeletonRows, useAuthConfig, useInvalidation, useTRPC } from "#data";
import { useRevokeUserSessions } from "../hooks/use-admin-mutations.ts";
import { useStartSharing, useStopSharing } from "../hooks/use-share-mutations.ts";
import type { SHARE_PHASES, ShareLinkMemory } from "../lib/share-model.ts";
import { dismissLinkChange, EMPTY_SHARE_LINK_MEMORY, rememberShareLink, shareStartFailure, shareStatusPollMs, shareView } from "../lib/share-model.ts";
import { InviteRoomPicker } from "./share-invite-picker.tsx";
import { ShareIpCertificate } from "./share-ip-certificate.tsx";
import { SharePreconditions } from "./share-preconditions.tsx";
import { ShareProse, ShareWarningText } from "./share-prose.tsx";

const SHARE_CARD_TITLE = "Share over the internet";

type ShareView = ReturnType<typeof shareView>;

const PHASE_BADGE: Record<(typeof SHARE_PHASES)[number], { readonly label: string; readonly intent: "success" | "info" | "neutral" | "danger" }> = {
  off: { label: "Not sharing", intent: "neutral" },
  starting: { label: "Starting", intent: "info" },
  up: { label: "Sharing", intent: "success" },
  restarting: { label: "Down", intent: "danger" },
  stopped: { label: "Down", intent: "danger" },
};

// Where focus that fell to the page goes in each phase: the relay's own controls while it starts, restarts or has
// stopped. Off and up hand focus on their own (Start after a stop, the link's Copy after a start).
const PHASE_FOCUS: Record<(typeof SHARE_PHASES)[number], "stop" | "tryAgain" | null> = {
  off: null,
  starting: "stop",
  up: null,
  restarting: "stop",
  stopped: "tryAgain",
};

// An oidc box needs no relay: the badge names what it already is.
const PUBLIC_BADGE = { label: "Public", intent: "success" } as const;

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

const SETTLED_SENTENCE: Record<Exclude<(typeof SHARE_PHASES)[number], "restarting" | "stopped">, string> = {
  off: "Nothing is shared. Every row below must be ready before a link goes out.",
  starting: "Starting the relay. The link appears here in a few seconds.",
  up: "Friends can reach the sign-in page at the link below.",
};

function stateSentence(view: ShareView): string {
  if (view.phase === "restarting") {
    return `${downReason(view.reason)} Restarting it under a new link.`;
  }
  if (view.phase === "stopped") {
    return `${downReason(view.reason)} It stopped retrying after repeated failures. Try again to share under a new link.`;
  }
  return SETTLED_SENTENCE[view.phase];
}

// A password typed on this page crosses a network in clear: plain http, from anywhere but this machine.
function crossesNetworkInClear(authConfig: Pick<AuthConfig, "transport" | "clientScope"> | undefined): boolean {
  return authConfig !== undefined && authConfig.transport === "http" && authConfig.clientScope !== "loopback";
}

// Focus left on a control that unmounted lands on the page body; only then does a late successor take it.
function focusIsLost(): boolean {
  return document.activeElement === null || document.activeElement === document.body;
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
    <Card>
      <Section heading={SHARE_CARD_TITLE} level={4} aria-label={SHARE_CARD_TITLE}>
        {/* RESERVED (#1098) — the Share card settles into its precondition rows or its running panel. */}
        <QueryBoundary
          fallback={<SkeletonRows count={4} />}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="sharing — the owner only" onRetry={retry} />}
          reserveKey="config.admin.multiUser.share"
        >
          <ShareCardBody {...props} />
        </QueryBoundary>
      </Section>
    </Card>
  );
}

function ShareCardBody({ localMultiUser, discreetLogin, onEnableSeating }: ShareCardProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: status } = useSuspenseQuery({
    ...trpc.share.status.queryOptions(),
    refetchInterval: (query): number | false => (query.state.data === undefined ? false : shareStatusPollMs(query.state.data)),
  });
  const authConfig = useAuthConfig().data;
  const start = useStartSharing({ trpc, invalidation });
  const stop = useStopSharing({ trpc, invalidation });

  const [memory, setMemory] = useState<ShareLinkMemory>(EMPTY_SHARE_LINK_MEMORY);
  const nextMemory = rememberShareLink(memory, status.relay);
  if (nextMemory !== memory) {
    setMemory(nextMemory);
  }

  // The focus successors. Start sharing follows a stop or the seating confirm, whose triggers unmount. While the relay
  // starts, restarts or has stopped, focus that fell to the page goes to Stop sharing or Try again (the phase effect
  // below). A start's own focus then moves on to the link's Copy button, which mounts only when the relay reports its
  // link, seconds after the press.
  const startRef = useRef<HTMLButtonElement | null>(null);
  const stopRef = useRef<HTMLButtonElement | null>(null);
  const tryAgainRef = useRef<HTMLButtonElement | null>(null);
  const linkCopyRef = useRef<HTMLButtonElement | null>(null);
  const focusLinkWhenUp = useRef(false);
  const linkCopyTarget = (node: HTMLButtonElement | null): void => {
    linkCopyRef.current = node;
    if (node !== null && focusLinkWhenUp.current) {
      focusLinkWhenUp.current = false;
      if (focusIsLost() || document.activeElement === stopRef.current) {
        node.focus();
      }
    }
  };
  const [stopOpen, setStopOpen] = useState(false);

  const failure = shareStartFailure(start.error);
  // The sticky start.error slot carries a coded refusal to its row; the factory toasts anything else.
  const startSharing = (): void => {
    focusLinkWhenUp.current = true;
    start.mutate(undefined, {
      onError: (): void => {
        focusLinkWhenUp.current = false;
      },
    });
  };
  const view = shareView(status.relay);
  // The control that replaced the one focus was on, where the phase change unmounted it: the relay's controls while
  // it starts, restarts or has stopped. Only focus that fell to the page is moved, never focus the owner placed.
  useEffect((): void => {
    if (!focusIsLost()) {
      return;
    }
    const successor = PHASE_FOCUS[view.phase];
    if (successor !== null) {
      (successor === "stop" ? stopRef : tryAgainRef).current?.focus();
    }
  }, [view.phase]);
  // An oidc box is public already, and a relay's random name can never sign anyone in through its identity provider:
  // the card names the box's own address and offers no relay (the server refuses one too).
  const publicOnly = authConfig?.mode === "oidc" && status.relay.state === "off";
  const badge = publicOnly ? PUBLIC_BADGE : PHASE_BADGE[view.phase];

  return (
    <Stack gap="field" data-share-state={status.relay.state} data-share-phase={view.phase}>
      {publicOnly ? null : <ShareProse>A public link to this server over a free relay, so friends outside your network can sign in.</ShareProse>}
      {/* Baseline, not center: at phone width the sentence runs to several lines, and the badge labels its first. */}
      <Row gap="field" align="baseline" role="status" aria-live="polite">
        <Badge intent={badge.intent}>{badge.label}</Badge>
        <ShareProse>
          {publicOnly ? "Friends sign in at this server's own address through your identity provider, so invite them there." : stateSentence(view)}
        </ShareProse>
      </Row>
      {publicOnly ? <PublicAddressPanel kind="oidc" addresses={status.publicAddresses} /> : null}
      {status.relay.state === "off" && !publicOnly ? (
        <Stack gap="block">
          {status.publicAddresses.length === 0 ? null : (
            <Stack gap="field">
              <ShareProse>
                This server already answers at the address below. If friends can reach it from the internet, invite them there, with no relay.
              </ShareProse>
              <PublicAddressPanel kind="local" addresses={status.publicAddresses} />
            </Stack>
          )}
          <SharePreconditions
            mode={authConfig?.mode}
            failure={failure}
            localMultiUser={localMultiUser}
            discreetLogin={discreetLogin}
            onEnableSeating={onEnableSeating}
            onStart={startSharing}
            starting={start.isPending}
            startRef={startRef}
          />
        </Stack>
      ) : null}
      {status.relay.state === "off" ? null : (
        <Stack gap="field">
          {view.phase === "up" ? (
            <UpPanel
              url={view.url}
              changed={nextMemory.changed !== null}
              plainHttp={crossesNetworkInClear(authConfig)}
              linkCopyRef={linkCopyTarget}
              onDismissChange={(): void => {
                setMemory(dismissLinkChange(nextMemory));
                linkCopyRef.current?.focus();
              }}
            />
          ) : null}
          <ShareProse>{`Relay: ${RELAY_NAME[status.relay.relay]}. ${liveSentence(status.liveSocketCount)}`}</ShareProse>
        </Stack>
      )}
      <Row gap="field" align="center" className="flex-wrap">
        {view.phase === "stopped" ? (
          <Button ref={tryAgainRef} type="button" intent="primary" size="sm" loading={start.isPending} onClick={startSharing}>
            Try again
          </Button>
        ) : null}
        {view.phase === "off" ? null : (
          <Button ref={stopRef} type="button" intent="secondary" size="sm" onClick={(): void => setStopOpen(true)}>
            Stop sharing
          </Button>
        )}
        <SignEveryoneOut />
      </Row>
      {/* A second way in, beside the relay: https straight to this box's public address when the router forwards to it. */}
      <ShareIpCertificate mode={authConfig?.mode} certificate={status.certificate} />
      {/* Mounted in every phase: the stop lands as `off`, which unmounts its trigger while this closes. */}
      <ConfirmDialog
        open={stopOpen}
        onOpenChange={setStopOpen}
        title="Stop sharing?"
        description="The link stops working at once. Accounts stay signed in until their sessions expire; sign everyone out to end them too. A new share gets a new link."
        confirmLabel="Stop sharing"
        onConfirm={(): Promise<void> => stop.mutateAsync().then(() => undefined)}
        finalFocus={startRef}
      />
    </Stack>
  );
}

// The addresses a stranger already reaches this server at, each with its Copy, and the way into a room's invites.
// `kind` names why they exist: an oidc box's registered return addresses, or a local box's public ALLOWED_HOSTS names.
function PublicAddressPanel({ kind, addresses }: { readonly kind: CookieAuthMode; readonly addresses: readonly string[] }): ReactElement {
  return (
    <Stack gap="field" data-share-public={kind}>
      {addresses.map((address) => (
        <CopyButton key={address} text={address} what={`the address ${address}`}>
          <Text voice="label" className="min-w-0 font-mono break-words" data-public-address={address}>
            <BreakableUrl url={address} />
          </Text>
        </CopyButton>
      ))}
      <Row gap="field" align="center">
        <InviteRoomPicker />
      </Row>
    </Stack>
  );
}

function liveSentence(count: number): string {
  return count === 1 ? "1 live connection from another account right now." : `${String(count)} live connections from other accounts right now.`;
}

interface UpPanelProps {
  readonly url: string;
  readonly changed: boolean;
  readonly plainHttp: boolean;
  readonly linkCopyRef: Ref<HTMLButtonElement>;
  readonly onDismissChange: () => void;
}

// The live link first, then what it exposes, then the way to use it, then the longer-lived alternative.
function UpPanel({ url, changed, plainHttp, linkCopyRef, onDismissChange }: UpPanelProps): ReactElement {
  return (
    <Stack gap="field">
      {changed ? <LinkChangedNotice onDismiss={onDismissChange} /> : null}
      <CopyButton ref={linkCopyRef} text={url} what={`the share link ${url}`}>
        <Text voice="label" className="min-w-0 font-mono break-words" data-share-url={url}>
          <BreakableUrl url={url} />
        </Text>
      </CopyButton>
      <Stack gap="tight" role="note" data-share-warning="public-link">
        <Row gap="field" align="center">
          <Badge intent="warning">Public link</Badge>
        </Row>
        <ShareWarningText>
          Anyone with this link reaches your sign-in page, and only an account gets past it: one made in Users, or one a sign-up link creates. An account a
          sign-up link creates runs AI turns at your cost until the room's host kicks it or an admin disables it.
        </ShareWarningText>
        {plainHttp ? (
          <ShareWarningText data-share-warning="plain-http">
            This page is on plain http, so a password typed at this address crosses your network in clear. Friends on the link use https.
          </ShareWarningText>
        ) : null}
        <ShareProse>Sign-in attempts are throttled per visitor address, and per handle at three times that.</ShareProse>
      </Stack>
      <Stack gap="tight">
        <Row gap="field" align="center">
          <InviteRoomPicker />
        </Row>
        <ShareProse>
          Pick a room to open its invite dialog. A friend without an account needs one from Users, or a sign-up link an admin makes in that dialog.
        </ShareProse>
      </Stack>
      <ShareProse data-share-tip="named-tunnel">
        For anything longer than a session, use a Tailscale Funnel or a named Cloudflare tunnel, whose names survive a restart.
      </ShareProse>
    </Stack>
  );
}

// A URL breaks after its dots, slashes and hyphens, never inside a word; `<wbr>` is not copied with a selection.
function BreakableUrl({ url }: { readonly url: string }): ReactNode {
  let offset = 0;
  return url.split(/(?<=[./-])/u).map((part) => {
    offset += part.length;
    return (
      <span key={offset}>
        {part}
        <wbr />
      </span>
    );
  });
}

function LinkChangedNotice({ onDismiss }: { readonly onDismiss: () => void }): ReactElement {
  return (
    <Stack gap="tight" data-share-notice="link-changed">
      <Row gap="field" align="center" className="flex-wrap">
        <Badge intent="warning">Link changed</Badge>
        <ShareWarningText role="alert">Your friends need the new link below</ShareWarningText>
      </Row>
      <ShareProse>Send it to your friends again. The old link is dead, and the relay cannot forward anyone from it.</ShareProse>
      <ShareProse>
        Everyone is signed out at the new link and signs in again there. Drafts and appearance choices kept in the old link's browser storage stay behind;
        settings saved on this server are kept. Tabs still open on the old link have stopped: close them.
      </ShareProse>
      <ShareProse>
        Old invite links still work if you replace their host with the new one. To be safe, revoke and mint them again from the room's invite dialog.
      </ShareProse>
      <Row gap="field" align="center">
        <Button type="button" intent="secondary" size="sm" onClick={onDismiss}>
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
      {nobody ? <ShareProse id={describedId}>No other accounts to sign out.</ShareProse> : null}
    </>
  );
}
