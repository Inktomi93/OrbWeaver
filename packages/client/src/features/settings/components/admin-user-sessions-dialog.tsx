// The per-user sessions dialog (Settings → Admin → Users → ⋯ → Sessions). A COMPONENT so the Dialog +
// the revoke-all <AlertDialog> are legal (rule 7). Reads `admin.listSessions({userId})` with a plain
// `useQuery` (mounted only while open — the parent renders this conditionally, the neo
// UserSessionsDialog shape); per-row Revoke + a confirm-gated Revoke-all header action. The revoke
// mutations path-invalidate `admin.listSessions`, so the list refreshes on settle.

import type { UserId } from "@orb/kit/ids";
import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@orb/ui/alert-dialog";
import { Button } from "@orb/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { testId, timeLib } from "#lib";
import { useRevokeSession, useRevokeUserSessions } from "../hooks/use-admin-mutations";

export interface AdminUserSessionsDialogProps {
  readonly userId: UserId;
  readonly handle: string;
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
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup size="lg" data-testid={testId("adminSessionsDialog")}>
        <Stack gap="block">
          <DialogTitle>Sessions — {props.handle}</DialogTitle>
          <DialogDescription>
            Revoking a session signs that device out on its next request.
          </DialogDescription>

          <Row align="center" justify="between">
            <Text size="label" tone="muted">
              {activeCount} active{rows.length > activeCount ? ` / ${rows.length} total` : ""}
            </Text>
            <Button
              intent="destructive"
              size="sm"
              disabled={activeCount === 0 || mutating}
              onClick={(): void => setConfirmRevokeAll(true)}
            >
              Revoke all
            </Button>
          </Row>

          {sessions.isPending ? <Text tone="muted">Loading sessions…</Text> : null}
          {sessions.isError ? (
            <Text tone="destructive">Couldn't load the sessions — try reopening this dialog.</Text>
          ) : null}
          {sessions.isSuccess && rows.length === 0 ? (
            <Text tone="muted">No sessions on record — they've never signed in.</Text>
          ) : null}

          <Stack gap="field">
            {rows.map((session) => {
              const revoked = session.revokedAt !== null;
              return (
                <ListRow
                  key={session.id}
                  title={session.userAgent ?? "Unknown device"}
                  subtitle={
                    revoked
                      ? `Revoked ${timeLib.formatRelative(session.revokedAt ?? session.lastSeenAt)}`
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
        </Stack>

        <AlertDialog onOpenChange={setConfirmRevokeAll} open={confirmRevokeAll}>
          <AlertDialogPopup forceRender={true}>
            <Stack gap="block">
              <AlertDialogTitle>Revoke all sessions?</AlertDialogTitle>
              <AlertDialogDescription>
                Every live session for {props.handle} is revoked — their next request from any
                device is signed out.
              </AlertDialogDescription>
              <AlertDialogActions>
                <AlertDialogClose render={<Button intent="ghost">Cancel</Button>} />
                <AlertDialogClose
                  render={
                    <Button
                      intent="destructive"
                      onClick={(): void => revokeAll.mutate({ userId: props.userId })}
                    >
                      Revoke all
                    </Button>
                  }
                />
              </AlertDialogActions>
            </Stack>
          </AlertDialogPopup>
        </AlertDialog>
      </DialogPopup>
    </Dialog>
  );
}
