// B5 — the "Link SSO identity" dialog (Settings → Admin → Link SSO identity → a row's Link). ONE controlled
// text input for the STABLE IdP subject (authentik `sub`/`uid`) — the §13.4 trivial-input carve-out (the
// reset-password-dialog precedent). Submitting calls `admin.linkSsoIdentity`, which stamps the subject onto
// the row so that user's first SSO login hits by `externalId` (no orphan). Server refuses the owner/agent
// target and a subject already bound elsewhere; those surface as the sticky mutation error. Base UI unmounts
// the closed popup, so a reopen never shows a previous subject.

import { externalIdSchema } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialogPopup, FormDialogRoot } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { notify, testId } from "#lib";
import { useLinkSsoIdentity } from "../hooks/use-admin-mutations.ts";
import type { AdminUserDialogProps } from "../lib/admin-model.ts";

/** The dialog shell — the body mounts fresh per open (Base UI unmounts closed popups). */
export function AdminLinkSsoDialog(props: AdminUserDialogProps): ReactElement {
  return (
    <FormDialogRoot onOpenChange={props.onOpenChange} open={props.open}>
      <LinkSsoBody handle={props.handle} userId={props.userId} onDone={(): void => props.onOpenChange(false)} />
    </FormDialogRoot>
  );
}

function LinkSsoBody({ handle, userId, onDone }: { readonly handle: string; readonly userId: UserId; readonly onDone: () => void }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const link = useLinkSsoIdentity({ trpc, invalidation });
  const [subject, setSubject] = useState("");
  const trimmed = subject.trim();

  const submit = async (): Promise<void> => {
    if (trimmed.length === 0) {
      return;
    }
    // The failure is rendered by the `link.error !== null` line in this component and also toasted by
    // useLinkSsoIdentity's `errorToast`; the dialog stays open. Ends if either stops.
    try {
      await link.mutateAsync({ userId, externalId: externalIdSchema.parse(trimmed) });
    } catch {
      // The sticky mutation error renders below — stay open.
      return;
    }
    notify.success("SSO identity linked — their next single sign-on will use this account.");
    onDone();
  };

  return (
    <FormDialogPopup
      description="Stamp this account's stable SSO subject (the IdP's sub/uid — never an email) so their first single sign-on lands on this same account instead of a new one."
      submit={{
        label: link.isPending ? "Linking…" : "Link identity",
        disabled: link.isPending || trimmed.length === 0,
        testKey: "adminLinkSsoSubmit",
        onSubmit: (): void => void submit().catch(globalThis.reportError),
      }}
      testKey="adminLinkSsoDialog"
      title={`Link SSO identity — ${handle}`}
    >
      <Field label="Stable SSO subject" description="The IdP's stable id for this user (e.g. authentik sub/uid). Not an email.">
        <Input autoComplete="off" onValueChange={(value): void => setSubject(value)} value={subject} data-testid={testId("adminLinkSsoSubject")} />
      </Field>
      {link.error !== null ? (
        <Text role="alert" tone="destructive" voice="label">
          Couldn't link that identity — the subject may already be linked to another account, or this row is already bound.
        </Text>
      ) : null}
    </FormDialogPopup>
  );
}
