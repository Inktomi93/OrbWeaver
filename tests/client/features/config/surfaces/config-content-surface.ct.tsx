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
import type { Locator, Page } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import { readEscapedAbsolutes } from "../../../../support/browser/settings-geometry.ts";
import { makeResolvedChatCapability } from "../../../../support/factories/resolved-connection.ts";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { ConfigHostInScrollingHostStory, ConfigHostStory } from "../_ct-stories.tsx";

/** The getUserSettings read-model the Appearance group suspends on — defaults are enough to render it. */
// The Looks section (#866 S4) reads the theme library — three seeds, no owned rows.
const LOOKS_THEMES = [
  { id: "theme_00000000000000000000000001", name: "Hearth", override: {}, css: null, isSeed: true, isDefault: true, createdAt: 0, updatedAt: 0 },
  { id: "theme_00000000000000000000000002", name: "Mocha", override: {}, css: null, isSeed: true, isDefault: false, createdAt: 0, updatedAt: 0 },
  { id: "theme_00000000000000000000000003", name: "Light", override: {}, css: null, isSeed: true, isDefault: false, createdAt: 0, updatedAt: 0 },
];
const USER_SETTINGS_VIEW = {
  userId: "user_ct_settings",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS,
  updatedAt: 0,
  // #1716: the server's read verdict on the stored blob. `null` everywhere but the unreadable-state pins at
  // the bottom of this file, which override it with a failure kind.
  configUnreadable: null,
};

/** The Distribute section's own dropzone input, addressed by its ACCESSIBLE NAME — the group hosts TWO
 *  dropzones (install for yourself · distribute to everyone) and the shared `data-slot` selector resolves to
 *  both, so the slot alone is a strict-mode violation. The name is also what tells the two apart on screen. */
const DISTRIBUTE_DROPZONE_LABEL = "Choose a plugin bundle to distribute";

/** The LIST landmark — the shelves + bands + rows, named by the host. */
const LIST_REGION = "Settings groups";
/** The group bands — the disclosure buttons, one per group, stamped by the LIST. */
const BAND = '[data-slot="config-band"]';
/** The CONTENT scroller. Addressed by SLOT because its region NAME is the active group's ("Appearance
 *  settings"), so a name-scoped locator changes with the arm under test. */
const CONTENT_PANE = '[data-slot="config-content"]';
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

/**
 * THE SETTLED LANDING — the barrier every deep-link test in this file owes BEFORE it clicks or measures
 * (#1586, the #1575 template).
 *
 * A `<ConfigHostStory target=…>` mount does not finish when its content paints: `openConfigTo` runs a
 * programmatic jump, and `config-jump.ts`'s `beginProgrammaticScroll` holds the scroll-spy suppressed until
 * either a `scrollend` that follows a real scroll or a 700ms fallback that is REFRESHED by every scroll
 * event. A test that acts inside that window has a landing timer still armed behind it: the spy re-arms
 * mid-motion, marks whatever section is under the line, and the assertion sees an `aria-current` row nobody
 * clicked. Waiting on a heading is a MOUNT barrier, not a settled one — which is why the family passed
 * alone and failed under contention, where the window is wide enough to catch.
 *
 * So this waits for the three things that actually have to be true, and measures the last one the way the
 * production code decides it: no scroll event on the container for longer than that fallback.
 */
