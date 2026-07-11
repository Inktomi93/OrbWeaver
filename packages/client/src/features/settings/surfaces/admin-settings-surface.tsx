// The ADMIN settings surface (Settings → Admin; the `built:false` placeholder filled). Renders inside
// the shell's settings modal for the `admin` category — registry-anchored sections (Users · Engines,
// ADMIN_SUBCATEGORY_IDS) over the built admin verbs. Suspends on `admin.listUsers` + `sessions.me`
// (QueryBoundary + useSuspenseQueries, the system-settings-surface shape); the Engines section reads
// its own polled `admin.vllmEngines` (a live ops read — see admin-engines-section.tsx).
//
// AUTHORITY (Spine-Identity §5.1): every verb is `adminProcedure` + `requireAdmin`/`requireOwner` —
// this pane is UX honesty over that floor. The shell hides the category from non-admin viewers
// (settings-nav-model `adminOnly`); a delegated (non-owner) admin sees the role controls DISABLED
// (`setRole` is `requireOwner` — the D17 `ownerOnly` pattern); self/owner/agent affordances mirror the
// verb guards row-by-row (admin-user-row.tsx).

import { Button } from "@orb/ui/button";
import { Container, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef } from "react";
import { QueryBoundary, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { AdminEnginesSection } from "../components/admin-engines-section";
import { AdminUsersSection } from "../components/admin-users-section";
import { ADMIN_SUBCATEGORY_IDS } from "../lib/settings-nav";
import { settingsAnchorId } from "../lib/settings-nav-model";

/** The DOM anchor id for one Admin subcategory `<Section>` — derived from the shared registry ids. */
const anchor = (sub: string): string => settingsAnchorId("admin", sub);

/** The Admin panel body (rendered inside the settings modal's category column). */
export function AdminSettingsSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none">
      <QueryBoundary
        fallback={<Text tone="muted">Loading the user table…</Text>}
        renderError={(_error, retry): ReactElement => (
          <Text tone="muted">
            Couldn't load the admin panel — it's available to administrators only.{" "}
            <Button intent="ghost" onClick={retry}>
              Retry
            </Button>
          </Text>
        )}
      >
        <Container>
          <AdminPaneBody />
        </Container>
      </QueryBoundary>
    </Stack>
  );
}

/** Suspends on the user table + the viewer, then renders the registry-anchored sections. */
function AdminPaneBody(): ReactElement {
  const trpc = useTRPC();
  const [{ data: users }, { data: viewer }] = useSuspenseQueries({
    queries: [trpc.admin.listUsers.queryOptions(), trpc.sessions.me.queryOptions()],
  });

  return (
    <Stack gap="section">
      <Section divider={true} heading="Users" id={anchor(ADMIN_SUBCATEGORY_IDS.users)}>
        <AdminUsersSection
          users={users}
          viewerUserId={viewer.userId}
          viewerIsOwner={viewer.globalRole === "owner"}
        />
      </Section>
      <Section divider={true} heading="Engines" id={anchor(ADMIN_SUBCATEGORY_IDS.engines)}>
        <AdminEnginesSection />
      </Section>
    </Stack>
  );
}
