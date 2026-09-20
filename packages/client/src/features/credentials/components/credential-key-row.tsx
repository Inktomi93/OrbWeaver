// One row of the Settings → Connections → Saved keys view — a stored credential as the redacted list view:
// the secret never reaches the client, so this renders only metadata (label · provider · how many
// connections use it · revoked state · mark-revoked/clear-revoked · remove). A health probe is a property of
// the CONNECTION that dials (`connection.probe`), never of the key alone. Immediate-commit: each control is
// an independent trpc.credentials.* mutation, no draft/submit lifecycle.

import type { CredRevokedReason } from "@orb/contracts/credentials";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Icon, Trash2 } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog } from "#components";
import type { Invalidation, Trpc } from "#data";
import { testId } from "#lib";
import { useClearRevokedCredential, useMarkRevokedByUser, useRemoveCredential } from "../hooks/use-connections-mutations.ts";

type CredentialListItem = inferOutput<Trpc["credentials"]["list"]>[number];

export interface CredentialKeyRowProps {
  readonly credential: CredentialListItem;
  /** How many of the user's connection rows reference this key ("used by 3 connections", §5.3a). */
  readonly usedBy: number;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

/** A credential's row: label + status chips, the revoke pair, and a confirmed remove. */
export function CredentialKeyRow({ credential, usedBy, trpc, invalidation }: CredentialKeyRowProps): ReactElement {
  const deps = { trpc, invalidation };
  const remove = useRemoveCredential(deps);
  const markRevoked = useMarkRevokedByUser(deps);
  const clearRevoked = useClearRevokedCredential(deps);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const revoked = credential.revokedAt !== null;
  const label = credential.label ?? "default";

  const subtitle = keyRowSubtitle(credential, usedBy);

  return (
    <ListRow
      title={label}
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
            <Button
              data-testid={testId("credentialClearRevoked")}
              intent="secondary"
              size="sm"
              disabled={clearRevoked.isPending}
              onClick={(): void => clearRevoked.mutate({ credentialId: credential.id })}
            >
              Clear revoked
            </Button>
          ) : (
            <Button
              data-testid={testId("credentialMarkRevoked")}
              intent="ghost"
              size="sm"
              disabled={markRevoked.isPending}
              onClick={(): void => setRevokeOpen(true)}
            >
              Mark revoked
            </Button>
          )}
          <Button intent="ghost" size="sm" aria-label={`Remove the ${label} key`} onClick={(): void => setDeleteOpen(true)}>
            <Icon icon={Trash2} size="sm" />
          </Button>
          <ConfirmDialog
            confirmLabel="Remove"
            description="This deletes the stored key. Every connection using it goes unset until you paste another. This can't be undone."
            onConfirm={(): void => remove.mutate({ credentialId: credential.id })}
            onOpenChange={setDeleteOpen}
            open={deleteOpen}
            title={`Remove "${label}"?`}
          />
          <ConfirmDialog
            confirmLabel="Mark revoked"
            description="Marks this key as revoked so no turn uses it — do this when you know it was rotated or leaked. Every connection on it reads as unavailable until you clear the flag or paste a new key."
            onConfirm={(): void => markRevoked.mutate({ credentialId: credential.id })}
            onOpenChange={setRevokeOpen}
            open={revokeOpen}
            title={`Mark "${label}" revoked?`}
          />
        </Row>
      }
    />
  );
}

/** The row's secondary line: WHAT the row is, plus — when revoked — WHY. The bare Revoked chip could not
 *  tell "you revoked this" from "the provider rejected your key", and those want opposite actions from the
 *  reader (press Clear revoked, versus paste a new key). `wrap` rides along because the line becomes a
 *  sentence once a cause joins it, and a clipped explanation of a dead credential is worse than none. */
function keyRowSubtitle(credential: CredentialListItem, usedBy: number): { readonly text: string | undefined; readonly wrap: boolean } {
  const cause = credential.revokedAt !== null && credential.revokedReason !== null ? revokedReasonCopy(credential.revokedReason) : null;
  const parts = [credential.provider, `used by ${usedBy} connection${usedBy === 1 ? "" : "s"}`, cause].filter((part) => part !== null);
  return { text: parts.length > 0 ? parts.join(" · ") : undefined, wrap: cause !== null };
}

/** The user-facing sentence for each revocation cause — a closed dispatch over `CredRevokedReason`, so a new
 *  member is a `tsc` error here rather than a row that renders a cause the pane has no words for.
 *
 *  The copy is derived ENTIRELY from the enum member: nothing the provider or the endpoint said is echoed,
 *  so this line cannot become the credential-echo leak class (a user endpoint that reflects the request back
 *  has repeatedly turned display-bound response text into a key disclosure).
 *
 *  The unknown arm returns null — a wire value outside the union is not parsed at this boundary, and the
 *  honest answer to "why?" we cannot read is silence, never the raw string on screen. */
function revokedReasonCopy(reason: CredRevokedReason): string | null {
  switch (reason) {
    case "auth_failed":
      // Names the KEY as the problem: the fix is a new key, not "try again in a minute".
      return "Revoked — the provider rejected this key";
    case "unreachable":
      // Deliberately NOT "rejected": nothing answered, so nothing judged the key. Saying otherwise would send
      // a user to rotate a perfectly good key because their own box was off.
      return "Revoked — the endpoint stopped responding";
    case "user":
      return "Revoked by you";
    default: {
      const unhandled: never = reason;
      void unhandled;
      return null;
    }
  }
}
