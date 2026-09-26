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
import { findSettingsColumnViolation, readSettingsPaneGeometry } from "../../../../support/browser/settings-geometry.ts";
import type { TrpcRecorder, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ConfigHostStory } from "../../config/_ct-stories.tsx";
import { AdminGroupStory } from "../_ct-stories.tsx";
import type { EffectiveAppSettings } from "../app-settings-fixtures.ts";
import { appSettingsView, EFFECTIVE_APP_SETTINGS } from "../app-settings-fixtures.ts";

const OWNER_VIEWER = { userId: "user_owner", handle: "root", globalRole: "owner" } satisfies TrpcWireOutput<"sessions.me">;
const PLAIN_VIEWER = { userId: "user_kes", handle: "kes", globalRole: "user" } satisfies TrpcWireOutput<"sessions.me">;

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
] satisfies TrpcWireOutput<"admin.listUsers">;

/** The sections at the `admin` anchor, in the door's declared order (`compose/config-sections.ts`) — which IS
 *  the render order: the ones that merged in from the retired SYSTEM pane (SET-SEAMS stage 4 / §10 Q2), then
 *  the ones that moved out of the retired admin pane surface, then the AppSettings admin-tier sections, then
 *  About last (owner ask 2026-09-18).
 *
 *  RE-DERIVED at the `@orb/inference` cut-over (2026-09-20) from the door array + each section's `nav.id`
 *  (`configAnchorId(anchor, nav.id)`), never by arithmetic off the old list. Three anchors LEFT with the
 *  in-server vLLM fleet — `compute`, `shared-access`, `engines` — and three arrived since — `approvals`,
 *  `link-sso`, `about`. The COUNT is the point of the pin below: it is `ANCHOR_ORDER.length`, derived here
 *  and nowhere spelled as a number. */
const ANCHOR_ORDER = [
  "config-anchor-admin-media-trust",
  "config-anchor-admin-multi-user",
  "config-anchor-admin-operations",
  "config-anchor-admin-users",
  "config-anchor-admin-approvals",
  "config-anchor-admin-link-sso",
  "config-anchor-admin-model-catalog",
  "config-anchor-admin-card-embeddings",
  "config-anchor-admin-memory-tuning",
  "config-anchor-admin-rate-limits",
  "config-anchor-admin-system-tuning",
  "config-anchor-admin-structured-output",
  "config-anchor-admin-about",
];

/** The nav rows the pane DERIVES from its contributions, in door order — one per `ANCHOR_ORDER` entry, read
 *  off each subcategory's `navLabel` where it has one and its `label` otherwise. About is the only row in
 *  this pane that differs between the two ("About" in the rail, "About this install" as the heading), which
 *  is exactly why the list is read per-row rather than assumed to be the headings. */
const NAV_LABELS = [
  "Media & trust",
  "Multi-user",
  "Operations",
  "Users",
  "Approvals",
  "Link SSO identity",
  "Model catalog",
  "Card embeddings",
  "Memory tuning",
  "Rate limits",
  "System tuning",
  "Structured output",
  "About",
];

// The resolved slice the AppSettings sections read together (each has its own CT pinning its own knobs; here
// they all mount at once, so ONE stub must satisfy all of them). Untyped route stubs, so a partial suffices.
const RESOLVED_APP: Partial<EffectiveAppSettings> = {
  memoryDefaults: {},
  memorySummarizer: {},
  rateLimits: { publicIp: 60, authed: 600, aiTurn: 30, login: 10 },
  agentSdkConcurrency: { summarize: 4 },
  promptTransformDeadlineMs: 250,
  catalogRefreshIntervalMs: 86_400_000,
  imageVariantQuality: 80,
  maxDatabankBytes: 20_971_520,
  promptCacheMinDepth: 0,
  // … the sections that merged in from the System pane (stage 4).
  forbidExternalMedia: true,
  trustHtml: false,
  maxImageBytes: 5_000_000,
  localMultiUser: false,
  discreetLogin: false,
  // Multi-user's third control (0753b234a, the private-endpoint admission editor) joins the same resolved
  // slice: its body does `resolved.privateEndpointAllowlist.join(…)` at first render, so an ABSENT key
  // throws inside the boundary and the section's anchor never lands — a 12-of-13 pane, not a visible error.
  privateEndpointAllowlist: [],
  corpusAutoindex: false,
  logLevel: "info",
  structuredOutputShape: "as-projected",
};

