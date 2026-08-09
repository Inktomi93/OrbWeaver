// A2 — the Approvals section (Settings → Admin → Approvals): the account-approval queue for
// OIDC_REQUIRE_APPROVAL. A first-time SSO user provisions `enabled:false` (server-side) and cannot sign in
// until an admin enables the account here. This surface is UX honesty over the existing floor — the approve
// action is the SAME admin-gated `admin.setEnabled` verb the Users section uses; the pending set is simply
// the disabled, non-owner accounts (enabled:false is the carrier, owner-ruled — no `pending` role exists).
//
// A settings-SECTION CONTRIBUTION at the `admin` anchor, owned by user-admin: it owns its own read
// (admin.listUsers, filtered client-side to the pending set) and its own suspense boundary. Every verb behind
// it is adminProcedure + requireAdmin — this section is convenience over that floor.

import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { testId, timeLib } from "#lib";
import { settingsAnchorId } from "#state";
import { useSetEnabled } from "../hooks/use-admin-mutations.ts";
import { ADMIN_APPROVALS_SUBCATEGORY } from "../lib/admin-approvals-nav.ts";

/** The Approvals section body — mounted at the admin pane's sections anchor. */
export function AdminApprovalsSection(): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading pending accounts…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="the admin panel — it's available to administrators only" onRetry={retry} />}
    >
      <AdminApprovalsBody />
    </QueryBoundary>
  );
}

function AdminApprovalsBody(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: users } = useSuspenseQuery(trpc.admin.listUsers.queryOptions());
  const setEnabled = useSetEnabled({ trpc, invalidation });

  // The pending set: disabled, non-owner accounts. The owner is never disabled (server-enforced), so it can
  // never appear here. A human OR an agent row can be disabled; approving re-enables whichever it is.
  const pending = users.filter((user) => !user.enabled && user.role !== "owner");

  return (
    <Section className="@container" divider={true} heading={ADMIN_APPROVALS_SUBCATEGORY.label} id={settingsAnchorId("admin", ADMIN_APPROVALS_SUBCATEGORY.id)}>
      <Stack gap="row" data-testid={testId("adminApprovalsSection")}>
        <Text voice="label" className="text-muted-foreground">
          Accounts awaiting approval can't sign in until you enable them. New SSO users land here when OIDC_REQUIRE_APPROVAL is on.
        </Text>

        {pending.length === 0 ? (
          <Text voice="gloss" data-testid={testId("adminApprovalsEmpty")}>
            No accounts awaiting approval.
          </Text>
        ) : (
          <Stack gap="field">
            {pending.map((user) => (
              <ListRow
                key={user.id}
                title={user.handle}
                subtitle={`Requested ${timeLib.formatRelative(user.createdAt)}`}
                actions={
                  <Row align="center" gap="row">
                    <Badge intent="warning">Pending</Badge>
                    <Button
                      size="sm"
                      intent="primary"
                      data-testid={testId("adminApproveButton")}
                      onClick={(): void => setEnabled.mutate({ userId: user.id, enabled: true })}
                    >
                      Approve
                    </Button>
                  </Row>
                }
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Section>
  );
}
