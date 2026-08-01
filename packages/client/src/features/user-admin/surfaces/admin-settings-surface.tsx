// The Admin settings surface — registry-anchored sections (Users · Engines) over the built admin verbs.
// Suspends on admin.listUsers + sessions.me; the Engines section reads its own polled admin.vllmEngines.
// Every verb is adminProcedure + requireAdmin/requireOwner — this pane is UX honesty over that floor.

import { Container, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { Fragment, useRef } from "react";
import { QueryBoundary, QueryErrorState, useSettingsViewerView, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { settingsAnchorId, useSettingsSections } from "#state";
import { AdminEnginesSection } from "../components/admin-engines-section";
import { AdminCatalogSection, AdminEmbedCardSection } from "../components/admin-ops-section";
import { AdminUsersSection } from "../components/admin-users-section";
import { ADMIN_SUBCATEGORY_IDS } from "../lib/admin-nav";

const anchor = (sub: string): string => settingsAnchorId("admin", sub);

export function AdminSettingsSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none">
      <QueryBoundary
        fallback={<Text tone="muted">Loading the user table…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="the admin panel — it's available to administrators only" onRetry={retry} />}
      >
        <Container>
          <AdminPaneBody />
        </Container>
      </QueryBoundary>
    </Stack>
  );
}

function AdminPaneBody(): ReactElement {
  const trpc = useTRPC();
  const [{ data: users }, { data: viewer }] = useSuspenseQueries({
    queries: [trpc.admin.listUsers.queryOptions(), trpc.sessions.me.queryOptions()],
  });

  // The contributed admin sections (§6c) — read off the ONE door-assembled section registry (SET-SEAMS
  // §5.2), `when`-filtered by the viewer projection, in declared registry order. Each owns its own
  // suspense/mutation, so they render below the built sections. Zero contributions ⇒ none.
  const contributedSections = useSettingsSections("admin", useSettingsViewerView());

  return (
    <Stack gap="section">
      <Section divider={true} heading="Users" id={anchor(ADMIN_SUBCATEGORY_IDS.users)}>
        <AdminUsersSection users={users} viewerUserId={viewer.userId} viewerIsOwner={viewer.globalRole === "owner"} />
      </Section>
      <Section divider={true} heading="Engines" id={anchor(ADMIN_SUBCATEGORY_IDS.engines)}>
        <AdminEnginesSection />
      </Section>
      <Section divider={true} heading="Model catalog" id={anchor(ADMIN_SUBCATEGORY_IDS.catalog)}>
        <AdminCatalogSection />
      </Section>
      <Section divider={true} heading="Card embeddings" id={anchor(ADMIN_SUBCATEGORY_IDS.embeddings)}>
        <AdminEmbedCardSection />
      </Section>
      {contributedSections.map((section) => (
        <Fragment key={section.id}>{section.node}</Fragment>
      ))}
    </Stack>
  );
}
