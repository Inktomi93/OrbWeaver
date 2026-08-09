// B5 — the "Link SSO identity" section (Settings → Admin → Link SSO identity): the db-surgery-free migration
// path for a mode switch to SSO. Lists LINKABLE rows — human, non-owner, and still UNBOUND (externalId null),
// i.e. local accounts that would ORPHAN on their first OIDC login if their IdP username ≠ their handle. Each
// row's Link opens a dialog that stamps the stable subject via `admin.linkSsoIdentity` (bind-once enforced
// server-side). The owner is never here (it binds automatically via owner-flip adoption); already-bound rows
// drop out once linked.
//
// A settings-SECTION CONTRIBUTION at the `admin` anchor, owned by user-admin: it owns its own read
// (admin.listUsers, filtered client-side to the linkable set) and its own suspense boundary. Every verb behind
// it is adminProcedure + requireAdmin — this section is convenience over that floor.

import type { Handle, UserId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary, QueryErrorState, useTRPC } from "#data";
import { testId } from "#lib";
import { settingsAnchorId } from "#state";
import { ADMIN_LINK_SSO_SUBCATEGORY } from "../lib/admin-link-sso-nav.ts";
import { AdminLinkSsoDialog } from "./admin-link-sso-dialog.tsx";

/** The Link-SSO section body — mounted at the admin pane's sections anchor. */
export function AdminLinkSsoSection(): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading linkable accounts…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="the admin panel — it's available to administrators only" onRetry={retry} />}
    >
      <AdminLinkSsoBody />
    </QueryBoundary>
  );
}

function AdminLinkSsoBody(): ReactElement {
  const trpc = useTRPC();
  const { data: users } = useSuspenseQuery(trpc.admin.listUsers.queryOptions());
  const [linking, setLinking] = useState<{ readonly userId: UserId; readonly handle: Handle } | null>(null);

  // The linkable set: non-owner and still UNBOUND (no externalId). A bound row is already keyed on its subject;
  // the owner binds via adoption, never here. (No `kind` filter: `USER_KINDS` is `["human"]` today — agents
  // are unbuilt — so every row is human; add a kind exclusion here when the seat wave re-adds `agent`.)
  const linkable = users.filter((user) => user.role !== "owner" && user.externalId === null);

  return (
    <Section className="@container" divider={true} heading={ADMIN_LINK_SSO_SUBCATEGORY.label} id={settingsAnchorId("admin", ADMIN_LINK_SSO_SUBCATEGORY.id)}>
      <Stack gap="row" data-testid={testId("adminLinkSsoSection")}>
        <Text voice="label" className="text-muted-foreground">
          Link a local account to its stable SSO subject so a switch to single sign-on migrates it in place — otherwise a user whose IdP username differs from
          their handle gets a brand-new account and loses their data. Only unlinked, non-owner accounts appear here.
        </Text>

        {linkable.length === 0 ? (
          <Text voice="gloss" data-testid={testId("adminLinkSsoEmpty")}>
            No accounts to link — every non-owner account is already linked to an SSO identity.
          </Text>
        ) : (
          <Stack gap="field">
            {linkable.map((user) => (
              <ListRow
                key={user.id}
                title={user.handle}
                subtitle={user.role}
                actions={
                  <Row align="center" gap="row">
                    <Button
                      size="sm"
                      intent="secondary"
                      data-testid={testId("adminLinkButton")}
                      onClick={(): void => setLinking({ userId: user.id, handle: user.handle })}
                    >
                      Link
                    </Button>
                  </Row>
                }
              />
            ))}
          </Stack>
        )}
      </Stack>

      {linking === null ? null : (
        <AdminLinkSsoDialog
          userId={linking.userId}
          handle={linking.handle}
          open={true}
          onOpenChange={(open): void => {
            if (!open) {
              setLinking(null);
            }
          }}
        />
      )}
    </Section>
  );
}
