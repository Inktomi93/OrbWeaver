// CT: the config HOST — the LIST (shelves · group bands · the derived section rows) and the CONTENT pane
// (the skimmer over the contributed sections) as ONE workspace (config-revamp-design.md §3 / §6.8; the
// settings shell's CT, re-homed when the shell dissolved into the `config` section, #866 S1). Drives the
// PRODUCTION path — the real door registries, the real contributed sections, `openConfigTo` deep links,
// the scroll-spy and the programmatic jump.
//
// RETIRED WITH THE SHELL, on purpose (each with its new home): the cmdk search tests → S2's
// `config-search-input.ct.tsx` (the search is S2's ONE index over `@orb/ui/fuzzy-search`); the modal-chrome
// divider/baseline test → gone with the `settings` modal (D62 rule 5); the "both columns fill the row"
// and the 430px push-detail arm → the app-shell's one-shell rule owns pane geometry now (app-shell.ct.tsx;
// `ConfigMobileListStory` pins the LIST-is-the-screen half).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { readEscapedAbsolutes } from "../../../../support/ct/settings-geometry.ts";
import { makeResolvedChatCapability } from "../../../../support/factories/resolved-connection.ts";
import { ConfigHostInScrollingHostStory, ConfigHostStory } from "../_ct-stories.tsx";

/** The getUserSettings read-model the Appearance group suspends on — defaults are enough to render it. */
// The Looks section (#866 S4) reads the theme library — three seeds, no owned rows.
const LOOKS_THEMES = [
  { id: "theme_00000000000000000000000001", name: "Hearth", override: {}, css: null, isSeed: true, createdAt: 0, updatedAt: 0 },
  { id: "theme_00000000000000000000000002", name: "Mocha", override: {}, css: null, isSeed: true, createdAt: 0, updatedAt: 0 },
  { id: "theme_00000000000000000000000003", name: "Light", override: {}, css: null, isSeed: true, createdAt: 0, updatedAt: 0 },
];
const USER_SETTINGS_VIEW = {
  userId: "user_ct_settings",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS,
  updatedAt: 0,
};

/** The Distribute section's own dropzone input, addressed by its ACCESSIBLE NAME — the group hosts TWO
 *  dropzones (install for yourself · distribute to everyone) and the shared `data-slot` selector resolves to
 *  both, so the slot alone is a strict-mode violation. The name is also what tells the two apart on screen. */
const DISTRIBUTE_DROPZONE_LABEL = "Choose a plugin bundle to distribute";

/** The LIST landmark — the shelves + bands + rows, named by the host. */
const LIST_REGION = "Settings groups";
/** The group bands — the disclosure buttons, one per group, stamped by the LIST. */
const BAND = '[data-slot="config-band"]';
/** The four collection groups: their bands disclose MEMBER rows, not section rows, so the sweep that expects
 *  "exactly one current section row" skips them. */
const COLLECTION_GROUPS = new Set(["tags", "regex", "worldInfo", "rosterPreset"]);

/** A REAL, installable bundle (the two entries the funnel admits) for the distribute flow — built with the
 *  same `fflate` the surface reads it back with, so the confirm step's capability list comes from a genuine
 *  client-side manifest read rather than a prop. */
function distributableBundle(): Buffer {
  return Buffer.from(
    zipSync({
      "manifest.json": strToU8(
        JSON.stringify({
          id: "house-style",
          name: "House Style",
          version: "1.0.0",
          hostVersion: 1,
          entry: "main.js",
          description: "Keeps the house voice consistent.",
          capabilities: ["chat.read"],
        }),
      ),
      "main.js": strToU8("export function activate() {}\n"),
    }),
  );
}

/** A resolved EffectiveAppConfig + owner viewer — every `admin`-anchored AppSettings section suspends on
 *  these (eight of them since SET-SEAMS stage 4 merged the System pane in). */
const APP_CONFIG = {
  corpusAutoindex: false,
  importSkipCharacters: [],
  logLevel: "info",
  forbidExternalMedia: true,
  trustHtml: false,
  memoryDefaults: {},
  memorySummarizer: {},
  rateLimits: { login: 10, aiTurn: 10, publicIp: 50, authed: 200 },
  vllmConcurrency: { embed: 4, summarize: 2 },
  agentSdkConcurrency: { summarize: 4 },
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
    genPresencePenalty: 1.5,
  },
  allowNonOwnerLocalCompute: true,
  nonOwnerLocalComputeBudget: null,
  nonOwnerLocalComputeBudgetWindowMs: 86_400_000,
  allowNonOwnerMaxProSub: false,
  localMultiUser: false,
  discreetLogin: false,
  maxImageBytes: 5_000_000,
  maxDatabankBytes: 20_971_520,
  promptTransformDeadlineMs: 250,
  catalogRefreshIntervalMs: 86_400_000,
  imageVariantQuality: 80,
  structuredOutputShape: "as-projected",
};
const OWNER_VIEWER = { userId: "user_owner", handle: "owner", globalRole: "owner" };

/** The owner-global fire-rate ceiling the Automation group's budget section renders. */
const OWNER_RATE_CEILING = 30;

/** The Automation rules section's opening gloss — the line that says what is DIFFERENT about the
 *  library-wide lane, and the group's most load-bearing string: it is the first thing the group paints, it is
 *  NOT the group's `description` (only the welcome and the placeholder render that), and it is what
 *  distinguishes this group's content from every other group's. */
const AUTOMATION_GLOSS = "These rules watch your library and act on their own — no chat has to be open.";

