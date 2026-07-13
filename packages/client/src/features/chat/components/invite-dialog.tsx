// The invite MINT dialog (FINAL-Chats §8.2 / FINAL-Chat-Tab-Redesign §8 — Wave 3). A COMPONENT so the
// Dialog root is legal (client-structure rule 7; the AddCredentialDialog precedent). Host-only openers
// (the Members People header + the ⋯ options menu row); the verbs are `multiHumanProcedure`-belted and
// host-gated server-side.
//
// Two mint modes on ONE §13.4 form factory (`useInviteForm` — mode/handle/expiry/max-uses + validation):
//   • Share link — untargeted `createInvite({ chatId, input: {} + limits })`: the RAW token returns
//     exactly ONCE and is immediately composed into the `/join/<token>` URL — auto-copied AND rendered
//     once with a copy button + "you won't see this again" copy (it is never re-derivable).
//   • Invite by handle — targeted: the exact public handle (no user directory — the enumeration-free
//     contract); delivered as a durable `invite` notification. An unknown handle is the coded
//     `invite_target_unknown` refusal rendered INLINE on the field — never silently degraded to a
//     share link (§8.2). The wire carries only the BAD_REQUEST class (DomainOperationError→BAD_REQUEST,
//     transport error-mapping), which createInvite's handle path emits only for target-unknown.
//
// Below the mint form: the OUTSTANDING-INVITES list (FIX #4 `invites.listInvites` — host-only
// `InviteView`s, no tokens): status badge · targeting · uses/expiry (mono) · per-row Revoke on pending.
// Mount-gated for free (Base UI unmounts the closed popup), refreshed by the create/revoke mutations'
// own `listInvites` invalidation.

import type { ChatId, ChatInviteId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Row, Stack } from "@orb/ui/layout";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { notify, testId, timeLib } from "#lib";
import { useInviteForm } from "../hooks/use-invite-form";
import { useCreateInvite, useRevokeInvite } from "../hooks/use-invite-mutations";
import type { InviteFormValues } from "../lib/invite-form-model";
import { INVITE_EXPIRY_ITEMS, toCreateInviteInput } from "../lib/invite-form-model";

type InviteView = inferOutput<Trpc["invites"]["listInvites"]>[number];

export interface InviteDialogProps {
  readonly chatId: ChatId;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** The mint dialog shell — the form body mounts fresh per open (Base UI unmounts closed popups). */
export function InviteDialog({ chatId, open, onOpenChange }: InviteDialogProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup data-testid={testId("inviteDialog")}>
        <Stack gap="block">
          <DialogTitle>Invite people</DialogTitle>
          <DialogDescription>
            Anyone with an invite link can join until it expires or runs out of uses.
          </DialogDescription>
          <InviteMintForm chatId={chatId} />
          <Separator />
          <OutstandingInvites chatId={chatId} />
          <Row justify="end">
            <DialogClose render={<Button intent="ghost">Done</Button>} />
          </Row>
        </Stack>
      </DialogPopup>
    </Dialog>
  );
}

/** `BAD_REQUEST` classifier for the handle path (see header — the one BAD_REQUEST createInvite's
 *  handle path emits is `invite_target_unknown`; the op code itself doesn't ride the tRPC wire). */
function isBadRequest(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return false;
  }
  const data = (error as { data?: { code?: string } }).data;
  return data?.code === "BAD_REQUEST";
}

