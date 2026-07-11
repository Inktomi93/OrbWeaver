// The PEOPLE panel (the multi-human invites lane) — the CONTEXT-panel People tab body: the room's
// PRESENT human members differentiated from the seated cast (the Roster tab = characters; this = the
// humans), plus the HOST's two invite affordances:
//   • invite by handle — `invites.createInvite({ chatId, input: { invitedHandle } })`: the exact public
//     handle (no user directory/listing — the enumeration-free contract), delivered as a durable
//     `invite` notification the invitee accepts from their bell.
//   • copy invite link — an untargeted `createInvite({ chatId, input: {} })`; the RAW token returns
//     exactly ONCE and is immediately composed into the `/join/<token>` share URL on the clipboard
//     (never rendered, never stored — the token's only client-side transit).
// KISS per the owner's steer: a people list + the invite input, NOT a member-management console
// (kick/handoff stay server-ready, unbuilt here). Invite controls render for the HOST only (the verbs
// are host-gated server-side; mirroring it means a member never sees an affordance that would only
// NOT_FOUND — the cast-bar "+" precedent). The tab itself is capability-gated in the surface.

import { blobUrl } from "@orb/contracts/assets";
import type { ParticipantView } from "@orb/contracts/chat";
import type { ChatId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Avatar } from "@orb/ui/avatar";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, SyntheticEvent } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { notify, testId } from "#lib";
import { useCreateInvite } from "../hooks/use-invite-mutations";
import { initialsForAttribution } from "../lib/attribution";

export interface PeoplePanelProps {
  readonly chatId: ChatId;
  /** The PRESENT human seats (`resolveHumanParticipants`, ../lib/roster.ts). */
  readonly humans: readonly ParticipantView[];
  /** The server-resolved `ChatDetail.viewerIsHost` — accurate per-viewer in a multi-human room (never
   *  the first-seat proxy `resolveViewerIsHost`, which mis-grants once a second human is present). */
  readonly viewerIsHost: boolean;
}

/** The People tab body — present humans + (host-only) the invite affordances. */
export function PeoplePanel({ chatId, humans, viewerIsHost }: PeoplePanelProps): ReactElement {
  return (
    <Stack gap="section" data-testid={testId("peoplePanel")}>
      <Text size="label" tone="muted">
        The people in this room. Characters live on the Roster tab.
      </Text>

      {humans.length === 0 ? (
        <Text tone="muted">No one is here yet.</Text>
      ) : (
        <Stack gap="row">
          {humans.map((member) => (
            <PersonRow key={member.id} member={member} />
          ))}
        </Stack>
      )}

      {viewerIsHost ? <InviteControls chatId={chatId} /> : null}
    </Stack>
  );
}

/** One present human: avatar · display name · handle · the host crown as a quiet chip. */
function PersonRow({ member }: { readonly member: ParticipantView }): ReactElement {
  return (
    <Row gap="row" align="center" data-slot="person-row">
      <Avatar
        size="sm"
        fallbackDelay={0}
        // Seed off the participant id — a human seat has no characterId; imageless people still get
        // their own deterministic color, not the shared blank bucket (the cast-bar precedent).
        hueSeed={member.id}
        {...(member.avatarHash === null ? {} : { src: blobUrl(member.avatarHash) })}
      >
        {initialsForAttribution(member.displayName)}
      </Avatar>
      <Text as="span" size="label" weight="medium" className="min-w-0 flex-1 truncate">
        {member.displayName}
        {member.handle === null ? "" : ` · ${member.handle}`}
      </Text>
      {member.role === "host" ? <Badge size="sm">Host</Badge> : null}
    </Row>
  );
}

/** The host's invite mint: targeted-by-handle + the copy-link share path. */
function InviteControls({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const createInvite = useCreateInvite({ trpc, invalidation });
  const [handle, setHandle] = useState("");
  const canInvite = handle.trim().length > 0 && !createInvite.isPending;

  const inviteByHandle = (event: SyntheticEvent): void => {
    event.preventDefault();
    if (!canInvite) {
      return;
    }
    const invited = handle.trim();
    createInvite
      .mutateAsync({ chatId, input: { invitedHandle: castId<Handle>(invited) } })
      .then(() => {
        setHandle("");
        notify.success(`Invited ${invited} — they'll see it in their notifications.`);
      })
      .catch(() => {
        // The mutation's errorToast already surfaced the failure; keep the input for a retry.
      });
  };

  const copyLink = (): void => {
    createInvite
      .mutateAsync({ chatId, input: {} })
      .then(({ token }) =>
        navigator.clipboard.writeText(
          `${globalThis.location.origin}/join/${encodeURIComponent(token)}`,
        ),
      )
      .then(() => notify.success("Invite link copied — anyone with it can join."))
      .catch(() => {
        // Mint failures ride the errorToast; a clipboard refusal gets its own line.
        notify.error("Couldn't copy the invite link.");
      });
  };

  return (
    <form onSubmit={inviteByHandle}>
      <Stack gap="row">
        <Field
          label="Invite by handle"
          description="Their exact handle — invites land in their bell."
        >
          <Input
            autoComplete="off"
            value={handle}
            onValueChange={(value): void => setHandle(value)}
            data-testid={testId("inviteHandleInput")}
          />
        </Field>
        <Row gap="field" align="center">
          <Button
            type="submit"
            intent="secondary"
            size="sm"
            disabled={!canInvite}
            data-testid={testId("inviteSubmit")}
          >
            {createInvite.isPending ? "Inviting…" : "Invite"}
          </Button>
          <Button
            type="button"
            intent="ghost"
            size="sm"
            onClick={copyLink}
            data-testid={testId("inviteCopyLink")}
          >
            Copy invite link
          </Button>
        </Row>
      </Stack>
    </form>
  );
}