/**
 * THE HOST'S AMBIENT READS (#649) — spread FIRST into every `routeTrpc` call in this file.
 *
 * The host mounts whichever group is active over the WHOLE registry of contributed sections, so a mount can
 * fire the identity read the LIST gates on, the AppSettings pair the admin-anchored sections suspend on, the
 * personas roster, the key library, and the workloads run-history + schedule rows. None of that is any ONE
 * test's subject — but `routeTrpc` answers an unlisted procedure `null`, which is not a view, so those
 * pipelines would run INERT and a regression in any of them would be invisible to this file.
 *
 * DEFAULTS, NOT A CEILING. The identity-gate tests below list `sessions.me` AFTER the spread and win.
 */
const HOST_AMBIENT_ROUTES: Readonly<Record<string, unknown>> = {
  "sessions.me": { userId: USER_SETTINGS_VIEW.userId, handle: "ct_settings", globalRole: "user" },
  "settings.getAppSettings": APP_CONFIG,
  "settings.getAppSettingsWithOverrides": { resolved: APP_CONFIG, overrides: {} },
  "persona.list": [],
  "credentials.list": [],
  "workloads.list": [],
  "workloads.listSchedules": [],
  "connection.resolveChatCapability": makeResolvedChatCapability(),
  "plugin.list": [],
  "plugin.listDistributed": [],
  "automation.listOwnerRules": [],
  "automation.getOwnerBudgets": { maxFiresPerHour: OWNER_RATE_CEILING },
  // The four collection rosters the LIST paints counts for (the same reads `config-list-surface.ct.tsx` feeds).
  "tag.listTagsWithUsage": [],
  "regex.listScripts": [],
  "regex.listGlobal": [],
  "worldInfo.listBooksWithUsage": [],
  "worldInfo.listGlobal": [],
  "rosterPreset.list": [],
};

async function stub(page: Page, extra: Readonly<Record<string, unknown>> = {}): Promise<void> {
  await routeTrpc(page, { ...HOST_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW, "settings.listThemes": () => LOOKS_THEMES, ...extra });
}

test("renders the four shelves as NAMED groups, labelled by their own kicker, with the group bands inside them", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  const list = component.getByRole("region", { name: LIST_REGION });
  // The kicker is the shelf's NAME, so it has to be wired as one (side-eye 2026-08-16 ARIA rider): a bare
  // paragraph would announce one flat run of rows and a reader navigating by structure could not tell where
  // the user shelf ended and the app shelf began.
  //
  // COUNTED AS SHELVES, not as "every `role=group` in the pane" (#925). The arrival default now opens the
  // first group at mount, and an expanded group with an advanced fold draws a NESTED `role="group"` of its
  // own (#978 F4's fold rows, deliberately) — so the loose count measured "four shelves" by accident and
  // read 5 the moment anything was open. The claim was always about the shelves.
  await expect(list.locator("[data-config-shelf]")).toHaveCount(4);
  await expect(list.getByRole("group", { name: "User" })).toBeVisible();
  await expect(list.getByRole("group", { name: "App" })).toBeVisible();
  await expect(list.getByRole("group", { name: "Collections" })).toBeVisible();
  await expect(list.getByRole("group", { name: "Extensions" })).toBeVisible();
  // The bands live INSIDE their shelf, which is the whole point — a group nobody is in is decoration.
  await expect(list.getByRole("group", { name: "User" }).getByRole("button", { name: "Appearance" })).toBeVisible();
  await expect(list.getByRole("group", { name: "App" }).getByRole("button", { name: "Connections" })).toBeVisible();
  await expect(list.getByRole("group", { name: "Extensions" }).getByRole("button", { name: "Plugins" })).toBeVisible();
});

// PREMISE RETIRED, TEST KEPT (#925 ruling 4). This used to open "nothing active ⇒ the welcome": the arrival
// default now lands the FIRST group's settings, so that half is a lie about the product and its replacement
// (the zero-click arrival, and the landing as a state you LEAVE) is pinned in `config-list-surface.ct.tsx`.
// What survives here is the half that is still true and still load-bearing: a band click switches the pane to
// THAT group and lands on its first section.
test("a band click activates the group and lands on its FIRST section", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory target="automation" />);

  await expect(component.getByRole("region", { name: "Automation settings" })).toBeVisible();
  await expect(component.getByRole("region", { name: "Appearance settings" })).toHaveCount(0);

  await component.getByRole("button", { name: "Appearance" }).click();
  // The migrated #31 appearance sections render their "Message style" SECTION heading (the LIST also has a
  // "Message style" row — target the pane's heading specifically).
  await expect(component.getByRole("region", { name: "Appearance settings" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Message style" })).toBeVisible();
});

// ONE "you are here" per location (side-eye 2026-08-01): a group band that OWNS sections is a disclosure
// GROUP — it carries aria-expanded, never aria-current, because its active child already is the current
// item. Both carrying aria-current announced two current items for one place.
test("an active band is a disclosure GROUP (aria-expanded) and only its FIRST section row is aria-current", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory target="appearance" />);

  const appearance = component.getByRole("button", { name: "Appearance" });
  await expect(appearance).toHaveAttribute("aria-expanded", "true");
  await expect(appearance).not.toHaveAttribute("aria-current", "true");
  // Exactly one LIST row is current, and it is a LEAF (a section) — the group's first section, since the
  // group opens at its top.
  const list = component.getByRole("region", { name: LIST_REGION });
  await expect(list.locator('[aria-current="true"]')).toHaveCount(1);
  await expect(component.getByRole("button", { name: "Looks", exact: true })).toHaveAttribute("aria-current", "true");
});

test("a sectioned group is a disclosure group whose FIRST section is the one aria-current leaf (Automation)", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  const automation = component.getByRole("button", { name: "Automation" });
  await automation.click();
  await expect(automation).toHaveAttribute("aria-expanded", "true");
  await expect(automation).not.toHaveAttribute("aria-current", "true");
  // Landing at the top of the group IS landing on its first section — "Library-wide rules", the first of the
  // two sections the automation feature contributes (config-revamp-design.md §6.8).
  await expect(component.getByRole("button", { name: "Library-wide rules" })).toHaveAttribute("aria-current", "true");
  const list = component.getByRole("region", { name: LIST_REGION });
  await expect(list.locator('[aria-current="true"]')).toHaveCount(1);
});

