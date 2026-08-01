// CT: the decomposed ADMIN PANE (SET-SEAMS stage 3). The pane is a `{kind:"sections"}` SKIMMER now — it has
// no surface of its own — so the only honest mount is the real settings shell, which is also the only place
// the derived nav and the `when` viewer gate exist. Everything here is a PANE-level invariant; per-section
// reads/writes are pinned by each section's own CT at its mirror path.
//
// Covers, from the SET-SEAMS §9 plan: the shared render-parity geometry harness · door order IS render order
// · P5 nav/search parity for the four moved subs · P6 `when` parity (a non-admin viewer sees the pane
// nowhere) · the §7.4 sub-level deep link onto a moved section.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder, TrpcRoutes } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { findSettingsColumnViolation, readSettingsPaneGeometry } from "../../../../support/ct/settings-geometry";
import { SettingsShellDeepLinkStory, SettingsShellStory } from "../../settings/_ct-stories";
import { AdminPaneStory } from "../_ct-stories";

const OWNER_VIEWER = { userId: "user_owner", handle: "root", globalRole: "owner" };
const PLAIN_VIEWER = { userId: "user_kes", handle: "kes", globalRole: "user" };

const USERS = [
  {
    id: "user_owner",
    handle: "root",
    externalId: null,
    role: "owner",
    enabled: true,
    kind: "human",
    ownerHandle: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  },
];

const APP_SETTINGS = {
  engineLaunch: {
    embedModel: "Qwen/Qwen3-VL-Embedding-2B",
    rerankModel: "Qwen/Qwen3-VL-Reranker-2B",
    genModel: "Qwen/Qwen3-VL-8B-Instruct",
    embedMaxModelLen: 8192,
    rerankMaxModelLen: 8192,
    genMaxModelLen: 32_768,
    embedGpuUtil: 0.14,
    rerankGpuUtilMulti: 0.16,
    rerankGpuUtilSingle: 0.22,
    genGpuUtilMulti: 0.28,
    genGpuUtilSingle: 0.5,
    poolingMaxPixels: 1_843_200,
    genMaxPixels: 4_194_304,
    genRepetitionPenalty: 1.05,
  },
};

/** The seven sections at the `admin` anchor, in the door's declared order (main.tsx) — which IS the render
 *  order: the four that moved out of the retired pane surface, then the AppSettings admin-tier sections. */
const ANCHOR_ORDER = [
  "settings-anchor-admin-users",
  "settings-anchor-admin-engines",
  "settings-anchor-admin-model-catalog",
  "settings-anchor-admin-card-embeddings",
  "settings-anchor-admin-memory-tuning",
  "settings-anchor-admin-rate-limits",
  "settings-anchor-admin-system-tuning",
];

/** The nav rows the pane DERIVES from its contributions, in door order. */
const NAV_LABELS = ["Users", "Engines", "Model catalog", "Card embeddings", "Memory tuning", "Rate limits", "System tuning"];
/** A moved section's surviving search leaf, and the nav label a hidden pane must not surface. */
const SESSIONS_LEAF = /Sessions/;
const ENGINES_LEAF = /Engines/;

// The resolved slice the three AppSettings sections read together (each CT above pins its own knobs; here
// they all mount at once, so ONE stub must satisfy all three). Untyped route stubs, so a partial suffices.
const RESOLVED_APP = {
  ...APP_SETTINGS,
  memoryDefaults: {},
  memorySummarizer: {},
  rateLimits: { publicIp: 60, authed: 600, aiTurn: 30, login: 10 },
  agentSdkConcurrency: { summarize: 4 },
  promptTransformDeadlineMs: 250,
  nonOwnerLocalComputeBudgetWindowMs: 86_400_000,
  catalogRefreshIntervalMs: 86_400_000,
  imageVariantQuality: 80,
  maxDatabankBytes: 20_971_520,
};

function stub(page: Page, viewer: typeof OWNER_VIEWER, extra: TrpcRoutes = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "admin.listUsers": () => USERS,
    "sessions.me": () => viewer,
    "admin.vllmEngines": () => ({}),
    "settings.getAppSettings": () => APP_SETTINGS,
    "settings.getAppSettingsWithOverrides": () => ({ resolved: RESOLVED_APP, overrides: {} }),
    // The plain-viewer arm lands on the default `appearance` pane, whose sections read the user settings.
    "settings.getUserSettings": () => ({ userId: viewer.userId, schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 }),
    ...extra,
  });
}

