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

import type { ConfigSectionContribution } from "#state";
import { MultiUserSection } from "../components/governance-sections.tsx";
import { MediaTrustSection } from "../components/media-trust-section.tsx";
import { OperationsSection } from "../components/operations-section.tsx";
import { MEDIA_TRUST_SUBCATEGORY, MULTI_USER_SUBCATEGORY, OPERATIONS_SUBCATEGORY } from "./system-config-nav.ts";

// Each contribution id has ONE home — these consts. An id is both the registry key and the id the body
// REPORTS its save status under (§3), so the body takes it as a prop rather than re-spelling the literal.
const MEDIA_TRUST_ID = "admin-media-trust";
const MULTI_USER_ID = "admin-multi-user";
const OPERATIONS_ID = "admin-operations";

export const mediaTrustSection: ConfigSectionContribution = {
  id: MEDIA_TRUST_ID,
  anchor: "admin",
  nav: MEDIA_TRUST_SUBCATEGORY,
  owns: { tier: "app", keys: ["forbidExternalMedia", "trustHtml", "allowInteractiveCards", "maxImageBytes"] },
  body: () => <MediaTrustSection sectionId={MEDIA_TRUST_ID} />,
};

export const multiUserSection: ConfigSectionContribution = {
  id: MULTI_USER_ID,
  anchor: "admin",
  nav: MULTI_USER_SUBCATEGORY,
  owns: { tier: "app", keys: ["localMultiUser", "discreetLogin", "privateEndpointAllowlist"] },
  body: () => <MultiUserSection sectionId={MULTI_USER_ID} />,
};

export const operationsSection: ConfigSectionContribution = {
  id: OPERATIONS_ID,
  anchor: "admin",
  nav: OPERATIONS_SUBCATEGORY,
  owns: { tier: "app", keys: ["corpusAutoindex", "logLevel"] },
  body: () => <OperationsSection sectionId={OPERATIONS_ID} />,
};