// C-12 DISCLOSURE MEMORY: the active group is always open, and a group the reader opened STAYS open across a
// switch (device-local memory) — the LIST is a roster of disclosures, not a single-open accordion. What never
// paints is a group nobody opened: Connections' rows exist only once Connections is entered.
test("the active group expands into its section rows; an untouched sibling's rows are not painted; an opened one is remembered", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory target="appearance" />);

  await expect(component.getByRole("button", { name: "Avatars" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Reading typography" })).toBeVisible();
  // Connections was never opened → none of its rows are painted.
  await expect(component.getByRole("button", { name: "Model roles" })).toHaveCount(0);
  await component.getByRole("button", { name: "Connections" }).click();
  await expect(component.getByRole("button", { name: "Model roles" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Connections" })).toHaveAttribute("aria-expanded", "true");
  // …and Appearance, opened by the deep link, is REMEMBERED open beside it (C-12), no longer active.
  await expect(component.getByRole("button", { name: "Avatars" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Appearance" })).toHaveAttribute("aria-expanded", "true");
  await expect(component.getByRole("button", { name: "Avatars" })).not.toHaveAttribute("aria-current", "true");
});

test("clicking a section row marks it aria-current", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory target="appearance" />);

  // exact: the S3 teach rows add 'More info about Show avatars in chat' buttons a loose name would also match.
  await component.getByRole("button", { name: "Avatars", exact: true }).click();
  await expect(component.getByRole("button", { name: "Avatars", exact: true })).toHaveAttribute("aria-current", "true");
});

test("switching to Automation shows ITS distinct content — the owner-global rules + the rate belt, as two anchored sections", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  await component.getByRole("button", { name: "Automation" }).click();

  // Section 1 — the rule list, on `listOwnerRules: []`: the opening gloss plus the empty state that says
  // what to do about it ([[empty-states-are-load-bearing]]).
  await expect(component.getByRole("heading", { name: "Library-wide rules" })).toBeVisible();
  await expect(component.getByText(AUTOMATION_GLOSS)).toBeVisible();
  await expect(component.getByText("Nothing is watching your library yet.", { exact: false })).toBeVisible();
  await expect(component.getByRole("button", { name: "Add a rule" })).toBeVisible();

  // Section 2 — the owner RATE BELT, which has no per-chat equivalent. The control is asserted BY ITS
  // LABEL, not by a placeholder string: the `Field`-owned association is the thing that would break silently
  // if a second `aria-label` were added.
  await expect(component.getByRole("heading", { name: "Rate limit" })).toBeVisible();
  await expect(component.getByRole("textbox", { name: "Runs per hour" })).toHaveValue(String(OWNER_RATE_CEILING));
  // The belt AUTOSAVES on blur/Enter — there is no explicit "Save limit" button.
  await expect(component.getByRole("button", { name: "Save limit" })).toHaveCount(0);

  // …and the group's `description` is NOT on screen — the assertion that keeps this test honest about which
  // body arm rendered (a regression to the placeholder arm would paint it).
  await expect(component.getByText("Rules that watch your whole library", { exact: false })).toHaveCount(0);

  // THE MEASURE, not just the content (side-eye re-verify 2026-08-08): prose in a pane must be a paragraph,
  // not a column.
  const gloss = component.getByText(AUTOMATION_GLOSS);
  await expect.poll(async () => await gloss.boundingBox()).not.toBeNull();
  const box = await gloss.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(200);
});

// Task #37 — Connections is a REAL group (the placeholder is GONE); Admin is a REAL group too. SET-SEAMS
// stage 4 (§10 Q2) retired the `system` category entirely — its former first section, "Media & trust", is
// reachable through ADMIN now, and no System band exists. Connections and Automation are SKIMMERS since §6.8:
// their sections are contributions, so "real" means the contributed headings render at the group's anchors.
test("Admin absorbed the System sections; Connections and Automation are real groups of contributed sections", async ({ mount, page }) => {
  await stub(page, {
    "sessions.me": () => OWNER_VIEWER,
    "admin.listUsers": () => [],
    "admin.vllmEngines": () => ({}),
  });
  const component = await mount(<ConfigHostStory />);

  await expect(component.getByRole("button", { name: "System", exact: true })).toHaveCount(0);
  await component.getByRole("button", { name: "Admin" }).click();
  await expect(component.getByRole("heading", { name: "Media & trust" })).toBeVisible();
  await expect(component.locator("#config-anchor-admin-media-trust")).toBeVisible();

  // Connections → the real role-slot + key-library sections, at connections-keyed anchors.
  await component.getByRole("button", { name: "Connections" }).click();
  await expect(component.getByRole("heading", { name: "Model roles" })).toBeVisible();
  await expect(component.locator("#config-anchor-connections-model-roles")).toBeVisible();
  await expect(component.getByRole("heading", { name: "Saved keys" })).toBeVisible();
  // The OWNER-only host-Claude probe is a `when`-gated section: present for this owner viewer, in the LIST
  // and in the body alike (one predicate, three consumers).
  await expect(component.getByRole("heading", { name: "Host Claude" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Host Claude" })).toBeVisible();

  await component.getByRole("button", { name: "Automation" }).click();
  await expect(component.getByText(AUTOMATION_GLOSS)).toBeVisible();
});

// The §6.8 `when` on the host-Claude section: a plain user gets neither its LIST row nor its heading — the old
// `surface` rendered `null` for a non-owner under a row that scrolled to nothing.
test("a plain user sees NO Host Claude row and no Host Claude section on Connections", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory target="connections" />);

  await expect(component.getByRole("heading", { name: "Model roles" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Host Claude" })).toHaveCount(0);
  await expect(component.getByRole("heading", { name: "Host Claude" })).toHaveCount(0);
});

// The admin gate (the group's `when` — UX honesty over the server's adminProcedure floor): the Admin band
// exists ONLY for owner ∪ admin viewers.
test("a plain user never sees the Admin band", async ({ mount, page }) => {
  await stub(page, { "sessions.me": () => ({ userId: "user_plain", handle: "plain", globalRole: "user" }) });
  const component = await mount(<ConfigHostStory />);

  await expect(component.getByRole("button", { name: "Connections" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Admin" })).toHaveCount(0);
});

// D147 — the OTHER side of the same gate: plugins are user-scoped, so a plain user must REACH this group.
// Asserted on the RENDERED sections, not on the band alone: the band existing while the body refused would
// be the same failure one screen further in.
test("a plain user DOES see the Plugins band, and it mounts the real per-user sections", async ({ mount, page }) => {
  await stub(page, { "sessions.me": () => ({ userId: "user_plain", handle: "plain", globalRole: "user" }) });
  const component = await mount(<ConfigHostStory />);

  await component.getByRole("button", { name: "Plugins" }).click();
  await expect(component.getByRole("heading", { name: "Installed" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Add a plugin" })).toBeVisible();
  await expect(component.getByText("Nothing installed yet.", { exact: false })).toBeVisible();
  // …and the LIST derived both rows from the contributions (§6.8 — nothing else paints a row).
  await expect(component.getByRole("button", { name: "Installed" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Add a plugin" })).toBeVisible();
});

// D147 clause (d) — the ADMIN half of the same group. The server-wide install is a viewer-gated SECTION
// contributed at the `plugins` anchor, never a gate on the group, so this pair asserts the gate from BOTH
// sides on the SAME screen: a plain user reaches their own plugins and does NOT see the deployment-wide
// control, an admin sees both. One `when`, three consumers: the body, the LIST row, and (S2) the search.
test("a plain user does NOT see the Distribute section on their Plugins group", async ({ mount, page }) => {
  await stub(page, { "sessions.me": () => ({ userId: "user_plain", handle: "plain", globalRole: "user" }) });
  const component = await mount(<ConfigHostStory />);

  await component.getByRole("button", { name: "Plugins" }).click();
  await expect(component.getByRole("heading", { name: "Installed" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Distribute to everyone" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Distribute to everyone" })).toHaveCount(0);
});

test("an ADMIN sees the Distribute section on the Plugins group, and publishing lands in the published list", async ({ mount, page }) => {
  let published: readonly unknown[] = [];
  await stub(page, {
    "sessions.me": () => ({ userId: "user_admin", handle: "admin", globalRole: "admin" }),
    "plugin.listDistributed": () => published,
    "plugin.installForAllUsers": () => {
      published = [{ slug: "house-style", name: "House Style", version: "1.0.0", distributedAt: 0, updatedAt: 0 }];
      return { slug: "house-style", name: "House Style", version: "1.0.0", applied: 3, skipped: [] };
    },
  });
  const component = await mount(<ConfigHostStory />);

  await component.getByRole("button", { name: "Plugins" }).click();
  await expect(component.getByRole("heading", { name: "Distribute to everyone" })).toBeVisible();
  await expect(component.getByText("switched off, allowed nothing", { exact: false })).toBeVisible();
  await expect(component.getByText("Nothing is being given out.", { exact: false })).toBeVisible();

  await component.getByLabel(DISTRIBUTE_DROPZONE_LABEL).setInputFiles({
    name: "house-style.zip",
    mimeType: "application/zip",
    buffer: distributableBundle(),
  });
  await expect(component.getByText("Read this room's messages")).toBeVisible();
  await component.getByRole("button", { name: "Distribute to everyone" }).click();

  // SETTLED: the published list repainted from the server's own truth after the invalidate.
  await expect(component.getByText("house-style · 1.0.0")).toBeVisible();
  await expect(component.getByRole("button", { name: "Stop giving it out" })).toBeVisible();
});

test("an admin viewer sees the Admin band and it mounts the REAL group", async ({ mount, page }) => {
  await stub(page, {
    "sessions.me": () => ({ userId: "user_admin", handle: "admin", globalRole: "admin" }),
    "admin.listUsers": () => [],
    "admin.vllmEngines": () => ({}),
  });
  const component = await mount(<ConfigHostStory />);

  await component.getByRole("button", { name: "Admin" }).click();
  await expect(component.getByRole("button", { name: "Users" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Engines" })).toBeVisible();
});

// The deep-link-to-when-gated-group race: a COLD `openConfigTo("admin")` resolves while the non-suspense
// sessions.me probe is still in flight (isAdmin false → 'admin' not yet visible), so the host must re-apply
// the still-unsatisfied target once visibility GROWS — not fall back to the welcome forever.
test("a deep link to a when-gated group lands on it once the viewer probe resolves (not stuck on the fallback)", async ({ mount, page }) => {
  await stub(page, {
    "sessions.me": () => ({ userId: "user_admin", handle: "admin", globalRole: "admin" }),
    "admin.listUsers": () => [],
    "admin.vllmEngines": () => ({}),
  });
  const component = await mount(<ConfigHostStory target="admin" />);

  await expect(component.getByRole("region", { name: "Admin settings" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Users" })).toBeVisible();
  await expect(component.getByRole("region", { name: "Appearance settings" })).toHaveCount(0);
});

// SET-SEAMS §10 Q4 — the SUB-level deep link: `openConfigTo(group, sub)` lands ON the section, not at the
// top of the group. The target names a CONTRIBUTED section (its anchor is minted from the same (group, sub)
// pair), which is the whole point: a feature can link straight to the section it owns without knowing where
// the host put it.
test("a SUB-level deep link lands on the section's anchor (contributed sections included)", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory target="chat-behavior" sub="world-info" />);

  await expect(component.getByRole("region", { name: "Chat behavior settings" })).toBeVisible();
  await expect(component.locator("#config-anchor-chat-behavior-world-info")).toBeInViewport();
  // `exact` because the World Info COLLECTION band ("World Info 0") is a button too since #1099 F5, and the
  // default role-name match is a case-insensitive substring. This assertion is about the section ROW.
  await expect(component.getByRole("button", { name: "World info", exact: true })).toHaveAttribute("aria-current", "true");
});

test("a group-only deep link still lands at the TOP of the group (no phantom jump)", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory target="chat-behavior" />);

  await expect(component.getByRole("region", { name: "Chat behavior settings" })).toBeVisible();
  await expect(component.locator("#config-anchor-chat-behavior-message-handling")).toBeInViewport();
});

// #549 — the LIST has to agree with the pane it is next to (UI-Architecture §4.2: LIST drives CONTENT). A
// band CLICK runs the selection, which suppresses the scroll-spy across the landing; a group DEEP LINK used
// to resolve in render and then stop, so the spy's own initial compute ran against a still-mounting body and
// overwrote the right answer. THIS PIN IS A FENCE, NOT THE DEFECT PROOF: the CT harness's panes settle
// inside one frame, so the transient geometry that produced the live lie never exists here. What it owns is
// the contract both halves of the fix serve: a deep-linked group's FIRST section is current, and nothing
// later takes it back.
test("#549 a group-only deep link marks the group's FIRST section current, and keeps it (fence)", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory target="workloads" />);

  await expect(component.getByRole("region", { name: "Jobs settings" })).toBeVisible();
  const list = component.getByRole("region", { name: LIST_REGION });
  await expect(list.locator('[aria-current="true"]')).toHaveCount(1);
  await expect(component.getByRole("button", { name: "Runs", exact: true })).toHaveAttribute("aria-current", "true");
  await expect(component.getByRole("button", { name: "Analysis tuning" })).not.toHaveAttribute("aria-current", "true");
});

// OWNER DOGFOOD 2026-08-13, "the settings screen scrolls past the end of its results". Base UI form
// primitives put `sr-only` boxes at `position:absolute`; a scroller only clips descendants whose CONTAINING
// BLOCK is inside it. Two pins, because they fail for different reasons: the MECHANISM (nothing escapes the
// CONTENT scroller) and the SYMPTOM (a positioned scrolling host around the pane gains no phantom scroll).
test("no absolutely-positioned box escapes the CONTENT scroller (the containing-block pin)", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory target="appearance" />);
  await component.getByRole("heading", { name: "Message style" }).waitFor();

  expect(await readEscapedAbsolutes(page, '[role="region"][aria-label="Appearance settings"]')).toEqual([]);
  expect(await readEscapedAbsolutes(page, `[role="region"][aria-label="${LIST_REGION}"]`)).toEqual([]);
});

test("a positioned scrolling host around the pane gains NO phantom scroll (the owner's blank space)", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostInScrollingHostStory />);
  await component.getByRole("heading", { name: "Message style" }).waitFor();
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const el = document.querySelector<HTMLElement>('[data-testid="scrolling-host"]');
          return el === null ? null : { clientHeight: el.clientHeight, scrollHeight: el.scrollHeight };
        }),
    )
    .not.toBeNull();
  const host = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-testid="scrolling-host"]');
    return el === null ? null : { clientHeight: el.clientHeight, scrollHeight: el.scrollHeight };
  });
  expect((host?.scrollHeight ?? 0) - (host?.clientHeight ?? 0)).toBeLessThanOrEqual(1);
});

// Scroll-spy (owner ruling): scrolling the pane updates which section row is aria-current, and a short
// trailing section still wins once you scroll to the very bottom.
test("scrolling to the bottom activates the last section (scroll-spy)", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory target="appearance" />);
  await component.getByRole("heading", { name: "Message style" }).waitFor();
  await expect(component.getByRole("button", { name: "Library" })).not.toHaveAttribute("aria-current", "true");

  // The deep-link landing SUPPRESSES the spy until the jump settles (`scrollContentToTop` → `scrollend`, or
  // the 700ms fallback for a jump that never scrolls), so the synthetic scroll is re-issued per poll tick:
  // the armed spy answers the first one it sees, and that is the settled state the assertion reads.
  // An IDENTICAL scrollTop fires no scroll event, so each tick lands one pixel off the previous one and the
  // armed spy sees a fresh event (the last section past the spy line is Library at either position).
  const scrollToBottom = (): Promise<void> =>
    page.evaluate(() => {
      const region = document.querySelector('[data-slot="config-content"]') as HTMLElement | null;
      if (region !== null) {
        const max = region.scrollHeight - region.clientHeight;
        region.scrollTop = region.scrollTop >= max ? max - 1 : max;
      }
    });
  await expect
    .poll(async () => {
      await scrollToBottom();
      return await component.getByRole("button", { name: "Library" }).getAttribute("aria-current");
    })
    .toBe("true");
});

// Click-jump suppresses the spy so the LIST never flickers through intermediate sections during the
// programmatic smooth scroll: a MutationObserver records EVERY row that gains aria-current from the click
// until the scroll settles — only the target should ever appear.
test("a distant section-row click lands on the target, never an intermediate (spy suppressed)", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory target="appearance" />);
  await component.getByRole("heading", { name: "Message style" }).waitFor();

  await page.evaluate(() => {
    // FABRICATION-OK: in-page globalThis scaffolding (a MutationObserver sample, not a domain value).
    const w = globalThis as unknown as { __seen: string[] };
    w.__seen = [];
    const list = document.querySelector('[data-slot="config-list"]');
    if (list === null) {
      return;
    }
    const record = (): void => {
      for (const el of list.querySelectorAll('[aria-current="true"]')) {
        const label = el.textContent?.trim();
        if (label !== undefined && label !== "" && !w.__seen.includes(label)) {
          w.__seen.push(label);
        }
      }
    };
    new MutationObserver(record).observe(list, { attributeFilter: ["aria-current"], attributes: true, subtree: true });
  });

  await component.getByRole("button", { name: "Effects" }).click();
  await expect(component.getByRole("button", { name: "Effects" })).toHaveAttribute("aria-current", "true");

  await page.waitForFunction(() => {
    // FABRICATION-OK: in-page globalThis scaffolding (see the MutationObserver instrumentation above).
    const w = globalThis as unknown as { __top?: number; __stable?: number };
    const region = document.querySelector('[data-slot="config-content"]') as HTMLElement | null;
    if (region === null) {
      return false;
    }
    if (w.__top === region.scrollTop) {
      w.__stable = (w.__stable ?? 0) + 1;
    } else {
      w.__stable = 0;
      w.__top = region.scrollTop;
    }
    return (w.__stable ?? 0) > 4;
  });

  // FABRICATION-OK: in-page globalThis scaffolding (see the MutationObserver instrumentation above).
  await expect.poll(async () => await page.evaluate(() => (globalThis as unknown as { __seen: string[] }).__seen)).toEqual(["Effects"]);
});

// Flash geometry (owner P3): after a jump the flashed SECTION carries the inset-ring highlight, its box hugs
// the section's own content (no grid stretch), and it sits fully within the scroll container's visible width.
test("the jump flash hugs the section box and stays within the scroll container", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory target="appearance" />);
  await component.getByRole("heading", { name: "Message style" }).waitFor();

  await component.getByRole("button", { name: "Avatars", exact: true }).click();

  // The flash is a TRANSIENT ring (rAF-polled + smooth scroll), so every read below is a retrying one over
  // the same in-page measurement, taken while the ring is present.
  const readFlashGeometry = (): Promise<{ hasInsetRing: boolean; hugs: boolean; withinLeft: boolean; withinRight: boolean } | null> =>
    page.evaluate(() => {
      const section = document.querySelector('[id$="-avatars"]') as HTMLElement | null;
      const region = document.querySelector('[data-slot="config-content"]') as HTMLElement | null;
      if (section === null || region === null) {
        return null;
      }
      const sb = section.getBoundingClientRect();
      const rb = region.getBoundingClientRect();
      return {
        // The flash is an INSET ring on the section (never an outset outline clipped at the scroll edge).
        hasInsetRing: getComputedStyle(section).boxShadow.includes("inset"),
        // The box hugs content — its rendered height is its own content height (no grid-stretch dead space).
        hugs: Math.abs(Math.round(sb.height) - section.scrollHeight) <= 2,
        withinLeft: sb.left >= rb.left - 1,
        withinRight: sb.right <= rb.left + region.clientWidth + 1,
      };
    });
  await expect.poll(async () => (await readFlashGeometry())?.hasInsetRing).toBe(true);
  await expect.poll(async () => (await readFlashGeometry())?.hugs).toBe(true);
  await expect.poll(async () => (await readFlashGeometry())?.withinLeft).toBe(true);
  await expect.poll(async () => (await readFlashGeometry())?.withinRight).toBe(true);
});

// SCROLL-SPY, the no-scroll arm: a group that FITS its column is at its top AND its bottom at once. The
// bottom arm used to win and light the LAST section while the reader is looking at the FIRST.
test("a group that fits (no scroll) resolves the FIRST section, never the last", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory target="appearance" height={4000} width={1160} />);
  await component.getByRole("heading", { name: "Message style" }).waitFor();

  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const region = document.querySelector('[data-slot="config-content"]') as HTMLElement | null;
          return region === null ? -1 : region.scrollHeight - region.clientHeight;
        }),
    )
    .toBeLessThanOrEqual(2);

  await expect(component.getByRole("button", { name: "Looks", exact: true })).toHaveAttribute("aria-current", "true");
  await expect(component.getByRole("button", { name: "Effects" })).not.toHaveAttribute("aria-current", "true");
});

