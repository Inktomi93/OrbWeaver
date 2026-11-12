// One user row in the Admin → Users list. Mirrors the server verbs' guards as honest UX (the verb
// remains the floor): role select is owner-only and non-owner-human-only; the enabled switch is never
// for the owner row or the actor's own row, and disabling is confirm-gated (revokes live sessions); the
// ⋯ menu offers Sessions… and Reset password….

import type { UserRole } from "@orb/contracts/identity";
import { userRoleSatisfies } from "@orb/contracts/identity";
import { Badge } from "@orb/ui/badge";
import { Icon, KeyRound, MonitorSmartphone } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { MenuItem } from "@orb/ui/menu";
import { Select } from "@orb/ui/select";
import { Switch } from "@orb/ui/switch";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { ConfirmedAction } from "#components";
import { ConfirmDialog, RowActionsMenu, StatusChip, USER_ROLE_STATUS } from "#components";
import type { Trpc } from "#data";
import { timeLib } from "#lib";
import { ROLE_ITEMS, userActionsName, userEnabledFieldName, userRoleFieldName } from "../lib/admin-model.ts";

type AdminUser = inferOutput<Trpc["admin"]["listUsers"]>[number];

export interface AdminUserRowProps {
  readonly user: AdminUser;
  /** The viewing admin is this row. */
  readonly isSelf: boolean;
  /** Only the box owner may change roles. */
  readonly viewerIsOwner: boolean;
  readonly rolePending: boolean;
  readonly enabledPending: boolean;
  readonly onSetRole: (role: UserRole) => void;
  readonly onSetEnabled: (enabled: boolean) => void;
  readonly onOpenSessions: () => void;
  /** Opens the Cancel-able reset-password dialog the section renders. */
  readonly onResetPassword: ConfirmedAction;
}

export function AdminUserRow(props: AdminUserRowProps): ReactElement {
  const { user } = props;
  const [confirmDisable, setConfirmDisable] = useState(false);

  const isOwnerRow = userRoleSatisfies(user.role, "owner");
  const subtitle = `Created ${timeLib.formatRelative(user.createdAt)}`;

  return (
    <>
      <ListRow
        stackActions={true}
        title={user.handle}
        subtitle={subtitle}
        actions={
          <Row align="center" gap="row">
            {isOwnerRow ? <StatusChip status={user.role} vocabulary={USER_ROLE_STATUS} /> : null}
            {user.enabled ? null : (
              <Badge tone="destructive" variant="solid">
                Disabled
              </Badge>
            )}
            {isOwnerRow ? null : (
              <Select
                aria-label={userRoleFieldName(user.handle)}
                disabled={!props.viewerIsOwner || props.rolePending}
                items={ROLE_ITEMS}
                onValueChange={(value): void => {
                  if (value === "user" || value === "admin") {
                    props.onSetRole(value);
                  }
                }}
                value={user.role}
              />
            )}
            {isOwnerRow ? null : (
              <Switch
                aria-label={userEnabledFieldName(user.handle)}
                checked={user.enabled}
                disabled={props.isSelf || props.enabledPending}
                onCheckedChange={(next): void => {
                  if (next) {
                    props.onSetEnabled(true);
                  } else {
                    setConfirmDisable(true);
                  }
                }}
              />
            )}
            <RowActionsMenu label={userActionsName(user.handle)} triggerSize="sm">
              {/* The owner's sessions are the owner's to manage; the admin session verbs refuse anyone else (D17). */}
              {isOwnerRow && !props.viewerIsOwner ? null : (
                <MenuItem onClick={props.onOpenSessions}>
                  <Icon icon={MonitorSmartphone} size="sm" />
                  Sessions…
                </MenuItem>
              )}
              <MenuItem onClick={props.onResetPassword}>
                <Icon icon={KeyRound} size="sm" />
                Reset password…
              </MenuItem>
            </RowActionsMenu>
          </Row>
        }
      />

      <ConfirmDialog
        confirmLabel="Disable"
        description={`Disabling ${user.handle} blocks their next request and revokes every live session. You can re-enable the account any time.`}
        onConfirm={(): void => props.onSetEnabled(false)}
        onOpenChange={setConfirmDisable}
        open={confirmDisable}
        title="Disable this account?"
      />
    </>
  );
}
