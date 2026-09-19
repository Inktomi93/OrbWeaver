// The config-SECTION contributor assembly, extracted from the authed door into its own `compose/` sibling
// (§7 + `client-compose-door-only`, the `home-tiles.ts` precedent): still ONE assembly, still door-owned — it
// moved for `component-size`, not for architecture. The door re-imports `configSections` and delivers it
// through `ConfigSectionRegistryProvider`.
//
// The config-SECTION contributor seam (§6c / pain-point §7 / SET-SEAMS §5.2, re-anchored on `ConfigGroupId`
// by the config revamp #866 S1): a feature raises ONE anchored section, the config host skims it — no growth
// of the host. ONE registry for EVERY anchor, delivered by a context mint: the LIST reads it for its rows +
// search, each host group's surface reads it for render. Adding a section is ONE line here.
//
// DOOR ORDER IS RENDER ORDER: within a group, sections render in the order they appear below.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { appearanceBackgroundSection, appearanceEffectsSection, appearanceReadingSection, appearanceSizingSection } from "#features/app-shell";
import { automationBudgetSection, automationLibraryRulesSection } from "#features/automation";
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
import { appearanceLooksSection } from "#features/config";
import { connectionsHostClaudeSection, connectionsKeysSection, connectionsRolesSection } from "#features/credentials";
import { personaListSection, personaNotificationsSection, personaThisChatSection } from "#features/persona";
import { pluginDistributeSection, pluginsInstalledSection, pluginsInstallSection } from "#features/plugin";
import {
  aboutSection,
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
import { backupExportSection, backupImportSection, workloadsJobsSection, workloadsSchedulesSection, workloadsTuningSection } from "#features/workloads";
import { worldInfoSettingsSection } from "#features/world-info";
import { createContributorRegistry } from "#lib";
import type { ConfigSectionContribution } from "#state";
import { assertSettingsKeyPartition, assertTeachHonesty } from "#state";

export const configSections = createContributorRegistry<ConfigSectionContribution>("config-sections", [
  // personas ← the persona surface's FRAME as three sections (config-revamp-design.md §6.8.2): the notify
  // switch, the roster (the same component the rail popover and the You sheet render — the editor is its
  // search leaf), the this-chat picker (the pinned row is its leaf). Owner-sacred editing model untouched.
  personaNotificationsSection,
  personaListSection,
  personaThisChatSection,
  // backup ← the two halves of the portability system, export ahead of import (§6.8).
  backupExportSection,
  backupImportSection,
  // connections ← roles first (what a turn resolves), then the owner-only host-Claude probe, then the key
  // library the roles resolve their credential from (§6.8; the pre-decomposition surface order).
  connectionsRolesSection,
  connectionsHostClaudeSection,
  connectionsKeysSection,
  // automation ← C5's owner-global rule list + picker, then the owner ceiling (§6.8).
  automationLibraryRulesSection,
  automationBudgetSection,
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
  // … and LAST at this anchor: what this box IS (owner ask 2026-09-18). Last on purpose — it is the row a
  // reader scrolls to deliberately when filing a bug, never one they pass through on the way to a knob.
  aboutSection,
  // workloads ← the DECOMPOSED workloads pane (SET-SEAMS stage 3): the jobs list and the schedules, ahead of
  // the analysis-tuning knobs (dupThreshold/computeThemesK/maxPairs/hubFraction) that were already a
  // contribution — reproducing the pre-split pane exactly.
  workloadsJobsSection,
  workloadsSchedulesSection,
  workloadsTuningSection,
  // appearance ← LOOKS leads (#866 S4/#297 — the first appearance decision; the theme picker + builder
  // folded in from the retired `theme` modal), then the DECOMPOSED appearance pane (SET-SEAMS stage 1) in
  // its pre-split order. Each section is owned by the feature that READS its knobs (§6): settings owns the
  // theme (D114), chat renders the message chrome, app-shell paints sizing/reading/effects/background, and
  // character reads the library page size. The `advanced` sections render inside the group's
  // "Customize this look" fold (collapsed by default — the #297 explicit custom arm).
  appearanceLooksSection,
  appearanceMessageStyleSection,
  appearanceAvatarsSection,
  appearanceSizingSection,
  appearanceMessageDetailsSection,
  appearanceBackgroundSection,
  appearanceReadingSection,
  appearanceEffectsSection,
  librarySettingsSection,
  // plugins ← Installed, then Add-a-plugin (both UNGATED — everyone has their own plugins, D147), then the
  // admin half (D147 clause (d), `when: viewer.isAdmin`) LAST: your plugins first, the deployment-wide one
  // after — the order a person meets them in (§6.8).
  pluginsInstalledSection,
  pluginsInstallSection,
  pluginDistributeSection,
]);

// S2 — the key partition (SET-SEAMS §2.3). N sections patching ONE UserSettings namespace (or the ONE
// AppSettings blob) is safe only while their claims are DISJOINT — the server merges per key and serializes
// the write, so disjoint patches commute. THROWS here, at the door's assembly sibling, on an overlap
// (including a claim NESTED inside another section's, e.g. two owners of one `engineLaunch`) or on an
// uneditable knob inside a claimed user namespace.
assertSettingsKeyPartition(configSections, DEFAULT_USER_SETTINGS);

// S3 — teach honesty (owner rider R-TEACH). The TYPE makes a leaf's teach unforgettable; this sweep makes
// it unfakeable: an empty summary/affects, a reasonless {none}, or a related ref that resolves to nothing
// throws HERE, at assembly, over the real population — never a hollow pane at read time.
assertTeachHonesty(configSections);