// LIST LABEL ≠ HEADING (2026-08-01). "Message details & actions" does not fit the LIST column, so its section
// declares a shorter `navLabel` — the ROW is abbreviated, the section HEADING keeps the real name. The full
// string still rides the row's native `title` tooltip (ListRow's `fullTitle`).
test("a navLabel section shows the SHORT name in the LIST, the FULL one in its heading + tooltip", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory target="appearance" />);
  await component.getByRole("heading", { name: "Message style" }).waitFor();

  const row = component.getByRole("region", { name: LIST_REGION }).locator('[data-slot="list-row-title"]', { hasText: "Message details" });
  await expect(row).toHaveText("Message details");
  await expect(row).toHaveAttribute("title", "Message details & actions");
  await expect(component.getByRole("heading", { name: "Message details & actions" })).toBeVisible();
});

// The SWEEP: no LIST row anywhere clips at the docked column. Every settings-shaped group is visited (owner
// viewer, so Admin's rows are swept too), because a group's rows only render while it is active. Collection
// bands are skipped: their disclosure shows MEMBER rows, not section rows.
test("no section row clips at the LIST column, in ANY group", async ({ mount, page }) => {
  await stub(page, {
    "sessions.me": () => OWNER_VIEWER,
    "admin.listUsers": () => [],
    "admin.vllmEngines": () => ({}),
  });
  const component = await mount(<ConfigHostStory />);
  const list = component.getByRole("region", { name: LIST_REGION });
  await expect(component.getByRole("button", { name: "Admin" })).toBeVisible();

  const bands = list.locator(BAND);
  // The band roster is door-frozen: 13 groups, 9 of them settings-shaped — and since #1099 F5 a ZERO-member
  // collection draws a band too (a selecting button, never a disclosure), so all 13 are here even with every
  // library empty. The sweep still visits the nine settings-shaped ones; collections have no section rows.
  // Read the ids ONCE off it (the Admin band above is the settle barrier), then sweep.
  await expect(bands).toHaveCount(13);
  const groupIds = await bands.evaluateAll((els) => els.map((el) => el.getAttribute("data-config-group") ?? ""));
  let swept = 0;
  for (const groupId of groupIds) {
    if (COLLECTION_GROUPS.has(groupId)) {
      continue;
    }
    await list.locator(`${BAND}[data-config-group="${groupId}"]`).click();
    await expect(list.locator('[aria-current="true"]')).toHaveCount(1);
    // A RETRYING census per group: `scrollWidth > clientWidth` on the title span is the honest truncation
    // test (the row's `text-overflow: ellipsis` leaves the box unchanged, so nothing else says "clipped").
    await expect
      .poll(
        async () =>
          await page.evaluate((): readonly string[] =>
            [...document.querySelectorAll<HTMLElement>('[data-slot="config-list"] [data-slot="list-row-title"]')]
              .filter((el) => el.scrollWidth > el.clientWidth)
              .map((el) => el.textContent ?? ""),
          ),
      )
      .toEqual([]);
    swept += 1;
  }
  expect(swept).toBe(9);
});

