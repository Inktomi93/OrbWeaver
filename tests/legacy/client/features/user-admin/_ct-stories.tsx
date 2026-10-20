// user-admin feature CT stories (docs/law/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The
// stories resolve the production settings contributions through the config registry so section anchors
// come from the same resolver the settings host uses.

import { QueryBoundary } from "@orb/client/components";
import { createAppQueryClient, createTrpcClient, createTrpcProxy, TRPCProvider, useBusRoom, useOrbSocket, useTRPC } from "@orb/client/data";
import { CtConfigGroupBody, CtDataProviders } from "@orb/testkit/browser/ct-data-providers.tsx";
import { configSections } from "@orb/testkit/browser/ct-door.ts";
import { isolationRegistry } from "@orb/testkit/browser/ct-isolation.ts";
import { storyTestId } from "@orb/testkit/browser/story-test-ids.ts";
import { TooltipProvider } from "@orb/ui/tooltip";
import { QueryClientProvider, useSuspenseQueries } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { CtToastSurface } from "../../lib/_ct-stories.tsx";
import { ConfigHostStory } from "../config/_ct-stories.tsx";

const adminUsersSectionRegistry = isolationRegistry(
  "config-sections",
  "isolates admin-users from sibling settings sections while retaining its production contribution and anchor",
  [configSections.get("admin-users")],
);
const adminApprovalsSectionRegistry = isolationRegistry(
  "config-sections",
  "isolates admin-approvals from sibling settings sections while retaining its production contribution and anchor",
  [configSections.get("admin-approvals")],
);
const adminLinkSsoSectionRegistry = isolationRegistry(
  "config-sections",
  "isolates admin-link-sso from sibling settings sections while retaining its production contribution and anchor",
  [configSections.get("admin-link-sso")],
);
const adminOpsSectionsRegistry = isolationRegistry(
  "config-sections",
  "isolates the adjacent catalog and card embedding sections from the other admin settings",
  [configSections.get("admin-model-catalog"), configSections.get("admin-card-embeddings")],
);

const rateLimitsSectionRegistry = isolationRegistry(
  "config-sections",
  "isolates admin-rate-limits from sibling settings sections while retaining its production contribution and anchor",
  [configSections.get("admin-rate-limits")],
);
const memoryTuningSectionRegistry = isolationRegistry(
  "config-sections",
  "isolates admin-memory-tuning from sibling settings sections while retaining its production contribution and anchor",
  [configSections.get("admin-memory-tuning")],
);
const mediaTrustSectionRegistry = isolationRegistry(
  "config-sections",
  "isolates admin-media-trust from sibling settings sections while retaining its production contribution and anchor",
  [configSections.get("admin-media-trust")],
);
const multiUserSectionRegistry = isolationRegistry(
  "config-sections",
  "isolates admin-multi-user from sibling settings sections while retaining its production contribution and anchor",
  [configSections.get("admin-multi-user")],
);
const aboutSectionRegistry = isolationRegistry(
  "config-sections",
  "isolates about-version from sibling settings sections while retaining its production contribution and anchor",
  [configSections.get("about-version")],
);
const aboutUpdatesSectionRegistry = isolationRegistry(
  "config-sections",
  "isolates about-updates from sibling settings sections while retaining its production contribution and anchor",
  [configSections.get("about-updates")],
);
const operationsSectionRegistry = isolationRegistry(
  "config-sections",
  "isolates admin-operations from sibling settings sections while retaining its production contribution and anchor",
  [configSections.get("admin-operations")],
);
const systemTuningSectionRegistry = isolationRegistry(
  "config-sections",
  "isolates admin-system-tuning from sibling settings sections while retaining its production contribution and anchor",
  [configSections.get("admin-system-tuning")],
);

/** The Users SECTION (SET-SEAMS stage 3) in isolation — `admin.listUsers` + `sessions.me` (the viewer's role
 *  for the owner-only role controls) and the row-verb mutations are stubbed per-test via routeTrpc. The
 *  section owns its own read + suspense boundary now. TooltipProvider for the row-menu chrome. */
export function AdminUsersSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ height: 900, overflow: "auto", width: 960 }}>
          <CtConfigGroupBody anchor="admin" sections={adminUsersSectionRegistry} />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** A2 — the Approvals SECTION in isolation: `admin.listUsers` (filtered client-side to disabled non-owner
 *  accounts = the pending queue) + the `admin.setEnabled` approve mutation, stubbed per-test via routeTrpc. */
export function AdminApprovalsSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ height: 900, overflow: "auto", width: 960 }}>
          <CtConfigGroupBody anchor="admin" sections={adminApprovalsSectionRegistry} />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** B5 — the Link-SSO SECTION in isolation: `admin.listUsers` (filtered client-side to unbound, non-owner,
 *  human accounts = the linkable set) + the per-row Link dialog's `admin.linkSsoIdentity` mutation, stubbed
 *  per-test via routeTrpc. */
export function AdminLinkSsoSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ height: 900, overflow: "auto", width: 960 }}>
          <CtConfigGroupBody anchor="admin" sections={adminLinkSsoSectionRegistry} />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** The two ops SECTIONS (SET-SEAMS stage 3) — the catalog refreshers and the inline card embed, mounted
 *  together as the door renders them (adjacent at the admin anchor). Their verbs are stubbed per-test. */
export function AdminOpsSectionsStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 900, overflow: "auto", width: 960 }}>
        <CtConfigGroupBody anchor="admin" sections={adminOpsSectionsRegistry} />
      </div>
    </CtDataProviders>
  );
}

