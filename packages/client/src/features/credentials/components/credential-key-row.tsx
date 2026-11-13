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
import { useRef, useState } from "react";
import { ConfirmDialog, DestructiveAction, FormDialog } from "#components";
import type { Invalidation, Trpc } from "#data";
import { testId } from "#lib";
import { useClearRevokedCredential, useMarkRevokedByUser, useRemoveCredential, useReplaceCredential } from "../hooks/use-connections-mutations.ts";
import { keyRowSubtitle, reuseSentence } from "../lib/credential-key-model.ts";
import {
  CLEAR_REVOKED_NAME,
  KEY_REVOKE_VERB,
  keySubjectName,
  removeKeyName,
  removeKeyTitle,
  replaceKeyName,
  revokeKeyName,
  revokeKeyTitle,
} from "../lib/credentials-names.ts";

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
  const clearRevoked = useClearRevokedCredential({ ...deps, failureShownInline: "the clear-revoked confirm's alert line" });
  // Clearing swaps the revoked row's actions for Replace and Revoke; focus moves to Replace when the refetch has painted it.
  const replaceButton = useRef<HTMLButtonElement>(null);
  const replace = useReplaceCredential(deps);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replacementKey, setReplacementKey] = useState("");

  const revoked = credential.revokedAt !== null;
  const label = credential.label ?? "default";
  const subject = keySubjectName(providerLabel, label);
  const subtitle = keyRowSubtitle(credential, usedBy);

  const submitReplacement = (): void => {
    replace.mutate({ credentialId: credential.id, key: replacementKey });
    setReplacementKey("");
    setReplaceOpen(false);
  };

  return (
    <ListRow
      stackActions={true}
      title={subject}
      {...(subtitle.text !== undefined ? { subtitle: subtitle.text } : {})}
      subtitleWrap={subtitle.wrap}
      leading={
        <Row gap="field" align="center">
          {revoked ? (
            <Badge tone="destructive" variant="solid" size="sm">
              Revoked
            </Badge>
          ) : null}
        </Row>
      }
      actions={
        <Row wrap={true} gap="field" align="center">
          {revoked ? (
            <>
              {/* No undo: re-revoking would record a different reason and time than the revocation being cleared. */}
              <DestructiveAction
                confirm={{
                  confirmLabel: CLEAR_REVOKED_NAME,
                  description: `${reuseSentence(usedBy)}, and every one of them starts using this key again. Why it was revoked is not kept.`,
                  title: `Clear the revoked flag on the ${subject} key?`,
                  confirmTone: "primary",
                }}
                finalFocus={(): boolean => {
                  replaceButton.current?.focus();
                  return replaceButton.current === null;
                }}
                onConfirm={(): Promise<void> => clearRevoked.mutateAsync({ credentialId: credential.id }).then((): void => undefined)}
                trigger={
                  <Button data-testid={testId("credentialClearRevoked")} variant="outline" size="sm" disabled={clearRevoked.isPending}>
                    {CLEAR_REVOKED_NAME}
                  </Button>
                }
              />
              <Button variant="ghost" size="sm" aria-label={removeKeyName(subject)} onClick={(): void => setDeleteOpen(true)}>
                Remove
              </Button>
            </>
          ) : (
            <>
              <Button
                ref={replaceButton}
                variant="outline"
                size="sm"
                aria-label={replaceKeyName(subject)}
                disabled={replace.isPending}
                onClick={(): void => setReplaceOpen(true)}
              >
                Replace
              </Button>
              <Button
                data-testid={testId("credentialMarkRevoked")}
                variant="ghost"
                size="sm"
                aria-label={revokeKeyName(subject)}
                disabled={markRevoked.isPending}
                onClick={(): void => setRevokeOpen(true)}
              >
                {KEY_REVOKE_VERB}
              </Button>
            </>
          )}
          <FormDialog
            open={replaceOpen}
            onOpenChange={setReplaceOpen}
            size="sm"
            title={replaceKeyName(subject)}
            description={`Paste the new key. ${reuseSentence(usedBy)}: every one of them starts using it immediately, and the old key is overwritten.`}
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
            title={removeKeyTitle(subject)}
          />
          <ConfirmDialog
            confirmLabel={KEY_REVOKE_VERB}
            description={`Marks this key as revoked so no turn uses it: do this when you know it was rotated or leaked. ${reuseSentence(usedBy)}, and every one of them reads as unavailable until you clear the flag or replace the key.`}
            onConfirm={(): void => markRevoked.mutate({ credentialId: credential.id })}
            onOpenChange={setRevokeOpen}
            open={revokeOpen}
            title={revokeKeyTitle(subject)}
          />
        </Row>
      }
    />
  );
}