// ── AN EMPTY LIBRARY IS STILL A DOOR (#1099 F5) ───────────────────────────────────────────────────────
// The finding: `snap --aria` read `button "Tags 28"` for a populated collection and `text: Regex scripts 0`
// for an empty one — the row was not a control at all, so population decided INTERACTIVITY and a first-run
// reader could neither click nor TAB to the library they came for. Every collection is EMPTY in this file's
// ambient stub, which is exactly the first-run arm. The 2026-08-06 "nothing to disclose" ruling is preserved
// and pinned here too: the band selects, it never discloses.

const EMPTY_BAND = '[data-config-group="regex"] [data-slot="config-band"]';

test("a zero-member collection band is a real control — a button, in the tab order, with its count in its name", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  const band = component.locator(EMPTY_BAND);
  await expect(band).toHaveRole("button");
  // The count rides the NAME with a real separator — never welded, the way its populated twin already is.
  await expect(band).toHaveAccessibleName(/ 0$/);
  // Keyboard-reachable: a plain text row cannot take focus at all.
  await band.focus();
  await expect(band).toBeFocused();
});

test("the zero-member band SELECTS, it does not disclose — the 2026-08-06 ruling survives", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  const band = component.locator(EMPTY_BAND);
  // No panel, no chevron state: there is still nothing to disclose.
  await expect(band).not.toHaveAttribute("aria-expanded", /.*/);
  await band.click();
  // It is the current location instead.
  await expect(band).toHaveAttribute("aria-current", "true");
});

