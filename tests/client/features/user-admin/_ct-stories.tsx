// user-admin feature CT stories (docs/law/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The
// stories reach feature internals the front door doesn't re-export (the section BODIES are mounted by the
// settings host through the contribution defs) — the settings _ct-stories.tsx precedent.

import { TooltipProvider } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { AboutSection } from "../../../../packages/client/src/features/user-admin/components/about-section.tsx";
import { AdminApprovalsSection } from "../../../../packages/client/src/features/user-admin/components/admin-approvals-section.tsx";
import { AdminLinkSsoSection } from "../../../../packages/client/src/features/user-admin/components/admin-link-sso-section.tsx";
import { AdminCatalogSection, AdminEmbedCardSection } from "../../../../packages/client/src/features/user-admin/components/admin-ops-section.tsx";
import { AdminUsersSection } from "../../../../packages/client/src/features/user-admin/components/admin-users-section.tsx";
import { MultiUserSection } from "../../../../packages/client/src/features/user-admin/components/governance-sections.tsx";
import { MediaTrustSection } from "../../../../packages/client/src/features/user-admin/components/media-trust-section.tsx";
import { MemoryTuningSection } from "../../../../packages/client/src/features/user-admin/components/memory-tuning-section.tsx";
import { OperationsSection } from "../../../../packages/client/src/features/user-admin/components/operations-section.tsx";
import { RateLimitsSection } from "../../../../packages/client/src/features/user-admin/components/rate-limits-section.tsx";
import { StructuredOutputSection } from "../../../../packages/client/src/features/user-admin/components/structured-output-section.tsx";
import { SystemTuningSection } from "../../../../packages/client/src/features/user-admin/components/system-tuning-section.tsx";
import { CtDataProviders } from "../../../support/browser/ct-data-providers.tsx";
import { ConfigHostStory } from "../config/_ct-stories.tsx";

/** The Users SECTION (SET-SEAMS stage 3) in isolation — `admin.listUsers` + `sessions.me` (the viewer's role
 *  for the owner-only role controls) and the row-verb mutations are stubbed per-test via routeTrpc. The
 *  section owns its own read + suspense boundary now. TooltipProvider for the row-menu chrome. */
export function AdminUsersSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ height: 900, overflow: "auto", width: 960 }}>
          <AdminUsersSection />
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
          <AdminApprovalsSection />
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
          <AdminLinkSsoSection />
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
        <AdminCatalogSection />
        <AdminEmbedCardSection />
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
          <RateLimitsSection sectionId="admin-rate-limits" />
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
          <MemoryTuningSection sectionId="admin-memory-tuning" />
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
          <MemoryTuningSection sectionId="admin-memory-tuning" />
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
          <MediaTrustSection sectionId="admin-media-trust" />
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
          <MultiUserSection sectionId="admin-multi-user" />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** The About SECTION in isolation (owner ask 2026-09-18) — `settings.getVersion` on mount and, ONLY on the
 *  button, `settings.checkForUpdate`. Narrow on purpose (480px): the version line and the verdict row live
 *  in the config pane's right column, which is the tightest real mount they get. */
export function AboutSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ overflow: "visible", padding: 16, width: 480 }}>
          <AboutSection />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** The Operations SECTION (SET-SEAMS stage 4) in isolation — corpusAutoindex + logLevel. */
export function OperationsSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ padding: 16, width: 720 }}>
          <OperationsSection sectionId="admin-operations" />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** The Structured-output admin SECTION (D126) in isolation — getAppSettingsWithOverrides +
 *  updateAppSettings stubbed per-test. */
export function StructuredOutputSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ padding: 16, width: 720 }}>
          <StructuredOutputSection sectionId="admin-structured-output" />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** The System tuning admin SECTION (Phase B ⑩) in isolation — getAppSettingsWithOverrides +
 *  updateAppSettings stubbed per-test. */
export function SystemTuningSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ padding: 16, width: 720 }}>
          <SystemTuningSection sectionId="admin-system-tuning" />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}