async function settledOnLanding(page: Page, component: Locator, firstSection: string): Promise<void> {
  // 1. FONTS. The section boxes move when the real face swaps in, and which section crosses the spy line is
  //    a function of those boxes.
  await page.evaluate(async (): Promise<boolean> => {
    await document.fonts.ready;
    return true;
  });
  // 2. THE LANDING'S OWN MARK. Until this row is current, any `aria-current` in the list is a leftover.
  await expect(component.getByRole("button", { name: firstSection, exact: true })).toHaveAttribute("aria-current", "true");
  // 3. THE SPY IS RE-ARMED — the container has gone quiet for longer than the suppression fallback, so no
  //    timer from the landing can still fire behind whatever the test does next.
  //
  //    Counted in ANIMATION FRAMES rather than milliseconds, and not for style: an ambient clock in a test
  //    is a `test-determinism` violation (Spine-Testing §3), and frames are also the SAFER unit here. The
  //    fallback is a 700ms wall-clock timer refreshed by every scroll event; 60 consecutive scroll-free
  //    frames is ~1s on the 60Hz compositor and only ever LONGER under contention, which is the direction
  //    that keeps the barrier honest.
  await page.evaluate(() => {
    // FABRICATION-OK: in-page globalThis scaffolding (a scroll-event tally, not a domain value).
    const w = globalThis as unknown as { __scrolls: number; __quiet: number; __seenScrolls: number };
    w.__scrolls = 0;
    w.__quiet = 0;
    w.__seenScrolls = -1;
    document.querySelector('[data-slot="config-content"]')?.addEventListener(
      "scroll",
      () => {
        w.__scrolls += 1;
      },
      { passive: true },
    );
  });
  await page.waitForFunction(
    () => {
      // FABRICATION-OK: in-page globalThis scaffolding (see the scroll tally installed above).
      const w = globalThis as unknown as { __scrolls: number; __quiet: number; __seenScrolls: number };
      if (w.__scrolls === w.__seenScrolls) {
        w.__quiet += 1;
      } else {
        w.__quiet = 0;
        w.__seenScrolls = w.__scrolls;
      }
      return w.__quiet >= 60;
    },
    undefined,
    { polling: "raf" },
  );
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
  // EXACT names (#1214-3): an expanded band's rows are now a named group too, so a substring "App" also
  // matches the "Appearance" row group — which is the new anatomy working, not a defect.
  await expect(list.getByRole("group", { exact: true, name: "User" })).toBeVisible();
  await expect(list.getByRole("group", { exact: true, name: "App" })).toBeVisible();
  await expect(list.getByRole("group", { exact: true, name: "Collections" })).toBeVisible();
  await expect(list.getByRole("group", { exact: true, name: "Extensions" })).toBeVisible();
  // The bands live INSIDE their shelf, which is the whole point — a group nobody is in is decoration.
  await expect(list.getByRole("group", { exact: true, name: "User" }).getByRole("button", { name: "Appearance" })).toBeVisible();
  await expect(list.getByRole("group", { exact: true, name: "App" }).getByRole("button", { name: "Connections" })).toBeVisible();
  await expect(list.getByRole("group", { exact: true, name: "Extensions" }).getByRole("button", { name: "Plugins" })).toBeVisible();
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
  // The deep link's own jump must be OVER before this test clicks a band, or the landing's spy re-arm fires
  // behind the switch and marks an Appearance row current after Connections took over (#1586).
  await settledOnLanding(page, component, "Looks");

  // `exact` on EVERY Avatars locator (#1586). The Avatars SECTION carries an S3 teach row whose hint trigger
  // is named "More info about Show avatars in chat", which a loose name also matches — so the loose locator
  // is a strict-mode violation the moment that section's body has painted. It passed only by measuring
  // BEFORE the content settled, which is the whole shape this barrier removes; the sibling test at
  // "clicking a section row" already spelled `exact` for exactly this reason.
  await expect(component.getByRole("button", { name: "Avatars", exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Reading typography", exact: true })).toBeVisible();
  // Connections was never opened → none of its rows are painted.
  await expect(component.getByRole("button", { name: "Model roles", exact: true })).toHaveCount(0);
  await component.getByRole("button", { name: "Connections", exact: true }).click();
  await expect(component.getByRole("button", { name: "Model roles", exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Connections", exact: true })).toHaveAttribute("aria-expanded", "true");
  // …and Appearance, opened by the deep link, is REMEMBERED open beside it (C-12), no longer active.
  await expect(component.getByRole("button", { name: "Avatars", exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Appearance", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(component.getByRole("button", { name: "Avatars", exact: true })).not.toHaveAttribute("aria-current", "true");
});

test("clicking a section row marks it aria-current", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory target="appearance" />);
  await settledOnLanding(page, component, "Looks");

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
  await settledOnLanding(page, component, "Looks");

  expect(await readEscapedAbsolutes(page, '[role="region"][aria-label="Appearance settings"]')).toEqual([]);
  expect(await readEscapedAbsolutes(page, `[role="region"][aria-label="${LIST_REGION}"]`)).toEqual([]);
});

test("a positioned scrolling host around the pane gains NO phantom scroll (the owner's blank space)", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostInScrollingHostStory />);
  // NO `settledOnLanding` here, deliberately: this story mounts the CONTENT surface alone (no LIST), so
  // there is no section row to settle on — and the assertion is about the OUTER host's scroll extent, which
  // the landing jump cannot move.
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
  await settledOnLanding(page, component, "Looks");
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
  await settledOnLanding(page, component, "Looks");

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
  await settledOnLanding(page, component, "Looks");

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
  await settledOnLanding(page, component, "Looks");

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
  await settledOnLanding(page, component, "Looks");

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
// THE HOST'S ONE SENTENCE IS GONE (#1725). `LANDING_HINT` held "Pick one from the list to open its editor."
// — the host's fact about where a library's members live, which every landing arm above asserted. The owner
// moved the members onto this very pane, so the sentence became a direction to the pane the reader is
// standing in and was deleted with its reader (`config-copy.ts`). Every arm that used it now asserts the
// CONTROL ROW instead, which is the honest tell for "this pane is a library": a sentence can be true of a
// pane that offers nothing, a control row cannot.

// #1725 RETIRED THE DISCLOSE HALF OF #925's ENTER. The ruling was "select and disclose in ONE act" and this
// test held both halves; the owner then moved the members into CONTENT, so there is nothing in the LIST to
// disclose and `aria-expanded` is gone from the band. The ENTER half — one click, the location moves, CONTENT
// is this library — is what the ruling was protecting, and it is asserted whole below, now including the rows
// themselves, which are the thing that actually arrived.
test("#1725: a collection band ENTERS its library in one act — the location moves AND CONTENT is the library", async ({ mount, page }) => {
  await stub(page, { "regex.listScripts": () => POPULATED_SCRIPTS });
  const component = await mount(<ConfigHostStory />);

  const band = component.locator(EMPTY_BAND);
  // Nothing to unfold, so nothing claims to: the attribute is absent, not `false`.
  await expect(band).not.toHaveAttribute("aria-expanded", /.*/);
  await band.click();

  await expect(band).toHaveAttribute("aria-current", "true");
  const content = component.getByRole("region", { name: "Settings", exact: true });
  await expect(content.getByRole("heading", { level: 2, name: "Regex scripts" })).toBeVisible();
  await expect(content.getByText(REGEX_BLURB)).toBeVisible();
  // The MEMBERS are here now — the whole point of the ruling — and so is the library's own create verb.
  await expect(content.locator('[data-slot="list-row-root"]').first()).toBeVisible();
  await expect(content.getByRole("button", { name: "New script" })).toBeVisible();
  // The four-library launcher landing is NOT what a named library's landing shows — and since #1210 it is
  // not what ANYTHING shows.
  await expect(content.locator('[data-slot="config-welcome"]')).toHaveCount(0);
});

// ── SWITCHING LIBRARIES MUST NOT CRASH THE APP (#1203 P0, side-eye repro on folded main) ─────────────
// THE DEFECT: the landing is ONE component instance for EVERY collection, and it calls `useCount?.()` and
// its per-library optional hook (measured on `preview.useEntries`, which #1209 replaced with
// `insights.useInsights` — the same shape and the same hazard). Tags, regex and world-info declared it;
// ROSTERS did not. So switching between a declaring library and rosters changed the
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

// ── RETIRED BY #1725 (owner ruling 2026-09-05) ───────────────────────────────────────────────────────
// "…and a second click folds the rows away WITHOUT leaving the library" lived here. It pinned the ONE place
// the collection species diverged from a settings group: an active collection band could collapse its own
// rows, because a library's rows are its CONTENTS and folding contents away is a thing a reader does. That
// divergence had a referent only while the rows were in the LIST. The owner moved them into CONTENT, so
// there is no fold, no `aria-expanded`, and no second click whose meaning differs from the first — a
// collection band is the same one-act door at every press. Nothing is weakened elsewhere: the band's
// idempotent ENTER is the test above, and "the LIST holds no member rows" is pinned red-first in
// `components/config-list-collection-group.ct.tsx`. Deleted with the behaviour it described.

// ── THE LANDING STATES THE LIBRARY, IT DOES NOT RESTATE THE LIST (#1209, owner ruling 2026-09-02) ────
// THE DEFECT, measured live: with Tags active, CONTENT's only interactive element was "New tag" — twelve
// inert chips restated the twelve rows the LIST was already showing in the same order, and "+16 more" named
// sixteen members reachable from nowhere on that pane. The ruling: the landing says what the LIST
// structurally cannot (scopes, what is used nowhere, what changed), and every affordance on it is a REAL
// door. The negative half is the acceptance bar and is asserted as such: zero affordance-shaped text.

/** The tag fixture the fact arms need: two tags used on something, one used NOWHERE — the state the tag
 *  library's own fact is about, and the one a 400-row list sorted by use puts at the far end of the scroll. */
const INSIGHT_TAGS = [
  {
    id: "tag_used_a",
    name: "used-a",
    color: null,
    color2: null,
    source: null,
    folderType: "NONE",
    sortOrder: 0,
    isHiddenOnCard: false,
    usage: { characters: 2, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 2 },
  },
  {
    id: "tag_used_b",
    name: "used-b",
    color: null,
    color2: null,
    source: null,
    folderType: "NONE",
    sortOrder: 1,
    isHiddenOnCard: false,
    usage: { characters: 1, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 1 },
  },
  {
    id: "tag_orphan",
    name: "orphan-tag",
    color: null,
    color2: null,
    source: null,
    folderType: "NONE",
    sortOrder: 2,
    isHiddenOnCard: false,
    usage: { characters: 0, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 0 },
  },
];

test("a populated library's landing states its own FACTS — and every affordance on it is a real door", async ({ mount, page }) => {
  await stub(page, { "tag.listTagsWithUsage": () => INSIGHT_TAGS, "tag.getTag": () => INSIGHT_TAGS[2] });
  const component = await mount(<ConfigHostStory />);

  await component.locator(TAGS_BAND).click();
  const content = component.getByRole("region", { name: "Settings", exact: true });
  const facts = content.locator('[data-slot="config-library-insights"]');

  // THE FACT the list cannot state: how much of the library is doing nothing. Contribution's words, its own
  // value — the host units nothing.
  await expect(facts.getByText("Labelling nothing")).toBeVisible();
  await expect(facts.getByText("1 of 3")).toBeVisible();
  await expect(facts.getByText("In use")).toBeVisible();

  // EVERY CONTROL IN THE FACTS BLOCK IS A REAL DOOR — the claim #1209 minted, at the scope it was always
  // about. It used to be spelled as the whole pane's button count (two: the fact's door and the create
  // verb), which #1725 retired as a SPELLING: the pane now also holds the control row and the library's own
  // rows, all of them real doors, so a pane-wide count would be counting the wrong thing and would drift on
  // every control the library gains. The insights slot is the surface the ruling is about, and inside it the
  // count is EXACT: one fact has a subject and opens it, the other is data and is not dressed as an
  // affordance.
  await expect(facts.getByRole("button")).toHaveCount(1);
  await facts.getByRole("button", { name: "Open orphan-tag" }).click();
  await expect(component.getByRole("heading", { name: "orphan-tag" })).toBeVisible();
});

test("…and the wall it replaced is gone: no chip census, no dead +N more", async ({ mount, page }) => {
  await stub(page, { "tag.listTagsWithUsage": () => INSIGHT_TAGS });
  const component = await mount(<ConfigHostStory />);

  await component.locator(TAGS_BAND).click();
  const content = component.getByRole("region", { name: "Settings", exact: true });
  await expect(content.getByRole("heading", { level: 2, name: "Tags" })).toBeVisible();
  // The two tells of the retired anatomy, asserted as absences INSIDE THE FACTS BLOCK — the surface the
  // wall occupied. The pane-wide scope stopped discriminating at #1725: the tag library's own SORT control
  // is legitimately labelled "Most used", so a pane-wide absence would now be red for a reason that has
  // nothing to do with the chip wall. The facts block is where a ranked kicker would return.
  const facts = content.locator('[data-slot="config-library-insights"]');
  await expect(facts.getByText("Most used")).toHaveCount(0);
  await expect(content.getByText(/^\+\d+ more$/)).toHaveCount(0);
  // …and no member NAME is restated OUTSIDE a row or a real door's own label. The negative used to be
  // absolute ("`used-a` appears nowhere on this pane") because the pane had no rows and any member name on
  // it was necessarily a chip. #1725 put the rows here, so an absolute negative would now forbid the library
  // itself. The ruling's substance is the DOUBLE rendering it forbade, so the claim is re-expressed as
  // exactly that: the name appears in its ROW, and nowhere else on the pane.
  await expect(content.locator('[data-slot="list-row-root"]').filter({ hasText: "used-a" })).toHaveCount(1);
  await expect(content.locator('[data-slot="config-library-insights"]').getByText("used-a", { exact: true })).toHaveCount(0);
  await expect(content.locator('[data-slot="collection-control-row"]').getByText("used-a", { exact: true })).toHaveCount(0);
});

// ── A LIBRARY WHOSE CENSUS FAILED IS NOT A LIBRARY THAT IS SETTLING (#1546) ──────────────────────────
// `useCount` answered `number | undefined`, so a failed census and a settling one were the SAME value and
// this pane had no arm for the first: it fell through to the populated layout — glance, hint and create
// verb over a library it could not count — with the failure unsaid and nothing to press. The settling
// ruling survives; what changed is its input.
test("a library whose census FAILED says so on the landing, and offers a retry that re-asks (#1546)", async ({ mount, page }) => {
  // The census answers by a FLAG the test flips, never by a request counter: the pane's own reads share one
  // key and the shell fires more than one round trip before the first paint, so "fail the first request"
  // is not the same claim as "the census is down" (measured — it answered the landing from request two).
  // WHAT THE STUB ANSWERS NEXT, as a PUSHED array rather than a boolean flip: biome narrows a
  // `= false` initializer to the literal type and reds the later flip as an always-falsy condition,
  // and the `: boolean` that would fix that is itself `noInferrableTypes`. Data, not a flag.
  const rows: unknown[] = [trpcError({ message: "the census is down" })];
  await stub(page, { "regex.listScripts": (): unknown => rows.at(-1) });
  const component = await mount(<ConfigHostStory />);

  await component.locator(EMPTY_BAND).click();
  const landing = component.getByRole("region", { name: "Settings", exact: true }).locator('[data-slot="config-collection-landing"]');
  // The library still NAMES itself — the reader came here on purpose.
  await expect(landing.getByRole("heading", { level: 2, name: "Regex scripts" })).toBeVisible();
  await expect(landing.getByText("Couldn't load regex scripts.")).toBeVisible();
  // …and the populated layout is NOT what a pane with no number draws. The tell used to be the host's hint
  // sentence, which #1725 deleted with its reader; the CONTROL ROW is the tell now, and it is a better one —
  // it is the thing a reader would try to press over a library that does not exist.
  await expect(landing.locator('[data-slot="collection-control-row"]')).toHaveCount(0);
  await expect(landing.getByRole("button", { name: "New script" })).toHaveCount(0);

  rows.push(POPULATED_SCRIPTS);
  await landing.getByRole("button", { name: "Retry" }).click();
  // A real refetch, and the pane returns to the arm the answer earns — control row, and the members it
  // controls.
  await expect(landing.locator('[data-slot="collection-control-row"]')).toBeVisible();
  await expect(landing.locator('[data-slot="list-row-root"]').first()).toBeVisible();
  await expect(landing.getByText("Couldn't load regex scripts.")).toHaveCount(0);
});

// ── THE EMPTY LANDING TEACHES (#1213) ────────────────────────────────────────────────────────────────
// The zero arm passed `emptyText` alone, so the reader with NOTHING — the first-timer the empty state exists
// for — was the only one the surface declined to tell what the library is FOR, while every other surface
// showing that library carried its blurb.
test("the empty landing shows the library's blurb AND its empty sentence AND its create verb", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  await component.locator(EMPTY_BAND).click();
  const content = component.getByRole("region", { name: "Settings", exact: true });
  await expect(content.getByText(REGEX_BLURB), "the blurb the settling arm and the LIST both show").toBeVisible();
  await expect(content.getByText("No scripts yet.")).toBeVisible();
  await expect(content.getByRole("button", { name: "New script" })).toBeVisible();
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// #1716/#1771 — THE UNREADABLE SETTINGS BLOB. When `user_settings.config` cannot be read, `getUserSettings`
// serves schema DEFAULTS and every section's save is refused server-side (`stored_config_unreadable`, the
// #471 guard). Before these pins the pane rendered those defaults as if they were the user's settings, the
// aggregate footer said "Saved" over them, and the only feedback was a generic failure AFTER typing —
// with a Retry that could never succeed.
//
// The state is stated ONCE by the gate that wraps the section-body arm, and its door is the only settings
// repair that exists (`settings.resetUserConfig` — the per-leaf "Reset to its default" writes through the
// refused verb, and would not even be rendered here because `modified` compares the DEGRADED read against
// the defaults and finds every row equal).
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/** The unreadable-blob read: same defaults on the wire, plus the server's verdict. */
function unreadableSettings(failure: "schema-rejected" | "version-from-future"): Record<string, unknown> {
  return { ...USER_SETTINGS_VIEW, configUnreadable: failure };
}

/** The Avatars section's first switch — a real settings leaf whose toggle normally autosaves. */
const AVATARS_SWITCH = "Show avatars in chat";

test("UNREADABLE SETTINGS — the pane says so once, the footer stops saying Saved, and no section can save", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...HOST_AMBIENT_ROUTES,
    "settings.getUserSettings": () => unreadableSettings("schema-rejected"),
    "settings.listThemes": () => LOOKS_THEMES,
  });
  const component = await mount(<ConfigHostStory target="appearance" />);
  await settledOnLanding(page, component, "Looks");

  // STATED ONCE, not per section — the condition belongs to the blob, and N banners is the smear the
  // save-status seam exists to prevent.
  const notice = component.locator('[data-slot="stored-config-unreadable"]');
  await expect(notice).toHaveCount(1);
  await expect(notice).toContainText("Your settings couldn't be read");

  // The aggregate footer no longer claims success over a pane that cannot save.
  await expect(component.locator('[data-slot="config-save-footer"]')).toContainText("your settings couldn't be read");

  // THE WRITE IS DISARMED, not merely labelled: toggle a real leaf, wait past the whole debounce, and
  // nothing reaches the wire.
  const avatars = component.getByRole("switch", { name: AVATARS_SWITCH, exact: true });
  await expect(avatars).toBeVisible();
  const before = await avatars.getAttribute("aria-checked");
  await avatars.click();
  // BARRIER on the RENDERED settled edit — the switch's own state is the committed form value, and it is
  // the instant the debounce would have armed from.
  await expect(avatars).not.toHaveAttribute("aria-checked", before ?? "");
  // The negative-assertion WINDOW — a real-timer sleep evaluated in the page (`page.waitForTimeout` is
  // biome-banned, `noPlaywrightWaitForTimeout`; this is the house idiom the prose-cap pin above uses).
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 1200)));
  // Polling can only wait for a call that must never come; the barrier is the rendered settled edit above
  // plus the full debounce window, so the read IS settled at this line.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): a NEGATIVE recorder read, taken after the rendered settled edit and the whole debounce window.
  expect(trpc.count("settings.updateUserSettingsSection")).toBe(0);
});

test("UNREADABLE SETTINGS — the reset door is the ONE repair, and it is confirmed before it fires", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...HOST_AMBIENT_ROUTES,
    "settings.getUserSettings": () => unreadableSettings("schema-rejected"),
    "settings.listThemes": () => LOOKS_THEMES,
    "settings.resetUserConfig": () => USER_SETTINGS_VIEW,
  });
  const component = await mount(<ConfigHostStory target="appearance" />);
  await settledOnLanding(page, component, "Looks");

  await component.getByRole("button", { name: "Reset my settings to the defaults" }).click();
  // The confirm is a PAGE-level dialog (a portal), and it names what is destroyed before anything fires.
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Reset all your settings?");
  // The confirm dialog's own rendered text is the barrier immediately above; this asserts the mutation has
  // NOT fired yet, and a call that must not exist cannot be polled for.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): a NEGATIVE recorder read, taken after the confirm dialog's rendered text settled.
  expect(trpc.count("settings.resetUserConfig")).toBe(0);
  await confirm.getByRole("button", { name: "Reset settings" }).click();
  await expect.poll(() => trpc.count("settings.resetUserConfig")).toBe(1);
});