test("clicking it LANDS on the library's own empty surface — the collection's copy and its create verb", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  await component.locator(EMPTY_BAND).click();
  // The pane is no longer the generic welcome: it is this library, saying it is empty, with the one act.
  const content = component.getByRole("region", { name: "Settings", exact: true });
  await expect(content.getByText("No scripts yet.")).toBeVisible();
  await expect(content.getByRole("button", { name: "New script" })).toBeVisible();
  // The landing is the pane's whole content, so it carries the pane's heading.
  await expect(content.getByRole("heading", { level: 2 })).toBeVisible();
});

// ── …AND SO IS A FULL ONE (#925 species contract, 2026-09-02) ─────────────────────────────────────────
// The owner's ruling: collections are a genuinely distinct SPECIES inside config and the bar is that THEY
// MUST WORK — no dead ends, no capability lies. The populated arm was the remaining lie: its band DISCLOSED
// only, so clicking "Regex scripts" opened its rows under a CONTENT pane still showing something else
// entirely — and once the arrival default made a settings group active from the first frame, "something else
// entirely" became the guaranteed case. So the populated band ENTERS the library on the first click and
// TOGGLES its rows once the reader is already inside: the disclosure survives as a capability, and the
// landing is the library's own.

/** One regex fixture row — the shape `regex.listScripts` returns; a fixed edit stamp so the recency-ranked
 *  preview is deterministic. */
