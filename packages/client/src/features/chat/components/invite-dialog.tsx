// The invite mint dialog (#2350 — migrated to `FormDialog` DISMISS mode). Two modes: share link
// (untargeted, the raw token returns exactly once and is rendered with a copy button, never re-derivable)
// and invite by handle (targeted, delivered as a notification; an unknown handle renders its refusal
// inline, never silently degraded to a share link). Below the mint form: the outstanding-invites list,
// host-only, with per-row Revoke on pending. Uses DISMISS mode (not PROMPT) because the form body carries
// its own submit and the dialog's exit is just "Done".

import { SIGNUP_INVITES_MINTABLE, SIGNUP_MAX_TTL_DAYS, SIGNUP_MAX_USES } from "@orb/contracts/chat";
import { isLoopbackHost } from "@orb/kit/allowed-hosts";
import type { ChatId, ChatInviteId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { CopyButton } from "@orb/ui/copy-button";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, RefObject } from "react";
import { useState } from "react";
import { FormDialog } from "#components";
import type { Trpc } from "#data";
import { fetchLiveShare, useAuthConfig, useInvalidation, useLiveShare, useSettingsViewerView, useTRPC } from "#data";
import { notify, testId, timeLib } from "#lib";
import { useInviteForm } from "../hooks/use-invite-form.ts";
import { useCreateInvite, useRevokeInvite } from "../hooks/use-invite-mutations.ts";
import type { InviteFormValues } from "../lib/invite-form-model.ts";
import { INVITE_EXPIRY_ITEMS, inviteJoinLink, toCreateInviteInput } from "../lib/invite-form-model.ts";

type InviteView = inferOutput<Trpc["invites"]["listInvites"]>[number];

export interface InviteDialogProps {
  readonly chatId: ChatId;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The room's own invite trigger: a dialog another section asked for opens with no trigger focused. */
  readonly finalFocus?: RefObject<HTMLElement | null>;
}