test("UNREADABLE SETTINGS — a NEWER-version blob does not lead with reset, and its door says so", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...HOST_AMBIENT_ROUTES,
    "settings.getUserSettings": () => unreadableSettings("version-from-future"),
    "settings.listThemes": () => LOOKS_THEMES,
  });
  const component = await mount(<ConfigHostStory target="appearance" />);
  await settledOnLanding(page, component, "Looks");

  const notice = component.locator('[data-slot="stored-config-unreadable"]');
  await expect(notice).toContainText("saved by a newer version of Orbweaver");
  // The load-bearing difference: this blob is INTACT data an older build cannot represent, so the door is
  // an explicit last resort rather than the fix, and the primary-repair wording must be absent.
  await expect(component.getByRole("button", { name: "Reset my settings anyway" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Reset my settings to the defaults" })).toHaveCount(0);
});

test("READABLE SETTINGS — an intact blob is byte-identical to before: no state, and saving still works", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...HOST_AMBIENT_ROUTES,
    "settings.getUserSettings": () => USER_SETTINGS_VIEW,
    "settings.listThemes": () => LOOKS_THEMES,
    "settings.updateUserSettingsSection": () => USER_SETTINGS_VIEW,
  });
  const component = await mount(<ConfigHostStory target="appearance" />);
  await settledOnLanding(page, component, "Looks");

  // THE CONTROL for the three pins above — without it they prove only that SOMETHING renders a band.
  await expect(component.locator('[data-slot="stored-config-unreadable"]')).toHaveCount(0);
  const avatars = component.getByRole("switch", { name: AVATARS_SWITCH, exact: true });
  const before = await avatars.getAttribute("aria-checked");
  await avatars.click();
  await expect(avatars).not.toHaveAttribute("aria-checked", before ?? "");
  await expect.poll(() => trpc.count("settings.updateUserSettingsSection")).toBeGreaterThan(0);
});