const POPULATED_SCRIPTS = [
  {
    id: "regex_script_stripooc",
    name: "strip ooc",
    findRegex: "/^\\s*ooc:.*$/gim",
    placement: ["AI_OUTPUT"],
    replaceString: "",
    enabled: true,
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: false,
    trimStrings: [],
    updatedAt: 1_760_000_000_000,
    substituteRegex: "none",
  },
];
/** The regex group's own blurb, from its `ConfigGroupDefinition` — the landing draws the CONTRIBUTION's copy,
 *  never a host string, which is the claim this literal is here to hold. */
const REGEX_BLURB = "Find/replace that runs on input, output, or both; everywhere, or only where you attach it.";
/** The HOST's one sentence about its own geometry (features/config/lib/config-copy.ts). */
const LANDING_HINT = "Pick one from the list to open its editor.";

test("a POPULATED collection band ENTERS its library in one act — rows open AND its landing takes CONTENT", async ({ mount, page }) => {
  await stub(page, { "regex.listScripts": () => POPULATED_SCRIPTS });
  const component = await mount(<ConfigHostStory />);

  const band = component.locator(EMPTY_BAND);
  await expect(band).toHaveAttribute("aria-expanded", "false");
  await band.click();

  // The disclosure still happens — the rows are what a collection band opens…
  await expect(band).toHaveAttribute("aria-expanded", "true");
  // …AND the reader's location moved with it: the band marks itself, and CONTENT is this library's landing,
  // drawn from the contribution's own fields plus the host's one line about where the members are.
  await expect(band).toHaveAttribute("aria-current", "true");
  const content = component.getByRole("region", { name: "Settings", exact: true });
  await expect(content.getByRole("heading", { level: 2, name: "Regex scripts" })).toBeVisible();
  await expect(content.getByText(REGEX_BLURB)).toBeVisible();
  await expect(content.getByText(LANDING_HINT)).toBeVisible();
  await expect(content.getByRole("button", { name: "New script" })).toBeVisible();
  // The four-library welcome is NOT what a named library's landing shows (the capability lie, deleted).
  await expect(content.locator('[data-slot="config-welcome"]')).toHaveCount(0);
});

