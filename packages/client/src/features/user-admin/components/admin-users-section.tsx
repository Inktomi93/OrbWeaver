// The Users section body. Mounts the create/sessions/reset-password dialogs once, keyed to the target
// row. The surface hands down the already-suspended users + viewer; this section owns the row-verb
// mutations and the dialog open-state. Self/owner/agent affordance rules live in admin-user-row.tsx.

import type { UserRole } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Icon, UserPlus } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { testId } from "#lib";
import { useSetEnabled, useSetRole } from "../hooks/use-admin-mutations";
import { AdminCreateUserDialog } from "./admin-create-user-dialog";
import { AdminResetPasswordDialog } from "./admin-reset-password-dialog";
import { AdminUserRow } from "./admin-user-row";
import { AdminUserSessionsDialog } from "./admin-user-sessions-dialog";

type AdminUsers = inferOutput<Trpc["admin"]["listUsers"]>;

interface UserTarget {
  readonly userId: UserId;
  readonly handle: string;
}

export interface AdminUsersSectionProps {
  readonly users: AdminUsers;
  readonly viewerUserId: string;
  readonly viewerIsOwner: boolean;
}

export function AdminUsersSection(props: AdminUsersSectionProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setRole = useSetRole({ trpc, invalidation });
  const setEnabled = useSetEnabled({ trpc, invalidation });

  const [createOpen, setCreateOpen] = useState(false);
  const [sessionsFor, setSessionsFor] = useState<UserTarget | null>(null);
  const [resetFor, setResetFor] = useState<UserTarget | null>(null);

  return (
    <Stack gap="row" data-testid={testId("adminUsersSection")}>
      <Row align="center" justify="between">
        <Text size="label" tone="muted">
          {props.users.length} {props.users.length === 1 ? "account" : "accounts"}
        </Text>
        <Button size="sm" data-testid={testId("adminCreateUserButton")} onClick={(): void => setCreateOpen(true)}>
          <Icon icon={UserPlus} size="sm" />
          Create user
        </Button>
      </Row>

      <Stack gap="field">
        {props.users.map((user) => (
          <AdminUserRow
            key={user.id}
            user={user}
            isSelf={user.id === props.viewerUserId}
            viewerIsOwner={props.viewerIsOwner}
            onSetRole={(role: UserRole): void => setRole.mutate({ userId: user.id, role })}
            onSetEnabled={(enabled: boolean): void => setEnabled.mutate({ userId: user.id, enabled })}
            onOpenSessions={(): void => setSessionsFor({ userId: user.id, handle: user.handle })}
            onResetPassword={(): void => setResetFor({ userId: user.id, handle: user.handle })}
          />
        ))}
      </Stack>

      <AdminCreateUserDialog open={createOpen} onOpenChange={setCreateOpen} viewerIsOwner={props.viewerIsOwner} />

      {sessionsFor === null ? null : (
        <AdminUserSessionsDialog
          userId={sessionsFor.userId}
          handle={sessionsFor.handle}
          open={true}
          onOpenChange={(open): void => {
            if (!open) {
              setSessionsFor(null);
            }
          }}
        />
      )}

      {resetFor === null ? null : (
        <AdminResetPasswordDialog
          userId={resetFor.userId}
          handle={resetFor.handle}
          open={true}
          onOpenChange={(open): void => {
            if (!open) {
              setResetFor(null);
            }
          }}
        />
      )}
    </Stack>
  );
}