// ── #1216 class (#1632 item 3): the advanced FOLD's label is INTERACTIVE COPY ────────────────────────
// The pane's `advancedFold` renders its label inside a `CollapsibleTrigger` — structurally the same door
// #1216 measured on "Add background" and moved off `voice="kicker"` (`--text-micro`, 0.65625rem ≈ 10.5px,
// the FOOTNOTE step) onto `interactiveKicker`, the voice minted for a kicker that is a control's own
// visible label. The floor asserted is the 11px functional minimum for interactive copy, read off the
// RESOLVED computed style rather than a hardcoded 13 — so the pin reds on the defect and survives a retune
// of the step. Appearance is the only group declaring a fold today (`settings/lib/appearance-group.tsx`).
test("#1216: the advanced fold's trigger label clears the 11px interactive floor", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory target="appearance" />);
  await settledOnLanding(page, component, "Looks");

  // SCOPED TO THE BUTTON, and that is the whole point of the fix: the LIST pane renders the SAME fold
  // label as a `role="group"` NAME (`config-list-group.tsx`), which is non-interactive copy and correctly
  // keeps `voice="kicker"`. An unscoped `getByText` is a strict-mode violation over the two, and the one it
  // would have measured is the one this pin is not about.
  const foldTrigger = component.locator("button").filter({ hasText: "Customize this look" });
  await expect(foldTrigger).toHaveAttribute("aria-expanded", /true|false/);
  const foldLabel = foldTrigger.getByText("Customize this look", { exact: true });
  await expect(foldLabel).toBeVisible();
  await expect
    .poll(async (): Promise<number> => await foldLabel.evaluate((el: Element): number => Number.parseFloat(getComputedStyle(el).fontSize)))
    .toBeGreaterThanOrEqual(11);
});