export function InviteDialog({ chatId, open, onOpenChange, finalFocus }: InviteDialogProps): ReactElement {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      {...(finalFocus === undefined ? {} : { finalFocus })}
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

// D254 — the sign-up switch is drawn for a global admin in a mode that mints signup invites. A render gate
// only: an unresolved read hides it, and the mint verb refuses every other caller and mode on its own.
function useSignupOffered(): boolean {
  const { isAdmin } = useSettingsViewerView();
  const mode = useAuthConfig().data?.mode;
  return isAdmin && mode !== undefined && SIGNUP_INVITES_MINTABLE[mode];
}

function InviteMintForm({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const createInvite = useCreateInvite({ trpc, invalidation });
  const signupOffered = useSignupOffered();
  const [mintedLink, setMintedLink] = useState<string | null>(null);
  const [handleError, setHandleError] = useState<string | null>(null);
  const [signupError, setSignupError] = useState<string | null>(null);

  const save = async (values: InviteFormValues): Promise<InviteFormValues> => {
    setHandleError(null);
    setSignupError(null);
    setMintedLink(null);
    const input = toCreateInviteInput(values, performance.timeOrigin + performance.now());
    try {
      // Read before the mint: the token shows once, so a link must never be built on a share state that failed to load.
      const share = values.mode === "link" ? await fetchLiveShare() : null;
      const { token } = await createInvite.mutateAsync({ chatId, input });
      if (share === null) {
        notify.success(`Invited ${values.handle.trim()} — they'll see it in their notifications.`);
        return { ...values, handle: "" };
      }
      setMintedLink(inviteJoinLink(token, share, globalThis.location.origin));
      return values;
    } catch (error) {
      if (values.mode === "handle" && isBadRequest(error)) {
        setHandleError("No invitable user with that exact handle.");
      } else if (input.allowSignup === true) {
        // Inline, not a toast: a toast paints under the modal backdrop. The server measures the expiry on its
        // own clock, so a longest-expiry link from a device whose clock runs ahead is refused here too.
        setSignupError("The server refused this sign-up link. Try a shorter expiry or fewer uses.");
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

          <form.Subscribe selector={(state): string => state.values.mode}>
            {(mode): ReactElement | null => (mode === "link" ? <LoopbackLinkWarning /> : null)}
          </form.Subscribe>

          <Row gap="field" align="start">
            <form.AppField name="expiry">{(field): ReactElement => <field.SelectField label="Expires" items={INVITE_EXPIRY_ITEMS} />}</form.AppField>
            <form.AppField name="maxUses">
              {(field): ReactElement => <field.NumberField label="Max uses" hint="Empty = unlimited." min={1} step={1} />}
            </form.AppField>
          </Row>

          {signupOffered ? (
            <form.Subscribe selector={(state): string => state.values.mode}>
              {(mode): ReactElement | null =>
                mode === "link" ? (
                  <Stack gap="field" data-testid={testId("inviteAllowSignup")}>
                    <form.AppField name="allowSignup">
                      {(field): ReactElement => (
                        <field.SwitchField
                          label="Let people without an account sign up"
                          description={`Each use creates an account and seats it here. It needs 1 to ${SIGNUP_MAX_USES} uses and an expiry of ${SIGNUP_MAX_TTL_DAYS} days or less.`}
                        />
                      )}
                    </form.AppField>
                    {signupError === null ? null : (
                      <Text voice="label" role="alert" className="text-destructive">
                        {signupError}
                      </Text>
                    )}
                  </Stack>
                ) : null
              }
            </form.Subscribe>
          ) : null}

          <Row gap="field" justify="end">
            <form.Subscribe selector={(state): string => state.values.mode}>
              {(mode): ReactElement => (
                <form.SubmitButton data-testid={testId("inviteSubmit")}>{mode === "handle" ? "Send invite" : "Create link"}</form.SubmitButton>
              )}
            </form.Subscribe>
          </Row>

          {mintedLink === null ? null : (
            <Stack gap="field" data-testid={testId("inviteLinkResult")}>
              <Text voice="gloss">Copy it now — you won't see this link again.</Text>
              {/* Copied on arrival. A failed copy lands in this control's own status and field, inside the dialog:
                  a toast would paint under the modal backdrop, and the link is shown only once. */}
              <CopyButton autoCopy={true} copiedHint="Anyone with it can join." data-testid={testId("inviteCopyLink")} text={mintedLink} what="invite link">
                <Text voice="label" className="font-mono break-all">
                  {mintedLink}
                </Text>
              </CopyButton>
            </Stack>
          )}
        </Stack>
      </form>
    </form.AppForm>
  );
}

// A link minted on a loopback page opens only on this computer. While a share is up the link carries its public
// address instead, so the warning shows only when no share is live.
function LoopbackLinkWarning(): ReactElement | null {
  const share = useLiveShare().data;
  if (share === undefined || share.state === "up" || !isLoopbackHost(globalThis.location.hostname)) {
    return null;
  }
  return (
    <Stack gap="tight" role="note" data-invite-warning="loopback">
      <Row gap="field" align="center">
        <Badge intent="warning">Only this computer</Badge>
      </Row>
      <Text voice="gloss">
        This page is open at a local address, so a link made here opens only on this computer. To invite a friend, start sharing in Settings, under Admin and
        Multi-user, or open this app at an address they can reach.
      </Text>
    </Stack>
  );
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
    // ListRow floors the label's width, and in a narrow dialog Revoke takes its own line, so the limits
    // never run under it and the label never squeezes to nothing. Revoke is one compact control, so the
    // row stacks below `cq-sm`: the `cq-md` default would stack it in the desktop dialog too.
    <ListRow
      stackActions={true}
      stackActionsAt="cq-sm"
      actions={
        invite.status === "pending" ? (
          <Button
            type="button"
            intent="ghost"
            size="sm"
            onClick={(): void => onRevoke(invite.id)}
            aria-label={`Revoke this ${invite.invitedUserId === null ? "share link" : "targeted invite"}`}
          >
            Revoke
          </Button>
        ) : null
      }
      leading={
        <Badge size="sm" intent={STATUS_INTENT[invite.status]}>
          {invite.status}
        </Badge>
      }
      subtitle={`${uses} · ${expiry}`}
      subtitleWrap={true}
      title={invite.invitedUserId === null ? "Share link" : "Targeted invite"}
    />
  );
}
