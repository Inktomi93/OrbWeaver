// The per-user sessions dialog (Settings → Admin → Users → ⋯ → Sessions). A COMPONENT so the Dialog +
// the revoke-all <AlertDialog> are legal (rule 7). Reads `admin.listSessions({userId})` with a plain
// `useQuery` (mounted only while open — the parent renders this conditionally, the neo
// UserSessionsDialog shape); per-row Revoke + a confirm-gated Revoke-all header action. The revoke
// mutations path-invalidate `admin.listSessions`, so the list refreshes on settle.

import type { Handle, UserId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog, FormDialog } from "#components";
import { QueryInlineStates, useInvalidation, useTRPC } from "#data";
import { timeLib } from "#lib";
import { useRevokeSession, useRevokeUserSessions } from "../hooks/use-admin-mutations.ts";

export interface AdminUserSessionsDialogProps {
  readonly userId: UserId;
  readonly handle: Handle;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** The sessions list + revoke affordances for one account. */
export function AdminUserSessionsDialog(props: AdminUserSessionsDialogProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const sessions = useQuery(trpc.admin.listSessions.queryOptions({ userId: props.userId }));
  const revokeOne = useRevokeSession({ trpc, invalidation });
  const revokeAll = useRevokeUserSessions({ trpc, invalidation });
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);

  const rows = sessions.data ?? [];
  const activeCount = rows.filter((s) => s.revokedAt === null).length;
  const mutating = revokeOne.isPending || revokeAll.isPending;

  return (
    <FormDialog
      description="Revoking a session signs that device out on its next request."
      onOpenChange={props.onOpenChange}
      open={props.open}
      size="lg"
      testKey="adminSessionsDialog"
      title={`Sessions — ${props.handle}`}
    >
      <Row align="center" justify="between">
        <Text voice="label" className="text-muted-foreground">
          {activeCount} active{rows.length > activeCount ? ` / ${rows.length} total` : ""}
        </Text>
        <Button intent="destructive" size="sm" disabled={activeCount === 0 || mutating} onClick={(): void => setConfirmRevokeAll(true)}>
          Revoke all
        </Button>
      </Row>

      <QueryInlineStates
        status={sessions}
        isEmpty={rows.length === 0}
        pending="Loading sessions…"
        error="Couldn't load the sessions — try reopening this dialog."
        empty="No sessions on record — they've never signed in."
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
                  <Button
                    intent="destructive"
                    size="sm"
                    disabled={mutating}
                    aria-label={`Revoke session — ${session.userAgent ?? session.id}`}
                    onClick={(): void => revokeOne.mutate({ sessionId: session.id })}
                  >
                    Revoke
                  </Button>
                )
              }
            />
          );
        })}
      </Stack>

      <ConfirmDialog
        confirmLabel="Revoke all"
        description={`Every live session for ${props.handle} is revoked — their next request from any device is signed out.`}
        forceRender={true}
        onConfirm={(): void => revokeAll.mutate({ userId: props.userId })}
        onOpenChange={setConfirmRevokeAll}
        open={confirmRevokeAll}
        title="Revoke all sessions?"
      />
    </FormDialog>
  );
}