function stub(page: Page, viewer: TrpcWireOutput<"sessions.me">): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    // The config LIST paints every shelf, so the four collection bands read their rosters for the counts —
    // fed empty (the honest fresh-library arm) rather than left to routeTrpc's inert null.
    "tag.listTagsWithUsage": [],
    "regex.listScripts": [],
    "worldInfo.listBooksWithUsage": [],
    "rosterPreset.list": [],
    "admin.listUsers": () => USERS,
    "sessions.me": () => viewer,
    // Multi-user's owner-only Share card reads the relay; fed at rest.
    "share.status": () => ({ relay: { state: "off" as const }, liveSocketCount: 0, publicAddresses: [] }),
    // About (last at this anchor) suspends on the version identity — unfed, its boundary renders the error
    // state and its anchor never lands, which reads as a short pane rather than as a missing stub.
    "settings.getVersion": () => ({ version: "0.4.1", commit: "823d76f4343a1cea086b17a1b5bf212b44c17a7d", short: "823d76f4343a", source: "checkout" }),
    "settings.getAppSettings": () => EFFECTIVE_APP_SETTINGS,
    "settings.getAppSettingsWithOverrides": () => appSettingsView(RESOLVED_APP),
    // The plain-viewer arm lands on the default `appearance` pane, whose sections read the user settings.
    "settings.getUserSettings": () => ({ userId: viewer.userId, schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null }),
    "settings.listThemes": [],
  });
}

test("the skimmer renders every contributed admin section, in the door's declared order", async ({ mount, page }) => {
  await stub(page, OWNER_VIEWER);
  await mount(<AdminGroupStory />);
  // Every section resolves its OWN read behind its OWN boundary, so wait on the full set rather than on one
  // heading — a partially-painted pane would otherwise pass the order assertion on a subsequence.
  await expect(page.locator('[id^="config-anchor-admin-"]')).toHaveCount(ANCHOR_ORDER.length);
  await expect
    .poll(async () => await page.evaluate(() => [...document.querySelectorAll('[id^="config-anchor-admin-"]')].map((el) => el.id)))
    .toStrictEqual(ANCHOR_ORDER);
});

// Single-column-of-SECTIONS (owner ruling — Discord grammar): every subcategory SECTION shares the same left
// edge + full column width and stacks in registry order. Runs the SHARED render-parity harness (SET-SEAMS
// §9) — a decomposition that moves the pixels is a defect.
test("subcategory sections are a single column, stacked in registry order", async ({ mount, page }) => {
  await stub(page, OWNER_VIEWER);
  await mount(<AdminGroupStory />);
  await expect(page.locator('[id^="config-anchor-admin-"]')).toHaveCount(ANCHOR_ORDER.length);

  const geometry = await readSettingsPaneGeometry(page, "admin");
  expect(findSettingsColumnViolation(geometry, ANCHOR_ORDER.length)).toBeNull();
});

// P5 — NAV/SEARCH PARITY (SET-SEAMS §7.2/§7.3). The pane's nav DERIVES from the contributions now; the four
// moved subs keep their labels, their leaves, and their (category, subId) anchors.
test("the derived nav lists every contributed section, in door order", async ({ mount, page }) => {
  await stub(page, OWNER_VIEWER);
  await mount(<AdminGroupStory />);
  await page.getByRole("heading", { name: "Users" }).waitFor();

  const nav = page.getByRole("region", { name: "Settings groups" });
  await Promise.all(NAV_LABELS.map((label) => expect(nav.getByText(label, { exact: true })).toBeVisible()));
  // The nav DERIVES from the registry, so its order is the door's — assert the sequence, not just presence.
  await expect.poll(async () => (await nav.getByRole("button").allInnerTexts()).filter((text) => NAV_LABELS.includes(text))).toStrictEqual(NAV_LABELS);
});

// P6 — `when` PARITY (SET-SEAMS §9). The gate lives on the PANE (one predicate, three consumers): a plain
// viewer must see the admin pane in NEITHER the nav NOR the search index, and none of its sections anywhere.
test("a plain viewer sees no Admin band and no admin section", async ({ mount, page }) => {
  await stub(page, PLAIN_VIEWER);
  await mount(<ConfigHostStory />);
  await page.getByRole("region", { name: "Settings groups" }).waitFor();

  await expect(page.getByRole("region", { name: "Settings groups" }).getByText("Admin", { exact: true })).toHaveCount(0);
  // (The search-index half of this parity — no admin hit for a plain viewer — is S2's search CT's pin.)
  await expect(page.locator('[id^="config-anchor-admin-"]')).toHaveCount(0);
});

// §7.4 / §10 Q4 — a SUB-level deep link resolves the pane in render and lands on the section's anchor once
// the pane's DOM has it. The sub ids are byte-identical across the move, so old links keep working. The
// probe moved from `engines` (deleted with the in-server vLLM fleet) to `model-catalog`, another of the subs
// that came out of the retired admin pane surface in the same stage — the claim itself is unchanged.
test("a sub-level deep link lands on the moved section's anchor", async ({ mount, page }) => {
  await stub(page, OWNER_VIEWER);
  await mount(<ConfigHostStory target="admin" sub="model-catalog" />);

  await expect(page.locator("#config-anchor-admin-model-catalog")).toBeVisible();
});
