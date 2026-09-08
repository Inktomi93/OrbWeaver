// The Users section (Settings → Admin → Users). Mounts the create/sessions/reset-password dialogs once,
// keyed to the target row; owns the row-verb mutations and the dialog open-state. Self/owner/agent
// affordance rules live in admin-user-row.tsx.
//
// A settings-SECTION CONTRIBUTION at the `admin` anchor since SET-SEAMS stage 3, owned by user-admin: it
// owns its own read (admin.listUsers + the viewer, which the retired pane surface used to hand down) and its
// own suspense boundary. Every verb behind it is adminProcedure + requireAdmin/requireOwner — this section
// is UX honesty over that floor, and its error state says so.

import type { UserRole } from "@orb/contracts/identity";
import type { Handle, UserId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Icon, UserPlus } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { testId } from "#lib";
import { configAnchorId } from "#state";
import { useSetEnabled, useSetRole } from "../hooks/use-admin-mutations.ts";
import { ADMIN_USERS_SUBCATEGORY } from "../lib/admin-users-nav.ts";
import { AdminCreateUserDialog } from "./admin-create-user-dialog.tsx";
import { AdminResetPasswordDialog } from "./admin-reset-password-dialog.tsx";
import { AdminUserRow } from "./admin-user-row.tsx";
import { AdminUserSessionsDialog } from "./admin-user-sessions-dialog.tsx";

interface UserTarget {
  readonly userId: UserId;
  readonly handle: Handle;
}

/** The Users section body — mounted at the admin pane's sections anchor. */
export function AdminUsersSection(): ReactElement {
  return (
    // RESERVED (#1098) — an admin section that settles into the account table — the tallest block on the pane.
    <QueryBoundary
      fallback={<SkeletonRows count={4} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="the admin panel — it's available to administrators only" onRetry={retry} />}
      reserveKey="config.admin.users"
    >
      <AdminUsersBody />
    </QueryBoundary>
  );
}

function AdminUsersBody(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const [{ data: users }, { data: viewer }] = useSuspenseQueries({
    queries: [trpc.admin.listUsers.queryOptions(), trpc.sessions.me.queryOptions()],
  });
  const viewerIsOwner = viewer.globalRole === "owner";
  const setRole = useSetRole({ trpc, invalidation });
  const setEnabled = useSetEnabled({ trpc, invalidation });

  const [createOpen, setCreateOpen] = useState(false);
  const [sessionsFor, setSessionsFor] = useState<UserTarget | null>(null);
  const [resetFor, setResetFor] = useState<UserTarget | null>(null);
  const rolePendingRef = useRef(new Set<UserId>());
  const enabledPendingRef = useRef(new Set<UserId>());
  const [rolePendingIds, setRolePendingIds] = useState<ReadonlySet<UserId>>(new Set<UserId>());
  const [enabledPendingIds, setEnabledPendingIds] = useState<ReadonlySet<UserId>>(new Set<UserId>());

  const changeRole = (userId: UserId, role: UserRole): void => {
    if (rolePendingRef.current.has(userId)) {
      return;
    }
    rolePendingRef.current.add(userId);
    setRolePendingIds(new Set(rolePendingRef.current));
    void setRole
      .mutateAsync({ userId, role })
      .catch(() => undefined)
      .finally(() => {
        rolePendingRef.current.delete(userId);
        setRolePendingIds(new Set(rolePendingRef.current));
      });
  };

  const changeEnabled = (userId: UserId, enabled: boolean): void => {
    if (enabledPendingRef.current.has(userId)) {
      return;
    }
    enabledPendingRef.current.add(userId);
    setEnabledPendingIds(new Set(enabledPendingRef.current));
    void setEnabled
      .mutateAsync({ userId, enabled })
      .catch(() => undefined)
      .finally(() => {
        enabledPendingRef.current.delete(userId);
        setEnabledPendingIds(new Set(enabledPendingRef.current));
      });
  };

  return (
    <Section className="@container" divider={true} heading={ADMIN_USERS_SUBCATEGORY.label} id={configAnchorId("admin", ADMIN_USERS_SUBCATEGORY.id)}>
      <Stack gap="row" data-testid={testId("adminUsersSection")}>
        <Row align="center" justify="between">
          <Text voice="label" className="text-muted-foreground">
            {users.length} {users.length === 1 ? "account" : "accounts"}
          </Text>
          <Button size="sm" data-testid={testId("adminCreateUserButton")} onClick={(): void => setCreateOpen(true)}>
            <Icon icon={UserPlus} size="sm" />
            Create user
          </Button>
        </Row>

        <Stack gap="field">
          {users.map((user) => (
            <AdminUserRow
              key={user.id}
              user={user}
              isSelf={user.id === viewer.userId}
              viewerIsOwner={viewerIsOwner}
              rolePending={rolePendingIds.has(user.id)}
              enabledPending={enabledPendingIds.has(user.id)}
              onSetRole={(role: UserRole): void => changeRole(user.id, role)}
              onSetEnabled={(enabled: boolean): void => changeEnabled(user.id, enabled)}
              onOpenSessions={(): void => setSessionsFor({ userId: user.id, handle: user.handle })}
              onResetPassword={(): void => setResetFor({ userId: user.id, handle: user.handle })}
            />
          ))}
        </Stack>

        <AdminCreateUserDialog open={createOpen} onOpenChange={setCreateOpen} viewerIsOwner={viewerIsOwner} />

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
    </Section>
  );
}