// ── #1839 · ONE PANE-TITLE REGISTER ACROSS BOTH PANE KINDS ──────────────────────────────────────────
// F24, re-derived 2026-09-06: the collection library pane opened on a real 20px/600 subject step while a
// settings pane opened on NOTHING — its tallest ink was a 16px incidental inside the first section — so
// which register the CONTENT column opened at depended on which door the reader came through. The review's
// verdict is that the INCONSISTENCY, not the flatness, is the defect. `ConfigPaneGlance` draws both pane
// kinds now, so the register is one by construction; this pins that it stays one, at both pane widths, and
// that it is a genuine SUBJECT step rather than the incidental the settings pane used to top out at.
/** The heading's type register — resolved, never a class string. */
async function headingRegister(node: Locator): Promise<{ readonly size: number; readonly weight: string }> {
  return await node.evaluate((el: Element) => {
    const style = getComputedStyle(el);
    return { size: Number.parseFloat(style.fontSize), weight: style.fontWeight };
  });
}

/** The step a settings pane used to top out at — the number the subject step must clear (side-eye F24). */
const OLD_SETTINGS_PANE_MAX_PX = 16;

for (const width of [1440, 990] as const) {
  test(`#1839: a settings pane and a collection library open at the SAME title register at ${String(width)}px`, async ({ mount, page }) => {
    // POPULATED, deliberately: at zero the landing is an `EmptyState`, whose own title is a different
    // element on a different rule — the pane-title register this pins is the one a library with members
    // opens on, which is the state the review measured.
    await stub(page, { "tag.listTagsWithUsage": () => [switchTagRow(0), switchTagRow(1)] });
    const component = await mount(<ConfigHostStory width={width} />);
    // BY SLOT, NOT BY REGION NAME: the CONTENT region is named for whatever is OPEN in it ("Appearance
    // settings" · "Tags settings"), so a name-scoped locator would have to change with the arm under test.
    const content = component.locator(CONTENT_PANE);

    // The arrival default is Appearance, a SETTINGS group: its pane opens on its own name.
    const settingsTitle = content.getByRole("heading", { level: 2, name: "Appearance" });
    await expect(settingsTitle).toBeVisible();
    const settings = await headingRegister(settingsTitle);

    // …and a COLLECTION library, reached the way a reader reaches it, opens at the same step.
    await component.locator(TAGS_BAND).click();
    const libraryTitle = content.getByRole("heading", { level: 2, name: "Tags" });
    await expect(libraryTitle).toBeVisible();
    const library = await headingRegister(libraryTitle);

    expect(settings, `settings ${JSON.stringify(settings)} vs library ${JSON.stringify(library)}`).toEqual(library);
    expect(settings.size, "a pane title is a SUBJECT step, not the 16px incidental the settings pane used to max out at").toBeGreaterThan(
      OLD_SETTINGS_PANE_MAX_PX,
    );
  });
}

