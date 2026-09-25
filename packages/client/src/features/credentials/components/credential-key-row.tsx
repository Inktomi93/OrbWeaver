// One row of the Settings → Connections → Saved keys view — a stored credential as the redacted list view:
// the secret never reaches the client, so this renders only metadata (provider · label · how many
// connections use it · revoked state) plus its two named actions. A health probe is a property of the
// CONNECTION that dials (`connection.probe`), never of the key alone.
//
// TWO NAMED ACTIONS, AND THEY CARRY THEIR SUBJECT (§5.3a). The spec wrote `replace` and `revoke` INTO the
// reuse metadata string — "used by 3 connections · replace · revoke" — and the render proved a mono grey
// span cannot carry them: no focus target, no accessible name, no hover affordance, and the identical face
// as the connection rows' provider/model line two rows above, i.e. metadata, which is what it was. So the
// COUNT stays the meta line and the verbs are buttons named `Replace the <provider> "<label>" key` /
// `Revoke the <provider> "<label>" key` — in a list of keys a bare verb names nothing.
//
// TWO PER ROW STATE, NOT TWO IN TOTAL (the §5.3a correction this lane owes back). §5.3a's "two actions" is a
// COPY rule about naming, never a cap on the row's capabilities, and rendering literally two would have
// deleted the only door to `remove`. An ACTIVE row is Replace + Revoke; a REVOKED row is Clear revoked +
// Remove — which is also when deleting a dead key is the thing you actually want. `Revoke` therefore keeps
// its recorded meaning (`markRevokedByUser`, recoverable, invariant #6) instead of being silently
// re-pointed at the destructive verb.
//
// REPLACE NAMES THE ROW BY ID. `credentials.replace` rotates this row's secret in place and clears its
// revocation, so every connection on the row keeps working; `credentials.add` never overwrites a key.
//
// Immediate-commit: each control is an independent trpc.credentials.* mutation, no draft/submit lifecycle
// (the Replace prompt's Input is the §13.4 single-controlled-input carve-out, not a form factory).

import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Input } from "@orb/ui/input";
import { Row } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog, FormDialog } from "#components";
import type { Invalidation, Trpc } from "#data";
import { testId } from "#lib";
import { useClearRevokedCredential, useMarkRevokedByUser, useRemoveCredential, useReplaceCredential } from "../hooks/use-connections-mutations.ts";
import { keyRowSubtitle, keySubject, reuseSentence } from "../lib/credential-key-model.ts";

type CredentialListItem = inferOutput<Trpc["credentials"]["list"]>[number];

export interface CredentialKeyRowProps {
  readonly credential: CredentialListItem;
  /** How many of the user's connection rows reference this key ("used by 3 connections", §5.3a). */
  readonly usedBy: number;
  /** The provider's USER-FACING label (`ProviderDef.label`) — the registry id is not a word for a person. */
  readonly providerLabel: string;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

/** A credential's row: its identity, the reuse count, and the two named actions its state offers. */
export function CredentialKeyRow({ credential, usedBy, providerLabel, trpc, invalidation }: CredentialKeyRowProps): ReactElement {
  const deps = { trpc, invalidation };
  const remove = useRemoveCredential(deps);
  const markRevoked = useMarkRevokedByUser(deps);
  const clearRevoked = useClearRevokedCredential(deps);
  const replace = useReplaceCredential(deps);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replacementKey, setReplacementKey] = useState("");

  const revoked = credential.revokedAt !== null;
  const label = credential.label ?? "default";
  const subject = keySubject(providerLabel, label);
  const subtitle = keyRowSubtitle(credential, usedBy);

  const submitReplacement = (): void => {
    replace.mutate({ credentialId: credential.id, key: replacementKey });
    setReplacementKey("");
    setReplaceOpen(false);
  };

  return (
    <ListRow
      title={subject}
      {...(subtitle.text !== undefined ? { subtitle: subtitle.text } : {})}
      subtitleWrap={subtitle.wrap}
      leading={
        <Row gap="field" align="center">
          {revoked ? (
            <Badge intent="danger" size="sm">
              Revoked
            </Badge>
          ) : null}
        </Row>
      }
      actions={
        <Row gap="field" align="center">
          {revoked ? (
            <>
              <Button
                data-testid={testId("credentialClearRevoked")}
                intent="secondary"
                size="sm"
                disabled={clearRevoked.isPending}
                onClick={(): void => clearRevoked.mutate({ credentialId: credential.id })}
              >
                Clear revoked
              </Button>
              <Button intent="ghost" size="sm" aria-label={`Remove the ${subject} key`} onClick={(): void => setDeleteOpen(true)}>
                Remove
              </Button>
            </>
          ) : (
            <>
              <Button
                intent="secondary"
                size="sm"
                aria-label={`Replace the ${subject} key`}
                disabled={replace.isPending}
                onClick={(): void => setReplaceOpen(true)}
              >
                Replace
              </Button>
              <Button
                data-testid={testId("credentialMarkRevoked")}
                intent="ghost"
                size="sm"
                aria-label={`Revoke the ${subject} key`}
                disabled={markRevoked.isPending}
                onClick={(): void => setRevokeOpen(true)}
              >
                Revoke
              </Button>
            </>
          )}
          <FormDialog
            open={replaceOpen}
            onOpenChange={setReplaceOpen}
            size="sm"
            title={`Replace the ${subject} key`}
            description={`Paste the new key. ${reuseSentence(usedBy)} — every one of them starts using it immediately, and the old key is overwritten.`}
            submit={{ label: "Replace", onSubmit: submitReplacement, disabled: replacementKey.trim() === "", loading: replace.isPending }}
          >
            <Input aria-label={`New ${subject} key`} value={replacementKey} onValueChange={setReplacementKey} placeholder="Paste your key" type="password" />
          </FormDialog>
          <ConfirmDialog
            confirmLabel="Remove"
            description={`This deletes the stored key. ${reuseSentence(usedBy)}, and every one of them goes unset until you paste another. This can't be undone.`}
            onConfirm={(): void => remove.mutate({ credentialId: credential.id })}
            onOpenChange={setDeleteOpen}
            open={deleteOpen}
            title={`Remove the ${subject} key?`}
          />
          <ConfirmDialog
            confirmLabel="Revoke"
            description={`Marks this key as revoked so no turn uses it — do this when you know it was rotated or leaked. ${reuseSentence(usedBy)}, and every one of them reads as unavailable until you clear the flag or replace the key.`}
            onConfirm={(): void => markRevoked.mutate({ credentialId: credential.id })}
            onOpenChange={setRevokeOpen}
            open={revokeOpen}
            title={`Revoke the ${subject} key?`}
          />
        </Row>
      }
    />
  );
}