// ── SWITCHING LIBRARIES MUST NOT CRASH THE APP (#1203 P0, side-eye repro on folded main) ─────────────
// THE DEFECT: the landing is ONE component instance for EVERY collection, and it calls `useCount?.()` and
// `preview?.useEntries()` — OPTIONAL hooks on per-contribution fields. Tags, regex and world-info declare a
// `preview`; ROSTERS does not. So switching between a preview-declaring library and rosters changed the
// HOOK COUNT on a fiber React was reusing: "Rendered fewer hooks than expected" (or more, the other way),
// thrown past every route boundary to `CatchBoundaryImpl` — rail, list and content all white-screened, with
// reload as the only recovery. Tags→Regex survived on LUCK (equal hook counts), which is why this pin sweeps
// the ROSTERS pair in BOTH directions rather than one happy path.
//
// THE CLAIM IS THE CLASS, not a pair: every collection whose declared hook set differs from its neighbour's
// must be reachable from that neighbour, back and forth, with the app still standing. A page error here is
// the crash itself — asserted directly, because a white-screened shell can still satisfy a naive
// "the old text is gone" assertion.

/** One tag row in the `tag.listTagsWithUsage` shape — the tag preview ranks by usage total. */
function switchTagRow(index: number): Record<string, unknown> {
  return {
    id: `tag_switch_${String(index)}`,
    name: `switch-tag-${String(index)}`,
    color: null,
    color2: null,
    source: null,
    folderType: "NONE",
    sortOrder: index,
    isHiddenOnCard: false,
    usage: { characters: index + 1, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: index + 1 },
  };
}

/** One book in the `worldInfo.listBooksWithUsage` shape — the world-info preview ranks by attachment. */
const SWITCH_BOOK = {
  id: "world_book_switch00001",
  name: "The Ninefold Reach",
  description: null,
  createdAt: 1,
  entryCount: 42,
  usage: { characters: 2, personas: 0, chats: 0, global: true, total: 3 },
};

/** The three bands this sweep walks: two libraries that DECLARE a preview hook, and the one that does not. */
const TAGS_BAND = '[data-config-group="tags"] [data-slot="config-band"]';
const WORLD_INFO_BAND = '[data-config-group="worldInfo"] [data-slot="config-band"]';
const ROSTERS_BAND = '[data-config-group="rosterPreset"] [data-slot="config-band"]';

test("switching between libraries with DIFFERENT declared hook sets keeps the app standing", async ({ mount, page }) => {
  // The page errors the defect throws — collected from the first navigation, so a crash cannot be missed by
  // an assertion that a white screen happens to satisfy.
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await stub(page, {
    "tag.listTagsWithUsage": () => [switchTagRow(0), switchTagRow(1)],
    "worldInfo.listBooksWithUsage": () => [SWITCH_BOOK],
    "worldInfo.getBook": () => ({ id: SWITCH_BOOK.id, name: SWITCH_BOOK.name, description: null, createdAt: 1 }),
    "worldInfo.listEntries": () => [],
    "rosterPreset.list": () => [],
  });
  const component = await mount(<ConfigHostStory />);
  const content = component.getByRole("region", { name: "Settings", exact: true });

  // preview-declaring → NONE (the reported "Rendered fewer hooks than expected").
  await component.locator(TAGS_BAND).click();
  await expect(content.getByRole("heading", { level: 2, name: "Tags" })).toBeVisible();
  await component.locator(ROSTERS_BAND).click();
  await expect(content.getByText("No saved rosters yet.")).toBeVisible();

  // NONE → preview-declaring (the reported "Rendered more hooks than during the previous render").
  await component.locator(TAGS_BAND).click();
  await expect(content.getByRole("heading", { level: 2, name: "Tags" })).toBeVisible();

  // …and the same pair through the OTHER declaring library, both ways — the class, not one route.
  await component.locator(WORLD_INFO_BAND).click();
  await expect(content.getByRole("heading", { level: 2, name: "World Info" })).toBeVisible();
  await component.locator(ROSTERS_BAND).click();
  await expect(content.getByText("No saved rosters yet.")).toBeVisible();
  await component.locator(WORLD_INFO_BAND).click();
  await expect(content.getByRole("heading", { level: 2, name: "World Info" })).toBeVisible();

  // THE SHELL IS STILL THERE. The crash escaped every route boundary and took the LIST with it, so the map
  // surviving is part of the claim — not just the pane the switch was aimed at.
  await expect(component.getByRole("region", { name: LIST_REGION })).toBeVisible();
  expect(pageErrors, `the switch threw: ${pageErrors.join(" · ")}`).toEqual([]);
});

test("…and a second click folds the rows away WITHOUT leaving the library", async ({ mount, page }) => {
  await stub(page, { "regex.listScripts": () => POPULATED_SCRIPTS });
  const component = await mount(<ConfigHostStory />);

  const band = component.locator(EMPTY_BAND);
  await band.click();
  await expect(band).toHaveAttribute("aria-expanded", "true");
  await band.click();

  // The one place this species diverges from a settings group, whose active band cannot collapse itself: a
  // library's rows are its CONTENTS, and folding contents away is a thing a reader does.
  await expect(band).toHaveAttribute("aria-expanded", "false");
  // …and it costs nothing: the location, and therefore the pane, is untouched.
  await expect(band).toHaveAttribute("aria-current", "true");
  await expect(component.getByRole("region", { name: "Settings", exact: true }).getByRole("heading", { level: 2, name: "Regex scripts" })).toBeVisible();
});
