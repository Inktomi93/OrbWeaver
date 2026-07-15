// One user row in the Admin → Users list. Mirrors the server verbs' guards as honest UX (the verb
// remains the floor): role select is owner-only and non-owner-human-only; the enabled switch is never
// for the owner row or the actor's own row, and disabling is confirm-gated (revokes live sessions); the
// ⋯ menu offers Sessions… and Reset password….

import type { UserRole } from "@orb/contracts/identity";
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
import { ConfirmDialog, RowActionsMenu } from "#components";
import type { Trpc } from "#data";
import { timeLib } from "#lib";
import { ROLE_BADGE_INTENT, ROLE_ITEMS, ROLE_LABELS } from "../lib/admin-model";

type AdminUser = inferOutput<Trpc["admin"]["listUsers"]>[number];

export interface AdminUserRowProps {
  readonly user: AdminUser;
  /** The viewing admin is this row. */
  readonly isSelf: boolean;
  /** Only the box owner may change roles. */
  readonly viewerIsOwner: boolean;
  readonly onSetRole: (role: UserRole) => void;
  readonly onSetEnabled: (enabled: boolean) => void;
  readonly onOpenSessions: () => void;
  readonly onResetPassword: () => void;
}

export function AdminUserRow(props: AdminUserRowProps): ReactElement {
  const { user } = props;
  const [confirmDisable, setConfirmDisable] = useState(false);

  const isOwnerRow = user.role === "owner";
  const isAgent = user.kind === "agent";
  const subtitle =
    isAgent && user.ownerHandle !== null
      ? `Agent — owned by ${user.ownerHandle}`
      : `Created ${timeLib.formatRelative(user.createdAt)}`;

  return (
    <>
      <ListRow
        title={user.handle}
        subtitle={subtitle}
        actions={
          <Row align="center" gap="row">
            {isOwnerRow ? (
              <Badge intent={ROLE_BADGE_INTENT[user.role]}>{ROLE_LABELS[user.role]}</Badge>
            ) : null}
            {isAgent ? <Badge intent="warning">Agent</Badge> : null}
            {user.enabled ? null : <Badge intent="danger">Disabled</Badge>}
            {isOwnerRow || isAgent ? null : (
              <Select
                aria-label={`Role — ${user.handle}`}
                disabled={!props.viewerIsOwner}
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
                aria-label={`Enabled — ${user.handle}`}
                checked={user.enabled}
                disabled={props.isSelf}
                onCheckedChange={(next): void => {
                  if (next) {
                    props.onSetEnabled(true);
                  } else {
                    setConfirmDisable(true);
                  }
                }}
              />
            )}
            <RowActionsMenu label={`${user.handle} actions`} triggerSize="sm">
              <MenuItem onClick={props.onOpenSessions}>
                <Icon icon={MonitorSmartphone} size="sm" />
                Sessions…
              </MenuItem>
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