test("the skimmer renders all seven admin sections, in the door's declared order", async ({ mount, page }) => {
  await stub(page, OWNER_VIEWER);
  await mount(<AdminPaneStory />);
  await page.getByRole("heading", { name: "Users" }).waitFor();

  const anchorIds = await page.evaluate(() => [...document.querySelectorAll('[id^="settings-anchor-admin-"]')].map((el) => el.id));
  expect(anchorIds).toStrictEqual(ANCHOR_ORDER);
});

// Single-column-of-SECTIONS (owner ruling — Discord grammar): every subcategory SECTION shares the same left
// edge + full column width and stacks in registry order. Runs the SHARED render-parity harness (SET-SEAMS
// §9) — a decomposition that moves the pixels is a defect.
test("subcategory sections are a single column, stacked in registry order", async ({ mount, page }) => {
  await stub(page, OWNER_VIEWER);
  await mount(<AdminPaneStory />);
  await page.getByRole("heading", { name: "Users" }).waitFor();

  const geometry = await readSettingsPaneGeometry(page, "admin");
  expect(findSettingsColumnViolation(geometry, ANCHOR_ORDER.length)).toBeNull();
});

// P5 — NAV/SEARCH PARITY (SET-SEAMS §7.2/§7.3). The pane's nav DERIVES from the contributions now; the four
// moved subs keep their labels, their leaves, and their (category, subId) anchors.
test("the derived nav lists every contributed section, in door order", async ({ mount, page }) => {
  await stub(page, OWNER_VIEWER);
  await mount(<AdminPaneStory />);
  await page.getByRole("heading", { name: "Users" }).waitFor();

  const nav = page.getByRole("navigation", { name: "Settings sections" });
  await Promise.all(NAV_LABELS.map((label) => expect(nav.getByText(label, { exact: true })).toBeVisible()));
});

test("a search leaf of a MOVED section still jumps to a live anchor", async ({ mount, page }) => {
  await stub(page, OWNER_VIEWER);
  await mount(<AdminPaneStory />);
  await page.getByRole("heading", { name: "Users" }).waitFor();

  // "Sessions" travelled with the users section into its own nav file (§7.2).
  await page.getByRole("combobox", { name: "Search settings" }).fill("revoke");
  const result = page.getByRole("option", { name: SESSIONS_LEAF }).first();
  await expect(result).toBeVisible();
  await result.click();

  // The jump landed on a section that EXISTS and scrolled it into view — a stale leaf pointing at a retired
  // anchor would silently scroll to nothing.
  await expect(page.locator("#settings-anchor-admin-users")).toBeInViewport();
});

// P6 — `when` PARITY (SET-SEAMS §9). The gate lives on the PANE (one predicate, three consumers): a plain
// viewer must see the admin pane in NEITHER the nav NOR the search index, and none of its sections anywhere.
test("a plain viewer sees no Admin nav row, no admin search hit, and no admin section", async ({ mount, page }) => {
  await stub(page, PLAIN_VIEWER);
  await mount(<SettingsShellStory />);
  await page.getByRole("navigation", { name: "Settings sections" }).waitFor();

  await expect(page.getByRole("navigation", { name: "Settings sections" }).getByText("Admin", { exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Search settings" }).fill("engines");
  await expect(page.getByRole("option", { name: ENGINES_LEAF })).toHaveCount(0);
  await expect(page.locator('[id^="settings-anchor-admin-"]')).toHaveCount(0);
});

// §7.4 / §10 Q4 — a SUB-level deep link resolves the pane in render and lands on the section's anchor once
// the pane's DOM has it. The sub ids are byte-identical across the move, so old links keep working.
test("a sub-level deep link lands on the moved section's anchor", async ({ mount, page }) => {
  await stub(page, OWNER_VIEWER);
  await mount(<SettingsShellDeepLinkStory target="admin" subId="engines" />);

  await expect(page.locator("#settings-anchor-admin-engines")).toBeVisible();
});
