// The invite mint dialog (#2350 — migrated to `FormDialog` DISMISS mode). Two modes: share link
// (untargeted, the raw token returns exactly once and is rendered with a copy button, never re-derivable)
// and invite by handle (targeted, delivered as a notification; an unknown handle renders its refusal
// inline, never silently degraded to a share link). Below the mint form: the outstanding-invites list,
// host-only, with per-row Revoke on pending. Uses DISMISS mode (not PROMPT) because the form body carries
// its own submit and the dialog's exit is just "Done".

import type { ChatId, ChatInviteId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialog } from "#components";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { notify, testId, timeLib } from "#lib";
import { useInviteForm } from "../hooks/use-invite-form.ts";
import { useCreateInvite, useRevokeInvite } from "../hooks/use-invite-mutations.ts";
import type { InviteFormValues } from "../lib/invite-form-model.ts";
import { INVITE_EXPIRY_ITEMS, toCreateInviteInput } from "../lib/invite-form-model.ts";

type InviteView = inferOutput<Trpc["invites"]["listInvites"]>[number];

export interface InviteDialogProps {
  readonly chatId: ChatId;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function InviteDialog({ chatId, open, onOpenChange }: InviteDialogProps): ReactElement {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Invite people"
      description="Anyone with an invite link can join until it expires or runs out of uses."
      testKey="inviteDialog"
      dismissLabel="Done"
    >
      <Stack gap="block">
        <InviteMintForm chatId={chatId} />
        <Separator />
        <OutstandingInvites chatId={chatId} />
      </Stack>
    </FormDialog>
  );
}

// The one BAD_REQUEST createInvite's handle path emits is invite_target_unknown.
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
  const [mintedLink, setMintedLink] = useState<string | null>(null);
  const [handleError, setHandleError] = useState<string | null>(null);

  const save = async (values: InviteFormValues): Promise<InviteFormValues> => {
    setHandleError(null);
    setMintedLink(null);
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
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          event.stopPropagation();
          form.handleSubmit().catch(() => notify.error("Couldn't create the invite."));
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
                    <Text voice="label" role="alert" className="text-destructive">
                      {handleError}
                    </Text>
                  )}
                </Stack>
              ) : null
            }
          </form.Subscribe>

          <Row gap="field" align="start">
            <form.AppField name="expiry">{(field): ReactElement => <field.SelectField label="Expires" items={INVITE_EXPIRY_ITEMS} />}</form.AppField>
            <form.AppField name="maxUses">
              {(field): ReactElement => <field.NumberField label="Max uses" hint="Empty = unlimited." min={1} step={1} />}
            </form.AppField>
          </Row>

          <Row gap="field" justify="end">
            <form.Subscribe selector={(state): string => state.values.mode}>
              {(mode): ReactElement => (
                <form.SubmitButton data-testid={testId("inviteSubmit")}>{mode === "handle" ? "Send invite" : "Create link"}</form.SubmitButton>
              )}
            </form.Subscribe>
          </Row>

          {mintedLink === null ? null : (
            <Stack gap="field" data-testid={testId("inviteLinkResult")}>
              <Text voice="label" className="font-mono break-all">
                {mintedLink}
              </Text>
              <Row gap="field" align="center">
                <Button type="button" intent="secondary" size="sm" onClick={(): void => void copyLink(mintedLink)} data-testid={testId("inviteCopyLink")}>
                  Copy link
                </Button>
                <Text voice="gloss">Copy it now — you won't see this link again.</Text>
              </Row>
            </Stack>
          )}
        </Stack>
      </form>
    </form.AppForm>
  );
}

async function copyLink(link: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(link);
    notify.success("Invite link copied — anyone with it can join.");
  } catch {
    notify.error("Couldn't copy the invite link — copy it from the dialog.");
  }
}

function OutstandingInvites({ chatId }: { readonly chatId: ChatId }): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: invites, isError } = useQuery(trpc.invites.listInvites.queryOptions({ chatId }));
  const revoke = useRevokeInvite({ trpc, invalidation });

  if (isError) {
    return <Text>Couldn't load the outstanding invites.</Text>;
  }
  if (invites === undefined || invites.length === 0) {
    return null;
  }
  return (
    <Stack gap="row" data-testid={testId("inviteOutstandingList")}>
      <Text as="span" voice="kicker">
        Outstanding invites
      </Text>
      {invites.map((invite) => (
        <InviteRow key={invite.id} invite={invite} onRevoke={(inviteId): void => revoke.mutate({ chatId, inviteId })} />
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

function InviteRow({ invite, onRevoke }: { readonly invite: InviteView; readonly onRevoke: (inviteId: ChatInviteId) => void }): ReactElement {
  const uses = invite.maxUses === null ? "unlimited uses" : `${invite.remainingUses ?? 0} of ${invite.maxUses} uses left`;
  const expiry = invite.expiresAt === null ? "never expires" : `expires ${timeLib.formatRelative(invite.expiresAt)}`;
  return (
    <Row gap="field" align="center" justify="between" data-slot="invite-row">
      <Row gap="field" align="center" className="min-w-0">
        <Badge size="sm" intent={STATUS_INTENT[invite.status]}>
          {invite.status}
        </Badge>
        <Text as="span" voice="label" className="min-w-0 truncate">
          {invite.invitedUserId === null ? "Share link" : "Targeted invite"}
        </Text>
        <Text as="span" voice="gloss" className="font-mono whitespace-nowrap">
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