/** The REAL admin group, driven through the config host — the ONLY way to mount it since SET-SEAMS stage 3
 *  made it a `{kind:"sections"}` skimmer with no surface of its own. Deep-linked so it lands cold on admin
 *  with the REAL door-ordered section registry and the derived LIST rows — the production path. The group is
 *  `when`-gated, so the `.ct.tsx` must stub an ADMIN viewer. */
export function AdminGroupStory(): ReactElement {
  return <ConfigHostStory target="admin" height={900} width={1160} />;
}

/** The Rate limits admin SECTION (Phase B ③) in isolation — getAppSettingsWithOverrides +
 *  updateAppSettings stubbed per-test. */
export function RateLimitsSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ padding: 16, width: 720 }}>
          <CtConfigGroupBody anchor="admin" sections={rateLimitsSectionRegistry} />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** The Memory tuning admin SECTION (Phase B ③) in isolation — getAppSettingsWithOverrides +
 *  updateAppSettings stubbed per-test. */
export function MemoryTuningSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ padding: 16, width: 720 }}>
          <CtConfigGroupBody anchor="admin" sections={memoryTuningSectionRegistry} />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** The Memory tuning section at the narrow phone-content width used by its coarse-pointer containment CT. */
export function MemoryTuningSectionNarrowStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ padding: 8, width: 320 }}>
          <CtConfigGroupBody anchor="admin" sections={memoryTuningSectionRegistry} />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** The Media & trust SECTION (SET-SEAMS stage 4 — the decomposed System pane) in isolation. */
export function MediaTrustSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ padding: 16, width: 720 }}>
          <CtConfigGroupBody anchor="admin" sections={mediaTrustSectionRegistry} />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** The OWNER-GATED Multi-user section (SET-SEAMS stage 4) — Shared access left with the owner-compute premise
 *  (inference program F11/F13), so the owner predicate now gates this one row. */
export function GovernanceSectionsStory({ width = 720 }: { readonly width?: number }): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ padding: 16, width }}>
          <CtConfigGroupBody anchor="admin" sections={multiUserSectionRegistry} />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** The About version section in isolation — `settings.getVersion` on mount. Narrow on purpose (480px): the
 *  version line lives in the config pane's right column, which is the tightest real mount it gets. */
export function AboutSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ overflow: "visible", padding: 16, width: 480 }}>
          <CtConfigGroupBody anchor="about" sections={aboutSectionRegistry} />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** The admin's update-check section in isolation — `settings.checkForUpdate` ONLY on the button, at the same
 *  480px column as the version section. */
export function AboutUpdatesSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ overflow: "visible", padding: 16, width: 480 }}>
        <CtConfigGroupBody anchor="about" sections={aboutUpdatesSectionRegistry} />
      </div>
    </CtDataProviders>
  );
}

/** The Operations SECTION (SET-SEAMS stage 4) in isolation — corpusAutoindex + logLevel. */
export function OperationsSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ padding: 16, width: 720 }}>
          <CtConfigGroupBody anchor="admin" sections={operationsSectionRegistry} />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

function OperationsWithSocket(): ReactElement {
  useOrbSocket();
  return (
    <QueryBoundary fallback={<output>Loading operations</output>}>
      <OperationsConnectionProbe />
      <CtConfigGroupBody anchor="admin" sections={operationsSectionRegistry} />
    </QueryBoundary>
  );
}

function OperationsConnectionProbe(): ReactElement {
  const trpc = useTRPC();
  useSuspenseQueries({ queries: [trpc.settings.getAppSettingsWithOverrides.queryOptions(), trpc.sessions.me.queryOptions()] });
  const [connections, setConnections] = useState(0);
  useBusRoom(
    { channel: "user" },
    {
      onEvent: () => undefined,
      onServerReady: (id) => {
        if (id !== null) {
          setConnections((count) => count + 1);
        }
      },
    },
  );
  return <span data-testid={storyTestId("operationsConnections")}>{connections}</span>;
}

/** Restart recovery follows the real app socket and room hooks; the CT stubs only transport. */
export function OperationsRestartStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ padding: 16, width: 720 }}>
          <OperationsWithSocket />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** The real global mutation-error outlet plus contrary defaults prove restart's no-toast/no-retry policy. */
export function OperationsRestartMutationBeltStory(): ReactElement {
  const [clients] = useState(() => {
    const queryClient = createAppQueryClient();
    const trpcClient = createTrpcClient();
    const trpc = createTrpcProxy(trpcClient, queryClient);
    queryClient.setMutationDefaults(trpc.admin.restart.mutationOptions().mutationKey, { retry: 2, retryDelay: 0 });
    return { queryClient, trpcClient };
  });
  return (
    <QueryClientProvider client={clients.queryClient}>
      <TRPCProvider trpcClient={clients.trpcClient} queryClient={clients.queryClient}>
        <CtToastSurface>
          <div style={{ padding: 16, width: 720 }}>
            <OperationsWithSocket />
          </div>
        </CtToastSurface>
      </TRPCProvider>
    </QueryClientProvider>
  );
}

/** The System tuning admin SECTION (Phase B ⑩) in isolation — getAppSettingsWithOverrides +
 *  updateAppSettings stubbed per-test. */
export function SystemTuningSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ padding: 16, width: 720 }}>
          <CtConfigGroupBody anchor="admin" sections={systemTuningSectionRegistry} />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}
