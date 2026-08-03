// The five settings-SECTION CONTRIBUTIONS the retired SYSTEM pane decomposed into (SET-SEAMS stage 4).
// main.tsx assembles them into the ONE settings-section registry at the `admin` anchor, FIRST in door order
// — §10 Q2 ruled `system` merges INTO `admin`, with system's sections as the leading group.
//
// All five home in user-admin, which owns the admin pane and every other AppSettings section. §6's table
// suggested chat (media & trust) and workloads (compute) by reader-owns, but reader-owns decides USER-tier
// knobs: none of these APP-tier keys has a client reader at all (the render gates reach the client through
// `/api/auth/config`, not `getAppSettings`; the concurrency/ops knobs are server-only), and the built
// precedent for the tier is unambiguous — `memoryDefaults` is read by chat/memory and edited HERE, as are
// the transport's rate limits. Splitting them across features would also have moved AppSettings writes out
// of `knob-wire-coverage`'s arm-B2 admin-surface scope.
//
// No `when`: the admin pane carries the ONE viewer gate for this anchor. The owner-gated pair additionally
// gates its CONTROLS on the box owner, inside `governance-sections.tsx` (§4).
//
// Each `owns` claim is exactly what its section patches (S1/S2). Together with the three sections that were
// already here, the app tier's claims are now disjoint by construction.

import type { SettingsSectionContribution } from "#state";
import { ComputeSection } from "../components/compute-section.tsx";
import { MultiUserSection, SharedAccessSection } from "../components/governance-sections.tsx";
import { MediaTrustSection } from "../components/media-trust-section.tsx";
import { OperationsSection } from "../components/operations-section.tsx";
import {
  COMPUTE_SUBCATEGORY,
  MEDIA_TRUST_SUBCATEGORY,
  MULTI_USER_SUBCATEGORY,
  OPERATIONS_SUBCATEGORY,
  SHARED_ACCESS_SUBCATEGORY,
} from "./system-config-nav.ts";

// Each contribution id has ONE home — these consts. An id is both the registry key and the id the body
// REPORTS its save status under (§3), so the body takes it as a prop rather than re-spelling the literal.
const MEDIA_TRUST_ID = "admin-media-trust";
const COMPUTE_ID = "admin-compute";
const SHARED_ACCESS_ID = "admin-shared-access";
const MULTI_USER_ID = "admin-multi-user";
const OPERATIONS_ID = "admin-operations";

export const mediaTrustSection: SettingsSectionContribution = {
  id: MEDIA_TRUST_ID,
  anchor: "admin",
  nav: MEDIA_TRUST_SUBCATEGORY,
  owns: { tier: "app", keys: ["forbidExternalMedia", "trustHtml", "maxImageBytes"] },
  body: () => <MediaTrustSection sectionId={MEDIA_TRUST_ID} />,
};

export const computeSection: SettingsSectionContribution = {
  id: COMPUTE_ID,
  anchor: "admin",
  nav: COMPUTE_SUBCATEGORY,
  owns: { tier: "app", keys: ["vllmConcurrency"] },
  body: () => <ComputeSection sectionId={COMPUTE_ID} />,
};

export const sharedAccessSection: SettingsSectionContribution = {
  id: SHARED_ACCESS_ID,
  anchor: "admin",
  nav: SHARED_ACCESS_SUBCATEGORY,
  // The budget's WINDOW (`nonOwnerLocalComputeBudgetWindowMs`) is System tuning's — this section owns the
  // cap, its sibling owns the window, and the partition keeps them from ever writing each other's key.
  owns: { tier: "app", keys: ["allowNonOwnerLocalCompute", "nonOwnerLocalComputeBudget", "allowNonOwnerMaxProSub"] },
  body: () => <SharedAccessSection sectionId={SHARED_ACCESS_ID} />,
};

export const multiUserSection: SettingsSectionContribution = {
  id: MULTI_USER_ID,
  anchor: "admin",
  nav: MULTI_USER_SUBCATEGORY,
  owns: { tier: "app", keys: ["localMultiUser", "discreetLogin"] },
  body: () => <MultiUserSection sectionId={MULTI_USER_ID} />,
};

export const operationsSection: SettingsSectionContribution = {
  id: OPERATIONS_ID,
  anchor: "admin",
  nav: OPERATIONS_SUBCATEGORY,
  owns: { tier: "app", keys: ["corpusAutoindex", "logLevel"] },
  body: () => <OperationsSection sectionId={OPERATIONS_ID} />,
};