function InviteMintForm({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const createInvite = useCreateInvite({ trpc, invalidation });
  // The raw link, shown ONCE post-mint (never re-derivable — §8.2). Cleared on the next mint.
  const [mintedLink, setMintedLink] = useState<string | null>(null);
  const [handleError, setHandleError] = useState<string | null>(null);

  const save = async (values: InviteFormValues): Promise<InviteFormValues> => {
    setHandleError(null);
    setMintedLink(null);
    // Submit-time wall clock (an event handler, not render output) — the sanctioned no-injected-clock
    // source (`performance.timeOrigin + performance.now()`, the lib/log-clock.ts precedent).
    const input = toCreateInviteInput(values, performance.timeOrigin + performance.now());
    try {
      const { token } = await createInvite.mutateAsync({ chatId, input });
      if (values.mode === "handle") {
        notify.success(`Invited ${values.handle.trim()} — they'll see it in their notifications.`);
        return { ...values, handle: "" };
      }
      const link = `${globalThis.location.origin}/join/${encodeURIComponent(token)}`;
      setMintedLink(link);
      await copyLink(link);
      return values;
    } catch (error) {
      if (values.mode === "handle" && isBadRequest(error)) {
        // The enumeration-inherent exact-handle answer (§8.2) — inline, never a silent share link.
        setHandleError("No invitable user with that exact handle.");
      } else {
        notify.error("Couldn't create the invite.");
      }
      throw error;
    }
  };

  const { form } = useInviteForm({ entityId: `invite:${chatId}`, serverValues: undefined, save });

  return (
    <form.AppForm>
      {/* A real <form> so the submit button runs handleSubmit (the add-credential-dialog precedent).
          The raw <form> carries no className (compose-only). */}
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <Stack gap="block">
          <form.AppField name="mode">
            {(field): ReactElement => (
              <ToggleGroup
                aria-label="Invite mode"
                value={[field.state.value]}
                onValueChange={(groupValue): void => {
                  const next = groupValue[0];
                  if (typeof next === "string") {
                    field.handleChange(next);
                  }
                }}
              >
                <Toggle value="link">Share link</Toggle>
                <Toggle value="handle">Invite by handle</Toggle>
              </ToggleGroup>
            )}
          </form.AppField>

          <form.Subscribe selector={(state): string => state.values.mode}>
            {(mode): ReactElement | null =>
              mode === "handle" ? (
                <Stack gap="field">
                  <form.AppField name="handle">
                    {(field): ReactElement => (
                      <field.TextField
                        label="Handle"
                        description="Their exact handle — the invite lands in their notifications."
                        autoComplete="off"
                        data-testid={testId("inviteHandleInput")}
                      />
                    )}
                  </form.AppField>
                  {handleError === null ? null : (
                    <Text size="label" tone="destructive" role="alert">
                      {handleError}
                    </Text>
                  )}
                </Stack>
              ) : null
            }
          </form.Subscribe>

          <Row gap="field" align="start">
            <form.AppField name="expiry">
              {(field): ReactElement => (
                <field.SelectField label="Expires" items={INVITE_EXPIRY_ITEMS} />
              )}
            </form.AppField>
            <form.AppField name="maxUses">
              {(field): ReactElement => (
                <field.NumberField label="Max uses" hint="Empty = unlimited." min={1} step={1} />
              )}
            </form.AppField>
          </Row>

          <Row gap="field" justify="end">
            <form.Subscribe selector={(state): string => state.values.mode}>
              {(mode): ReactElement => (
                <form.SubmitButton data-testid={testId("inviteSubmit")}>
                  {mode === "handle" ? "Send invite" : "Create link"}
                </form.SubmitButton>
              )}
            </form.Subscribe>
          </Row>

          {mintedLink === null ? null : (
            <Stack gap="field" data-testid={testId("inviteLinkResult")}>
              <Text size="label" weight="medium" className="font-mono break-all">
                {mintedLink}
              </Text>
              <Row gap="field" align="center">
                <Button
                  type="button"
                  intent="secondary"
                  size="sm"
                  onClick={(): void => void copyLink(mintedLink)}
                  data-testid={testId("inviteCopyLink")}
                >
                  Copy link
                </Button>
                <Text size="micro" tone="muted">
                  Copy it now — you won't see this link again.
                </Text>
              </Row>
            </Stack>
          )}
        </Stack>
      </form>
    </form.AppForm>
  );
}

/** Clipboard write with its own failure line (a mint success must not read as a copy success). */
async function copyLink(link: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(link);
    notify.success("Invite link copied — anyone with it can join.");
  } catch {
    notify.error("Couldn't copy the invite link — copy it from the dialog.");
  }
}

/** The FIX #4 outstanding-invites list — host-only read; per-row Revoke on pending invites. */
function OutstandingInvites({ chatId }: { readonly chatId: ChatId }): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  // Mount-gated by the dialog (closed popups unmount) — a plain read, no suspense inside a dialog.
  const { data: invites, isError } = useQuery(trpc.invites.listInvites.queryOptions({ chatId }));
  const revoke = useRevokeInvite({ trpc, invalidation });

  if (isError) {
    return <Text tone="muted">Couldn't load the outstanding invites.</Text>;
  }
  if (invites === undefined || invites.length === 0) {
    return null; // nothing outstanding — the mint form is the whole dialog (never a dead list).
  }
  return (
    <Stack gap="row" data-testid={testId("inviteOutstandingList")}>
      <Text as="span" size="micro" tone="muted" transform="caps">
        Outstanding invites
      </Text>
      {invites.map((invite) => (
        <InviteRow
          key={invite.id}
          invite={invite}
          onRevoke={(inviteId): void => revoke.mutate({ chatId, inviteId })}
        />
      ))}
    </Stack>
  );
}

const STATUS_INTENT: Record<InviteView["status"], "info" | "success" | "neutral" | "danger"> = {
  pending: "info",
  accepted: "success",
  declined: "neutral",
  expired: "neutral",
  revoked: "danger",
};

function InviteRow({
  invite,
  onRevoke,
}: {
  readonly invite: InviteView;
  readonly onRevoke: (inviteId: ChatInviteId) => void;
}): ReactElement {
  const uses =
    invite.maxUses === null
      ? "unlimited uses"
      : `${invite.remainingUses ?? 0} of ${invite.maxUses} uses left`;
  const expiry =
    invite.expiresAt === null
      ? "never expires"
      : `expires ${timeLib.formatRelative(invite.expiresAt)}`;
  return (
    <Row gap="field" align="center" justify="between" data-slot="invite-row">
      <Row gap="field" align="center" className="min-w-0">
        <Badge size="sm" intent={STATUS_INTENT[invite.status]}>
          {invite.status}
        </Badge>
        <Text as="span" size="label" className="min-w-0 truncate">
          {invite.invitedUserId === null ? "Share link" : "Targeted invite"}
        </Text>
        <Text as="span" size="micro" tone="muted" className="font-mono whitespace-nowrap">
          {uses} · {expiry}
        </Text>
      </Row>
      {invite.status === "pending" ? (
        <Button
          type="button"
          intent="ghost"
          size="sm"
          onClick={(): void => onRevoke(invite.id)}
          aria-label={`Revoke this ${invite.invitedUserId === null ? "share link" : "targeted invite"}`}
        >
          Revoke
        </Button>
      ) : null}
    </Row>
  );
}
