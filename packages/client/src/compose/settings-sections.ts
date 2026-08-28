// The settings-SECTION contributor assembly, extracted from the authed door into its own `compose/` sibling
// (§7 + `client-compose-door-only`, the `home-tiles.ts` precedent): still ONE assembly, still door-owned — it
// moved for `component-size`, not for architecture. The door re-imports `settingsSections` and delivers it
// through `SettingsSectionRegistryProvider`.
//
// The settings-SECTION contributor seam (§6c / pain-point §7 / SET-SEAMS §5.2): a feature raises ONE anchored
// section, the settings shell skims it — no growth of features/settings. ONE registry for EVERY anchor (the
// four per-anchor registries + their `make*Pane(…)` factories retired with SET-SEAMS stage 0), delivered by a
// context mint: the shell reads it for nav + search, each host pane's surface reads it for render. Adding a
// section is ONE line here.
//
// DOOR ORDER IS RENDER ORDER: within a pane, sections render in the order they appear below.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { appearanceBackgroundSection, appearanceEffectsSection, appearanceReadingSection, appearanceSizingSection } from "#features/app-shell";
import { librarySettingsSection } from "#features/character";
import {
  appearanceAvatarsSection,
  appearanceMessageDetailsSection,
  appearanceMessageStyleSection,
  chatMessageHandlingSection,
  chatStreamingSection,
  databankSettingsSection,
  imageryTemplatesSection,
  memorySettingsSection,
  proseSettingsSection,
} from "#features/chat";
import { pluginDistributeSection } from "#features/plugin";
import {
  adminApprovalsSection,
  adminCatalogSection,
  adminEmbeddingsSection,
  adminEnginesSection,
  adminLinkSsoSection,
  adminUsersSection,
  computeSection,
  mediaTrustSection,
  memoryTuningSection,
  multiUserSection,
  operationsSection,
  rateLimitsSection,
  sharedAccessSection,
  structuredOutputSection,
  systemTuningSection,
} from "#features/user-admin";
import { workloadsJobsSection, workloadsSchedulesSection, workloadsTuningSection } from "#features/workloads";
import { worldInfoSettingsSection } from "#features/world-info";
import type { SettingsSectionContribution } from "#state";
import { assertSettingsKeyPartition, createContributorRegistry } from "#state";

export const settingsSections = createContributorRegistry<SettingsSectionContribution>("settings-sections", [
  // chat-behavior ← the DECOMPOSED chat-behavior pane (SET-SEAMS stage 2) leading, then the sections that
  // were already contributions: chat/memory ① (the master switch), world-info ② (scanDepth/tokenBudget),
  // databank ④ (retrieval), imagery (prompt templates). The two chat-owned knob groups come FIRST, which
  // reproduces the pre-split pane exactly (its own sections rendered above the contributed ones).
  chatMessageHandlingSection,
  chatStreamingSection,
  memorySettingsSection,
  worldInfoSettingsSection,
  databankSettingsSection,
  imageryTemplatesSection,
  proseSettingsSection,
  // admin ← the former SYSTEM pane's five sections lead (SET-SEAMS stage 4 / §10 Q2 merged `system` INTO
  // `admin`, "system's sections becoming the first group"), in their pre-merge pane order …
  mediaTrustSection,
  computeSection,
  sharedAccessSection,
  multiUserSection,
  operationsSection,
  // … then the DECOMPOSED admin pane (SET-SEAMS stage 3) in its pre-split order (users · engines · model
  // catalog · card embeddings), then the AppSettings admin-tier sections that were already contributions.
  // All twelve are owned by user-admin (it owns the admin verbs + the admin-tier config).
  adminUsersSection,
  // A2 — the OIDC_REQUIRE_APPROVAL account-approval queue, right after Users.
  adminApprovalsSection,
  // B5 — the db-surgery-free "Link SSO identity" migration surface, right after Approvals.
  adminLinkSsoSection,
  adminEnginesSection,
  adminCatalogSection,
  adminEmbeddingsSection,
  memoryTuningSection,
  rateLimitsSection,
  systemTuningSection,
  structuredOutputSection,
  // workloads ← the DECOMPOSED workloads pane (SET-SEAMS stage 3): the jobs list and the schedules, ahead of
  // the analysis-tuning knobs (dupThreshold/computeThemesK/maxPairs/hubFraction) that were already a
  // contribution — reproducing the pre-split pane exactly.
  workloadsJobsSection,
  workloadsSchedulesSection,
  workloadsTuningSection,
  // appearance ← the DECOMPOSED appearance pane (SET-SEAMS stage 1). Order here IS render order down the
  // pane, and it reproduces the pre-split pane exactly. Each section is owned by the feature that READS its
  // knobs (§6): chat renders the message chrome, app-shell paints sizing/reading/effects/background, and
  // character reads the library page size.
  appearanceMessageStyleSection,
  appearanceAvatarsSection,
  appearanceSizingSection,
  appearanceMessageDetailsSection,
  appearanceBackgroundSection,
  appearanceReadingSection,
  appearanceEffectsSection,
  librarySettingsSection,
  // plugins ← the admin half of the Plugins pane (D147 clause (d)). The pane itself is UNGATED (everyone has
  // their own plugins); this section carries `when: viewer.isAdmin` and renders BELOW the pane's own
  // Installed / Add-a-plugin sections, which is the order a person meets them in: your plugins first, the
  // deployment-wide one last.
  pluginDistributeSection,
]);

// S2 — the key partition (SET-SEAMS §2.3). N sections patching ONE UserSettings namespace (or the ONE
// AppSettings blob) is safe only while their claims are DISJOINT — the server merges per key and serializes
// the write, so disjoint patches commute. THROWS here, at the door's assembly sibling, on an overlap
// (including a claim NESTED inside another section's, e.g. two owners of one `engineLaunch`) or on an
// uneditable knob inside a claimed user namespace.
assertSettingsKeyPartition(settingsSections, DEFAULT_USER_SETTINGS);
