// The per-user sessions dialog (Settings → Admin → Users → ⋯ → Sessions). A COMPONENT so the Dialog +
// the revoke-all <AlertDialog> are legal (rule 7). Reads `admin.listSessions({userId})` with a plain
// `useQuery` (mounted only while open — the parent renders this conditionally, the neo
// UserSessionsDialog shape); a confirm-gated per-row Revoke and Revoke-all header action. The revoke
// mutations path-invalidate `admin.listSessions`, so the list refreshes on settle.

import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef } from "react";
import { DestructiveAction, DismissDialog } from "#components";
import { QueryInlineStates, useInvalidation, useTRPC } from "#data";
import { DIALOG_VERBS, timeLib } from "#lib";
import { useRevokeSession, useRevokeUserSessions } from "../hooks/use-admin-mutations.ts";
import type { AdminUserDialogProps } from "../lib/admin-model.ts";
import { revokeSessionName, SESSION_REVOKE_VERB } from "../lib/admin-model.ts";

/** The sessions list + revoke affordances for one account. */
export function AdminUserSessionsDialog(props: AdminUserDialogProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const sessions = useQuery(trpc.admin.listSessions.queryOptions({ userId: props.userId }));
  const revokeOne = useRevokeSession({ trpc, invalidation });
  const revokeAll = useRevokeUserSessions({ trpc, invalidation });

  const rows = sessions.data ?? [];
  const activeCount = rows.filter((s) => s.revokedAt === null).length;
  const mutating = revokeOne.isPending || revokeAll.isPending;
  // A revoked row drops its Revoke control, so focus returns to the header action that outlives it.
  const revokeAllButton = useRef<HTMLButtonElement>(null);

  return (
    <DismissDialog
      description="Revoking a session signs that device out on its next request."
      dismissLabel={DIALOG_VERBS.close}
      onOpenChange={props.onOpenChange}
      open={props.open}
      size="lg"
      testKey="adminSessionsDialog"
      title={`Sessions: ${props.handle}`}
    >
      <Row align="center" justify="between">
        <Text voice="label" ink="muted">
          {activeCount} active{rows.length > activeCount ? ` / ${rows.length} total` : ""}
        </Text>
        <DestructiveAction
          confirm={{
            confirmLabel: "Revoke all",
            description: `Every live session for ${props.handle} is revoked: their next request from any device is signed out.`,
            title: "Revoke all sessions?",
          }}
          forceRender={true}
          onConfirm={(): void => revokeAll.mutate({ userId: props.userId })}
          trigger={
            <Button ref={revokeAllButton} tone="destructive" size="sm" disabled={activeCount === 0 || mutating}>
              Revoke all
            </Button>
          }
        />
      </Row>

      <QueryInlineStates
        status={sessions}
        isEmpty={rows.length === 0}
        pending="Loading sessions…"
        error="Couldn't load the sessions. Try reopening this dialog."
        empty="No sessions on record. They've never signed in."
      />

      <Stack gap="field">
        {rows.map((session) => {
          const revoked = session.revokedAt !== null;
          return (
            <ListRow
              key={session.id}
              title={session.userAgent ?? "Unknown device"}
              subtitle={
                revoked
                  ? `Revoked ${timeLib.formatRelative(session.revokedAt)}`
                  : `Last seen ${timeLib.formatRelative(session.lastSeenAt)} · expires ${timeLib.formatRelative(session.expiresAt)}`
              }
              actions={
                revoked ? null : (
                  <DestructiveAction
                    confirm={{
                      confirmLabel: SESSION_REVOKE_VERB,
                      description: `This device is signed out of ${props.handle} on its next request.`,
                      title: "Revoke this session?",
                    }}
                    finalFocus={revokeAllButton}
                    forceRender={true}
                    onConfirm={(): void => revokeOne.mutate({ sessionId: session.id })}
                    trigger={
                      <Button tone="destructive" size="sm" disabled={mutating} aria-label={revokeSessionName(session.userAgent ?? session.id)}>
                        {SESSION_REVOKE_VERB}
                      </Button>
                    }
                  />
                )
              }
            />
          );
        })}
      </Stack>
    </DismissDialog>
  );
}