// …AND THE THIRD PANE STATE IS THE ZERO ARM, WHICH IS A RECORDED-RULING FORK, NOT A DRIFT.
//
// "One register" is a claim about THREE renderings, not two: a library with no members draws no glance at
// all — it draws an `EmptyState` whose own `titleAs="h2"` IS the pane's heading (the primitive's
// headingless-`main` note, `config-collection-landing.tsx`'s zero arm) — and that heading measures the
// DISPLAY step while both other panes measure the headline one. Caught by this file: the first draft of
// the pin above stubbed the library at zero and read 24px against the settings pane's 20.
//
// IT IS DELIBERATE, AND THE DELIBERATION IS OLDER THAN #1839. `globals.css`'s
// `[data-slot="empty-state-title"][data-title-step="focal"]` is an UNLAYERED rule that holds
// `var(--text-display)` at every width, and its own header states why (side-eye 2026-08-21 P4): "`focal` is
// the surface's one focal statement, and a statement that shrinks with its column is not one." Today's
// F24 says the opposite thing about this surface: the CONFIG pane's title register must be ONE value, and
// a first-timer opening an empty library is precisely the reader the inconsistency lands on.
//
// NEITHER TEXT IS SILENTLY REVERSED HERE. The divergence is PINNED WITH ITS CAUSE — measured against the
// resolved tokens rather than against 24 and 20 — so the number is visible in the tree instead of absent,
// and this arm reds the moment either ruling's mechanism moves. The reconciliation (does the zero arm
// stop being the pane's heading, or does the config surface accept a display-step empty landing?) is the
// orchestrator's; it is a copy decision as much as a type one, because a glance above the EmptyState would
// print the library's name twice.
test("#1839 FORK: the zero-member library keeps the EmptyState focal step, and it is the one pane that differs", async ({ mount, page }) => {
  await stub(page, { "tag.listTagsWithUsage": () => [] });
  const component = await mount(<ConfigHostStory width={1440} />);
  const content = component.locator(CONTENT_PANE);

  const settingsTitle = content.getByRole("heading", { level: 2, name: "Appearance" });
  await expect(settingsTitle).toBeVisible();
  const settings = await headingRegister(settingsTitle);

  await component.locator(TAGS_BAND).click();
  const zeroTitle = content.getByRole("heading", { level: 2, name: "Tags" });
  await expect(zeroTitle).toBeVisible();
  const zero = await headingRegister(zeroTitle);

  // Both sides read as RESOLVED TOKENS, never as 20 and 24: the claim is which STEP each pane takes, and a
  // literal would go stale the moment the ramp is retuned — which is exactly the kind of change this arm
  // exists to make visible.
  const steps = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const px = (name: string): number => {
      const probe = document.createElement("div");
      probe.style.fontSize = style.getPropertyValue(name).trim();
      document.body.append(probe);
      const size = Number.parseFloat(getComputedStyle(probe).fontSize);
      probe.remove();
      return size;
    };
    return { display: px("--text-display"), headline: px("--text-headline") };
  });
  expect(settings.size, "a config pane's title is the HEADLINE step (voice=focal)").toBe(steps.headline);
  expect(zero.size, "the zero arm rides the unlayered EmptyState focal rule — the DISPLAY step, at every width").toBe(steps.display);
  expect(steps.display, "the fork only exists while the two steps differ").toBeGreaterThan(steps.headline);
});
