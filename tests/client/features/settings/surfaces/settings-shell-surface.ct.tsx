// CT: the settings shell (ux-flow-revamp J11 · Task #15 IA). Drives the PRODUCTION path — the category
// nav (USER/APP groups), the Discord-style subcategory rows under the active category, the default
// Appearance pane resolving over `settings.getUserSettings` (routeTrpc), switching to a placeholder
// category showing ITS distinct copy, and the fuzzy search-to-anchor (cmdk) jumping to a pane section.

// biome-ignore-all lint/security/noSecrets: the CSS attribute selectors used inside page.evaluate
// (`[role="…"]`, `[id$="…"]`, `[aria-current="…"]`) trip biome's entropy heuristic; none are secrets.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import { strToU8, zipSync } from "fflate";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { readClippedNavLabels, readEscapedAbsolutes, readSettingsShellColumns } from "../../../../support/ct/settings-geometry.ts";
import { makeResolvedChatCapability } from "../../../../support/factories/resolved-connection.ts";
import {
  SettingsModalStory,
  SettingsShellDeepLinkStory,
  SettingsShellFitsStory,
  SettingsShellInScrollingHostStory,
  SettingsShellNarrowStory,
  SettingsShellStory,
} from "../_ct-stories.tsx";

/** The getUserSettings read-model the Appearance pane suspends on — defaults are enough to render it. */
const USER_SETTINGS_VIEW = {
  userId: "user_ct_settings",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS,
  updatedAt: 0,
};

/** The search option for the Plugins category — a prefix match, since the option's accessible name carries
 *  the category beside the section it jumps to. Top-level so the regex is compiled once (biome). */
const PLUGINS_OPTION = /Plugins/u;

/** The admin-only Distribute section's search option — the absence assertion's needle (top-level per
 *  `useTopLevelRegex`). */
const DISTRIBUTE_OPTION = /Distribute/u;
/** The Distribute section's own dropzone input, addressed by its ACCESSIBLE NAME — the pane now hosts TWO
 *  dropzones (install for yourself · distribute to everyone) and the shared `data-slot` selector resolves to
 *  both, so the slot alone is a strict-mode violation. The name is also what tells the two apart on screen. */
const DISTRIBUTE_DROPZONE_LABEL = "Choose a plugin bundle to distribute";

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

/** The owner-global fire-rate ceiling the Automation pane's budget section renders (`OwnerBudgetView`). */
const OWNER_RATE_CEILING = 30;

/** The Automation surface's opening gloss — the line that says what is DIFFERENT about the library-wide
 *  lane, and the pane's most load-bearing string: it is the first thing the pane paints, it is NOT the
 *  pane's `description` (a `surface` pane never renders that), and it is what distinguishes this pane's
 *  content from every other category's. Top-level so both tests below anchor on the SAME copy. */
const AUTOMATION_GLOSS = "These rules watch your library and act on their own — no chat has to be open.";

/**
 * THE SHELL'S AMBIENT READS (#649) — spread FIRST into every `routeTrpc` call in this file.
 *
 * The shell mounts the WHOLE registry of contributed sections, so every mount fires the identity read the
 * nav gates on, the AppSettings pair the admin-anchored sections suspend on, the personas roster, the key
 * library, and the workloads run-history + schedule rows. None of that is any ONE test's subject — but
 * `routeTrpc` answers an unlisted procedure `null`, which is not a view, so seven pipelines ran INERT
 * across all thirty-three mounts and a regression in any of them was invisible to this file.
 *
 * DEFAULTS, NOT A CEILING. The identity-gate tests below list `sessions.me` AFTER the spread and win — the
 * plain-`user` default here is precisely the un-privileged arm the ungated tests already assumed when the
 * read resolved null.
 */
const SHELL_AMBIENT_ROUTES: Readonly<Record<string, unknown>> = {
  // `ViewerView` (transport/trpc/routers/sessions.ts:25) — a plain user, so the adminOnly nav rows stay
  // hidden exactly as they did under the unfed null. The admin/owner arms override this key below.
  "sessions.me": { userId: USER_SETTINGS_VIEW.userId, handle: "ct_settings", globalRole: "user" },
  // The two AppSettings reads the `admin`-anchored sections suspend on — the SAME resolved config the
  // admin tests already feed, so the sections resolve instead of falling into their boundary.
  "settings.getAppSettings": APP_CONFIG,
  "settings.getAppSettingsWithOverrides": { resolved: APP_CONFIG, overrides: {} },
  // `PersonaDetail[]` — the personas pane's roster. Empty is the honest fresh-viewer default.
  "persona.list": [],
  // `CredentialView[]` — the Connections pane's key library.
  "credentials.list": [],
  // The workloads section's run history + schedule rows. Empty is honest: a fresh viewer has run nothing
  // and scheduled nothing, and an empty ARRAY is a real shape the readers can select over.
  "workloads.list": [],
  "workloads.listSchedules": [],
  // The Connections pane's role rows read the server's OWN chat resolution. A CASCADE row: it is not in the
  // #649 ledger for this file because it was UNREACHABLE while the AppSettings pair above answered null —
  // the pane died in its boundary before any role row mounted. Feeding them made it fire and the ratchet
  // named it on the next run. The `Admin absorbed the System sections` test already fed exactly this and
  // documented the hole it plugs; the ambient default carries the same settled descriptor everywhere.
  "connection.resolveChatCapability": makeResolvedChatCapability(),
  // `PluginView[]` — the Plugins pane's installed list. NOT in the #649 census the ledger carried: this row
  // is UNBUDGETED and the ratchet REDS it, measured on the UNMODIFIED source at HEAD in this lane's
  // before-run, so it is a pre-existing red the plugins section brought with it, not something this feed
  // introduced. `plugins-settings-surface.tsx:29` suspends on it, and `[]` is the honest nothing-installed
  // arm the surface's own empty state describes.
  "plugin.list": [],
  // `DistributedPluginView[]` — the ADMIN-gated Distribute section's read (D147 clause (d)). It only mounts
  // for an admin viewer on the Plugins pane, so the plain-user default never fires it; fed here so the admin
  // arms below resolve the section instead of falling into its boundary. `[]` = nothing published, the honest
  // fresh-deployment arm the section's own empty state describes.
  "plugin.listDistributed": [],
  // C5 — the Automation pane's two OWNER-GLOBAL reads (`features/automation/components/owner-rules-surface.tsx`).
  // The pane stopped being `{placeholder: true}` and became a real `surface`, so every test that clicks
  // Automation now mounts two `useSuspenseQuery` sections; unfed they answer `null`, both boundaries paint
  // their error state, and the pane's content assertions would be asserting a failure screen. Fed HERE (not
  // as a ratchet baseline row): the reads are ambient to this file's Automation clicks, not any one test's
  // subject. `[]` is the honest fresh-viewer arm — the surface's own empty state describes it — and the
  // ceiling is a REAL number rather than the DDL default so the rendered belt is a value the pane chose.
  "automation.listOwnerRules": [],
  "automation.getOwnerBudgets": { maxFiresPerHour: OWNER_RATE_CEILING },
};

test("renders the USER + APP group headings and the category rows", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);

  await expect(component.getByText("User", { exact: true })).toBeVisible();
  await expect(component.getByText("App", { exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Appearance" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Connections" })).toBeVisible();
});

// The kicker is the group's NAME, so it has to be wired as one (side-eye 2026-08-16 ARIA rider): "User" and
// "App" rendered as bare `paragraph:` nodes, so the nav landmark announced one flat run of rows and a reader
// navigating by structure could not tell where the user tier ended and the app tier began.
test("each nav tier is a NAMED group, labelled by its own kicker (not a bare paragraph)", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);

  const nav = component.getByRole("navigation", { name: "Settings sections" });
  // Exactly the two tiers, each announcing the word that is on screen above it — and the label comes from
  // the RENDERED kicker via aria-labelledby, so the visible name and the announced one cannot drift.
  await expect(nav.getByRole("group")).toHaveCount(2);
  await expect(nav.getByRole("group", { name: "User" })).toBeVisible();
  await expect(nav.getByRole("group", { name: "App" })).toBeVisible();
  // The category rows live INSIDE their tier, which is the whole point — a group nobody is in is decoration.
  await expect(nav.getByRole("group", { name: "App" }).getByRole("button", { name: "Connections" })).toBeVisible();
});

// The search box must not announce a listbox it has not opened (side-eye 2026-08-16 ARIA rider). cmdk's input
// hardcodes `aria-expanded="true"` because it assumes its list is always mounted; this surface mounts the list
// only while there is a query, so on load the combobox claimed to be expanded onto nothing.
test("the search combobox reports COLLAPSED until a query mounts its list", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);

  const search = component.getByRole("combobox", { name: "Search settings" });
  await expect(search).toHaveAttribute("aria-expanded", "false");
  await expect(component.getByRole("listbox")).toHaveCount(0);

  await search.fill("avatar size");
  // SETTLED: the listbox is rendered, and only then is the expanded claim true.
  await expect(component.getByRole("listbox")).toHaveCount(1);
  await expect(search).toHaveAttribute("aria-expanded", "true");

  // …and it goes back honest when the query is cleared and the list unmounts.
  await search.fill("");
  await expect(component.getByRole("listbox")).toHaveCount(0);
  await expect(search).toHaveAttribute("aria-expanded", "false");
});

// ONE "you are here" per location (side-eye 2026-08-01): a category row that OWNS sections is a disclosure
// GROUP — it carries aria-expanded, never aria-current, because its active child already is the current
// item. Both carrying aria-current announced two current items for one place.
test("the nav is a navigation landmark; a section-owning category is a GROUP and only its leaf is aria-current", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);

  await expect(component.getByRole("navigation", { name: "Settings sections" })).toBeVisible();
  const appearance = component.getByRole("button", { name: "Appearance" });
  await expect(appearance).toHaveAttribute("aria-expanded", "true");
  await expect(appearance).not.toHaveAttribute("aria-current", "true");
  // Exactly one nav row is current, and it is a LEAF (a subcategory) — the pane's first section, since the
  // pane opens at its top.
  const nav = component.getByRole("navigation", { name: "Settings sections" });
  await expect(nav.locator('[aria-current="true"]')).toHaveCount(1);
  await expect(component.getByRole("button", { name: "Message style" })).toHaveAttribute("aria-current", "true");
});

// A category with NO sections has no leaf to hand the marker to — it IS the leaf, so it keeps aria-current
// and has no aria-expanded (there is nothing to disclose).
// RE-ANCHORED, and the reason is worth stating because it is a COVERAGE LOSS, not a rename (C5, cb8026bfc):
// this test used to pin the nav column's LEAF arm (`selected={isActive}` — a pane with no sections keeps
// `aria-current` itself) and Automation was its last live subject. Automation is now a real `surface` pane
// with two subcategories, and every one of the nine registered panes has at least one nav row (own
// subcategories: personas/backup/automation/connections/plugins · contributed section navs:
// appearance/chat-behavior/admin/workloads), so the leaf arm has NO instantiable subject left in the
// production registry and cannot be pinned from this story. What IS still pinnable — and is the actual a11y
// defect the pair was minted for (`ui/primitives/list-row/list-row.tsx:145-148`: "aria-current on both a
// parent and its child announces two current items for one location") — is the DISCLOSURE arm and the
// one-marker invariant, which the count assertion below states directly rather than by implication.
test("a sectioned category is a disclosure group whose FIRST section is the one aria-current leaf", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);

  const automation = component.getByRole("button", { name: "Automation" });
  await automation.click();
  // The category row announces the disclosure it now owns, and does NOT also claim to be the location.
  await expect(automation).toHaveAttribute("aria-expanded", "true");
  await expect(automation).not.toHaveAttribute("aria-current", "true");
  // Landing at the top of the pane IS landing on its first section (`firstSubIdOf`), so the marker is on
  // "Library-wide rules" — the first of the two subcategories `automationPane` declares.
  await expect(component.getByRole("button", { name: "Library-wide rules" })).toHaveAttribute("aria-current", "true");
  // …and it is the ONLY one in the whole nav. This is the assertion the old pair could only make by
  // implication, and it is what would red if a parent and its child ever both claimed the location again.
  const nav = component.getByRole("navigation", { name: "Settings sections" });
  await expect(nav.locator('[aria-current="true"]')).toHaveCount(1);
});

test("the active category expands into indented subcategory rows (Discord grammar)", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);

  // Appearance is active → its subcategory rows render as their own nav buttons.
  await expect(component.getByRole("button", { name: "Avatars" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Reading typography" })).toBeVisible();
  // Connections is NOT active → no subcategory rows appear for it (it has none anyway).
  await component.getByRole("button", { name: "Connections" }).click();
  await expect(component.getByRole("button", { name: "Avatars" })).toHaveCount(0);
});

test("Appearance is the default pane (a real setting-row surface, not a placeholder)", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);
  // The migrated #31 appearance surface renders its "Message style" SECTION heading (the nav also has a
  // "Message style" subcategory row — target the pane's <h2> heading specifically).
  await expect(component.getByRole("heading", { name: "Message style" })).toBeVisible();
});

test("clicking a subcategory row marks it aria-current", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);

  await component.getByRole("button", { name: "Avatars" }).click();
  await expect(component.getByRole("button", { name: "Avatars" })).toHaveAttribute("aria-current", "true");
});

// Was "switching to an unbuilt category shows ITS distinct teaching copy" — the INTENT survives (switching
// category swaps in content that belongs to THAT category and to no other), the anchors moved because the
// state it described is dead: C5 (cb8026bfc) turned Automation from `{placeholder: true}` into a real
// `surface`, and a `surface` pane NEVER renders its `description` (`settings-shell-surface.tsx:418` — only
// the placeholder arm does). The old assertions named the pane's description string, the placeholder's
// "Not built yet" chip and its "meanwhile" pointer: three things this pane cannot paint any more. They are
// replaced by what the owner-global surface actually shows, section by section.
test("switching to Automation shows ITS distinct content — the owner-global rules surface", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);

  await component.getByRole("button", { name: "Automation" }).click();

  // Section 1 — the rule list, on `listOwnerRules: []`: the opening gloss plus the empty state that says
  // what to do about it ([[empty-states-are-load-bearing]] — the lesson the retired placeholder arm carried
  // is the same one this arm owes, and the surface answers it with copy the placeholder could not know).
  await expect(component.getByText(AUTOMATION_GLOSS)).toBeVisible();
  await expect(component.getByText("Nothing is watching your library yet.", { exact: false })).toBeVisible();
  await expect(component.getByRole("button", { name: "Add a rule" })).toBeVisible();

  // Section 2 — the owner RATE BELT, which has no per-chat equivalent and is the clearest tell that this is
  // the global lane's own surface. The control is asserted BY ITS LABEL, not by a placeholder string: the
  // `Field`-owned association is the thing that would break silently if a second `aria-label` were added.
  await expect(component.getByRole("textbox", { name: "Runs per hour" })).toHaveValue(String(OWNER_RATE_CEILING));
  await expect(component.getByRole("button", { name: "Save limit" })).toBeVisible();

  // …and the pane's `description` is NOT on screen — the assertion that keeps this test honest about which
  // body arm rendered (a regression back to the placeholder arm would paint it and every check above would
  // fail for a reason this line names).
  await expect(component.getByText("Rules that watch your whole library", { exact: false })).toHaveCount(0);

  // THE MEASURE, not just the content (side-eye re-verify 2026-08-08, carried forward onto the new anchor):
  // a `@container` root re-parented under a shrink-to-fit centering wrapper resolved to width 0 and painted
  // the copy as a one-word ribbon while the content assertions stayed GREEN. Prose in a pane must be a
  // paragraph, not a column.
  const gloss = component.getByText(AUTOMATION_GLOSS);
  const box = await gloss.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeGreaterThan(200);
});

// Task #37 — Connections is a REAL pane (the placeholder is GONE); Admin is a REAL pane too (its own gate
// tests below + admin-pane.ct.tsx). SET-SEAMS stage 4 (§10 Q2) retired the `system` category entirely — its
// former first section, "Media & trust", is reachable through ADMIN now, and no System nav row exists.
// C5 (cb8026bfc) took the LAST placeholder with it: Automation is a `surface` too, so this test's closing
// arm now asserts the same "every APP category is real" claim it always made — with the one category that
// used to be the exception standing on its own content instead of on teaching copy.
test("Admin absorbed the System sections; Connections and Automation are real panes", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...SHELL_AMBIENT_ROUTES,
    "settings.getUserSettings": () => USER_SETTINGS_VIEW,
    "settings.getAppSettings": () => APP_CONFIG,
    "settings.getAppSettingsWithOverrides": () => ({ resolved: APP_CONFIG, overrides: {} }),
    "sessions.me": () => OWNER_VIEWER,
    "admin.listUsers": () => [],
    "admin.vllmEngines": () => ({}),
    "credentials.list": () => [],
    // The Connections pane's role rows ALSO read the server's own chat resolution. Unstubbed it answered
    // `{data:null}` and the surface threw (`Cannot read properties of null`) into its QueryErrorState —
    // a latent hole that only reddened once the decomposed appearance pane changed the mount timing.
    "connection.resolveChatCapability": () => makeResolvedChatCapability(),
  });
  const component = await mount(<SettingsShellStory />);

  // No System category anywhere in the nav …
  await expect(component.getByRole("button", { name: "System", exact: true })).toHaveCount(0);
  // … and its first section renders inside ADMIN, at an `admin`-keyed anchor.
  await component.getByRole("button", { name: "Admin" }).click();
  await expect(component.getByRole("heading", { name: "Media & trust" })).toBeVisible();
  await expect(component.locator("#settings-anchor-admin-media-trust")).toBeVisible();

  // Connections → the real role-slot + key-library surface (its "Model roles" SECTION heading), NOT the
  // old teaching copy.
  await component.getByRole("button", { name: "Connections" }).click();
  await expect(component.getByRole("heading", { name: "Model roles" })).toBeVisible();
  await expect(component.getByText("Provider credentials and model connections.")).toHaveCount(0);

  // Automation → its real owner-global rules surface (the opening gloss), NOT the retired teaching copy.
  await component.getByRole("button", { name: "Automation" }).click();
  await expect(component.getByText(AUTOMATION_GLOSS)).toBeVisible();
  await expect(component.getByText("Scheduled and triggered actions across your library.")).toHaveCount(0);
});

// The admin gate (settings-nav-model `adminOnly` — UX honesty over the server's adminProcedure floor):
// the Admin category exists in the nav + search ONLY for owner ∪ admin viewers.
test("a plain user never sees the Admin category (nav row + search entry hidden)", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...SHELL_AMBIENT_ROUTES,
    "settings.getUserSettings": () => USER_SETTINGS_VIEW,
    "sessions.me": () => ({ userId: "user_plain", handle: "plain", globalRole: "user" }),
  });
  const component = await mount(<SettingsShellStory />);

  // The APP group renders (Connections is there) but Admin's row is absent.
  await expect(component.getByRole("button", { name: "Connections" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Admin" })).toHaveCount(0);

  // The search index hides the admin entries too.
  await component.getByRole("combobox", { name: "Search settings" }).fill("create user");
  await expect(component.getByRole("option", { name: "Create user" })).toHaveCount(0);
});

// D147 — the OTHER side of the same gate, and the reason this pair sits together: the Plugins pane used to
// carry `when: (viewer) => viewer.isAdmin` beside Admin's, because every `plugin.*` management verb was
// admin-gated on the server. Plugins are user-scoped now (anyone installs for themselves; `plugin.list` is
// the caller's OWN rows), so a plain user must REACH this pane — a viewer gate here would hide a person's own
// installed plugins from them. Asserted on the RENDERED pane, not on the nav row alone: the row existing
// while the body refused would be the same failure one screen further in.
test("a plain user DOES see the Plugins category, and it mounts the real per-user pane", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...SHELL_AMBIENT_ROUTES,
    "settings.getUserSettings": () => USER_SETTINGS_VIEW,
    "sessions.me": () => ({ userId: "user_plain", handle: "plain", globalRole: "user" }),
  });
  const component = await mount(<SettingsShellStory />);

  await component.getByRole("button", { name: "Plugins" }).click();
  // The real surface, not a placeholder: its two anchored sections plus the empty state, which is written
  // for the PERSON asking ("nothing YOU installed"), never for an operator surveying the box.
  await expect(component.getByRole("heading", { name: "Installed" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Add a plugin" })).toBeVisible();
  await expect(component.getByText("Nothing installed yet.", { exact: false })).toBeVisible();
  // …and it is searchable for them too — a gate left on the nav would also have cut the search index.
  await component.getByRole("combobox", { name: "Search settings" }).fill("plugin");
  await expect(component.getByRole("option", { name: PLUGINS_OPTION }).first()).toBeVisible();
});

// D147 clause (d) — the ADMIN half of the same pane. The server-wide install is a viewer-gated SECTION
// contributed at the `plugins` anchor, never a gate on the pane, so this pair asserts the gate from BOTH
// sides on the SAME screen: a plain user reaches their own plugins and does NOT see the deployment-wide
// control, an admin sees both. Asserted on the rendered section (heading + its control), not on the nav row:
// the row existing while the body refused is the same failure one screen further in.
test("a plain user does NOT see the Distribute section on their Plugins pane", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...SHELL_AMBIENT_ROUTES,
    "settings.getUserSettings": () => USER_SETTINGS_VIEW,
    "sessions.me": () => ({ userId: "user_plain", handle: "plain", globalRole: "user" }),
  });
  const component = await mount(<SettingsShellStory />);

  await component.getByRole("button", { name: "Plugins" }).click();
  // Their own sections are there…
  await expect(component.getByRole("heading", { name: "Installed" })).toBeVisible();
  // …and the admin one is absent from the body, the sub-nav AND the search index (one `when`, three consumers).
  await expect(component.getByRole("heading", { name: "Distribute to everyone" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Distribute to everyone" })).toHaveCount(0);
  await component.getByRole("combobox", { name: "Search settings" }).fill("distribute");
  await expect(component.getByRole("option", { name: DISTRIBUTE_OPTION })).toHaveCount(0);
});

test("an ADMIN sees the Distribute section on the Plugins pane, and publishing lands in the published list", async ({ mount, page }) => {
  // Stateful so the barrier is a SETTLED rendered state — the published row appearing after the write's own
  // invalidate — rather than a toast or an in-flight flash.
  let published: readonly unknown[] = [];
  await routeTrpc(page, {
    ...SHELL_AMBIENT_ROUTES,
    "settings.getUserSettings": () => USER_SETTINGS_VIEW,
    "sessions.me": () => ({ userId: "user_admin", handle: "admin", globalRole: "admin" }),
    "plugin.listDistributed": () => published,
    "plugin.installForAllUsers": () => {
      published = [{ slug: "house-style", name: "House Style", version: "1.0.0", distributedAt: 0, updatedAt: 0 }];
      return { slug: "house-style", name: "House Style", version: "1.0.0", applied: 3, skipped: [] };
    },
  });
  const component = await mount(<SettingsShellStory />);

  await component.getByRole("button", { name: "Plugins" }).click();
  await expect(component.getByRole("heading", { name: "Distribute to everyone" })).toBeVisible();
  // THE SENTENCE THAT MAKES THE BUTTON HONEST: distributing does not turn anything on for anyone. Without it
  // "Distribute to everyone" reads as a promise the system deliberately does not keep (enabling runs the
  // plugin's code as the person who enables it, so it can never be done on their behalf).
  await expect(component.getByText("switched off, allowed nothing", { exact: false })).toBeVisible();
  await expect(component.getByText("Nothing is being given out.", { exact: false })).toBeVisible();

  await component.getByLabel(DISTRIBUTE_DROPZONE_LABEL).setInputFiles({
    name: "house-style.zip",
    mimeType: "application/zip",
    buffer: distributableBundle(),
  });
  // The confirm step names what every recipient will be asked for, in the person's words.
  await expect(component.getByText("Read this room's messages")).toBeVisible();
  await component.getByRole("button", { name: "Distribute to everyone" }).click();

  // SETTLED: the published list repainted from the server's own truth after the invalidate.
  await expect(component.getByText("house-style · 1.0.0")).toBeVisible();
  await expect(component.getByRole("button", { name: "Stop giving it out" })).toBeVisible();
});

test("an admin viewer sees the Admin category and it mounts the REAL pane", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...SHELL_AMBIENT_ROUTES,
    "settings.getUserSettings": () => USER_SETTINGS_VIEW,
    "sessions.me": () => ({ userId: "user_admin", handle: "admin", globalRole: "admin" }),
    "admin.listUsers": () => [],
    "admin.vllmEngines": () => ({}),
  });
  const component = await mount(<SettingsShellStory />);

  await component.getByRole("button", { name: "Admin" }).click();
  // The real pane's registry-anchored sub-nav (Users + Engines sections) — not the old teaching
  // placeholder. The admin pane renders its sections as sub-navigation buttons (like every category
  // with subcategories), so the REAL-pane proof is the presence of those section entries.
  await expect(component.getByRole("button", { name: "Users" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Engines" })).toBeVisible();
});

// The deep-link-to-when-gated-pane race: a COLD `openSettings('admin')` resolves `active` while the
// non-suspense sessions.me probe is still in flight (isAdmin false → 'admin' not yet visible), so the shell
// must re-apply the still-unsatisfied target once visibility GROWS — not fall back to Appearance forever.
test("a deep-link to a when-gated pane lands on it once the viewer probe resolves (not stuck on the fallback)", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...SHELL_AMBIENT_ROUTES,
    "settings.getUserSettings": () => USER_SETTINGS_VIEW,
    "sessions.me": () => ({ userId: "user_admin", handle: "admin", globalRole: "admin" }),
    "admin.listUsers": () => [],
    "admin.vllmEngines": () => ({}),
    "settings.getAppSettingsWithOverrides": () => ({ resolved: { ...APP_CONFIG, memoryDefaults: {}, memorySummarizer: {} }, overrides: {} }),
  });
  const component = await mount(<SettingsShellDeepLinkStory target="admin" />);

  // Once the probe resolves, Admin is the ACTIVE pane (its region is labelled + its sub-nav shows), NOT the
  // Appearance fallback the race would have stuck on.
  await expect(component.getByRole("region", { name: "Admin settings" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Users" })).toBeVisible();
  await expect(component.getByRole("region", { name: "Appearance settings" })).toHaveCount(0);
});

// SET-SEAMS §10 Q4 — the SUB-level deep link: `openSettingsTo(category, subId)` lands ON the section, not
// at the top of the pane. The target may name a CONTRIBUTED section (its anchor is minted from the same
// (category, subId) pair as a pane-owned one), which is the whole point: a feature can link straight to the
// section it owns without knowing where the settings shell put it.
test("a SUB-level deep link lands on the section's anchor (contributed sections included)", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellDeepLinkStory target="chat-behavior" subId="world-info" />);

  // The pane resolved AND the contributed section's own anchor is in view + selected in the nav.
  await expect(component.getByRole("region", { name: "Chat behavior settings" })).toBeVisible();
  await expect(component.locator("#settings-anchor-chat-behavior-world-info")).toBeInViewport();
  await expect(component.getByRole("button", { name: "World info" })).toHaveAttribute("aria-current", "true");
});

test("a category-only deep link still lands at the TOP of the pane (no phantom jump)", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellDeepLinkStory target="chat-behavior" />);

  await expect(component.getByRole("region", { name: "Chat behavior settings" })).toBeVisible();
  // The pane's FIRST section is the one in view.
  await expect(component.locator("#settings-anchor-chat-behavior-message-handling")).toBeInViewport();
});

// #549 — the NAV has to agree with the pane it is next to (UI-Architecture §4.2: LIST drives CONTENT).
// A category CLICK runs `selectCategory`, which suppresses the scroll-spy across the landing; a category
// DEEP LINK resolved active/activeSub in render and then stopped, so the spy's own initial compute ran
// against a still-mounting pane and overwrote the right answer with whatever its transient geometry
// implied. Measured live on :5173 via `__orb.nav.openSettings("workloads")`: aria-current on "Analysis
// tuning" — the LAST of three sections — while the Runs pane rendered, and one synthetic scroll event
// afterwards corrected it to "Runs". Reachable without the dev bridge: `openSettingsTo("connections")`
// from the chat empty state takes this exact path, and the corpus rail / memory section / databank body
// take its sub-level sibling.
//
// THIS PIN IS A FENCE, NOT THE DEFECT PROOF — stated plainly because the difference matters. Run against
// the UNFIXED source it PASSES: the CT harness's panes settle inside one frame, so the transient geometry
// that produced the live lie never exists here, and a `trpcHold` on the Runs list cannot manufacture it
// (the hold suspends every procedure batched with it, so the whole pane — anchors included — stops
// rendering rather than rendering short). The DEFECT receipts are the live ones on :5173 quoted above.
// What this fence does own is the contract both halves of the fix serve: a deep-linked pane's FIRST
// section is the current one, and nothing later takes it back.
test("#549 a category-only deep link marks the pane's FIRST section current, and keeps it (fence)", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW, "workloads.list": [], "workloads.listSchedules": [] });
  const component = await mount(<SettingsShellDeepLinkStory target="workloads" />);

  // SETTLED on the pane's own rendered region, so the assertion runs after the mount the spy raced.
  await expect(component.getByRole("region", { name: "Jobs settings" })).toBeVisible();
  const nav = component.getByRole("navigation", { name: "Settings sections" });
  await expect(nav.locator('[aria-current="true"]')).toHaveCount(1);
  await expect(component.getByRole("button", { name: "Runs", exact: true })).toHaveAttribute("aria-current", "true");

  // The LAST section is the one the live defect landed on — name it, so a regression reads as itself.
  await expect(component.getByRole("button", { name: "Analysis tuning" })).not.toHaveAttribute("aria-current", "true");
});

// Task #37 — the deployment knobs are fuzzy-searchable like everything else; a hit jumps to its pane +
// anchor. Since SET-SEAMS stage 4 that pane is ADMIN (§10 Q2), and the leaf is a CONTRIBUTED section's.
test("fuzzy search jumps to the merged Operations section's admin anchor", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...SHELL_AMBIENT_ROUTES,
    "settings.getUserSettings": () => USER_SETTINGS_VIEW,
    "settings.getAppSettings": () => APP_CONFIG,
    "settings.getAppSettingsWithOverrides": () => ({ resolved: APP_CONFIG, overrides: {} }),
    "sessions.me": () => OWNER_VIEWER,
    "admin.listUsers": () => [],
    "admin.vllmEngines": () => ({}),
  });
  const component = await mount(<SettingsShellStory />);

  // "log level" matches the Admin › Operations › Log level setting (fuzzy over label + keywords).
  await component.getByRole("combobox", { name: "Search settings" }).fill("log level");
  const result = component.getByRole("option", { name: "Log level" }).first();
  await expect(result).toBeVisible();
  await result.click();

  // The jump switched into the Admin pane and scrolled its Operations section into view.
  await expect(component.getByRole("heading", { name: "Operations" })).toBeInViewport();
  // Admin owns sections, so the jump expands it as a GROUP and the current marker lands on the leaf.
  await expect(component.getByRole("button", { name: "Admin" })).toHaveAttribute("aria-expanded", "true");
  await expect(component.getByRole("button", { name: "Operations" })).toHaveAttribute("aria-current", "true");
});

// Search parity for a CONTRIBUTED section (§6c): character's `library` section rides the same index as any
// pane-owned one — its nav merges into the appearance pane's subcategories, so its leaf setting is
// searchable and the hit jumps to the contributed section's own anchor.
test("fuzzy search finds a CONTRIBUTED section's setting and jumps to its anchor", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);

  // Start elsewhere so the jump has to switch panes back to Appearance.
  await component.getByRole("button", { name: "Connections" }).click();

  await component.getByRole("combobox", { name: "Search settings" }).fill("rows per page");
  const result = component.getByRole("option", { name: "Rows per page" }).first();
  await expect(result).toBeVisible();
  await result.click();

  // The contributed section's OWN anchor scrolled into view, and its nav row exists like any other.
  await expect(component.locator("#settings-anchor-appearance-library")).toBeInViewport();
  await expect(component.getByRole("button", { name: "Library" })).toBeVisible();
});

test("fuzzy search surfaces a setting result and jumps its pane into view", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);

  // Start on a placeholder pane so the jump has to switch panes back to Appearance.
  await component.getByRole("button", { name: "Connections" }).click();

  // "avatar size" matches the Appearance › Avatars › Avatar size setting (fuzzy over label + keywords).
  await component.getByRole("combobox", { name: "Search settings" }).fill("avatar size");
  const result = component.getByRole("option", { name: "Avatar size" }).first();
  await expect(result).toBeVisible();
  await result.click();

  // The jump switched back to the Appearance pane (its Avatars section heading is now on screen) and
  // cleared the query (the category tree returned).
  await expect(component.getByRole("heading", { name: "Avatars" })).toBeInViewport();
  await expect(component.getByRole("button", { name: "Appearance" })).toBeVisible();
});

// Each column OWNS its scroll axis: the Row is `align="stretch"`, so both the nav landmark and the pane
// COLUMN fill the row height and their own `overflow-y-auto` caps + scrolls them internally — the outer
// modal wrapper never scrolls (side-eye round-3, nav-button top 262→-1516). The pane column is the scroll
// REGION plus the shell's one aggregate save-status footer (SET-SEAMS §3), which sits below the scroller
// and must never scroll away — so the column, not the region alone, is what fills the row.
test("both settings columns fill the row height (own their scroll axis; nav can't be swept)", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);
  await expect(component.getByRole("combobox", { name: "Search settings" })).toBeVisible();

  const heights = await page.evaluate(() => {
    const nav = document.querySelector('[role="navigation"]');
    const content = document.querySelector('[role="region"]');
    const paneColumn = content?.parentElement ?? null;
    const row = nav?.parentElement ?? null;
    const isScroller = (el: Element | null): boolean => el !== null && ["auto", "scroll"].includes(getComputedStyle(el).overflowY);
    return {
      row: row?.clientHeight ?? -1,
      nav: nav?.clientHeight ?? -2,
      paneColumn: paneColumn?.clientHeight ?? -3,
      content: content?.clientHeight ?? -4,
      navScrolls: isScroller(nav),
      contentScrolls: isScroller(content),
    };
  });
  expect(heights.navScrolls).toBe(true);
  expect(heights.contentScrolls).toBe(true);
  expect(Math.abs(heights.nav - heights.row)).toBeLessThan(2);
  expect(Math.abs(heights.paneColumn - heights.row)).toBeLessThan(2);
  // The scroller never EXCEEDS its column (it caps at the space the footer leaves).
  expect(heights.content).toBeLessThanOrEqual(heights.paneColumn);
});

// OWNER DOGFOOD 2026-08-13, "the settings screen scrolls past the end of its results — blank space below
// the last row for no reason". Root cause (measured live on :5173, 2026-08-14): Base UI form primitives put
// `sr-only` boxes at `position:absolute` (NumberField's `[data-slot=number-field-bounds]`, Switch's hidden
// `<input>`) — 35 of them in the Appearance pane. Neither column of the shell established a CONTAINING
// BLOCK, so those boxes resolved theirs all the way up to the modal popup: `overflow-y:auto` on the pane
// only clips descendants whose containing block is inside it, so their static positions (deep in a 2804px
// pane) were added to the POPUP's scrollable area instead. Live receipt: popup clientHeight 1014 /
// scrollHeight **2900** → the whole modal scrolled 1886px into an empty card. Toggling `position:relative`
// on the pane region in the live page collapsed popup scrollHeight 2900 → 1014 on the spot.
//
// Two pins, because they fail for different reasons: the MECHANISM (nothing escapes either scroller) and
// the SYMPTOM (a positioned scrolling host around the shell gains no phantom scroll). The symptom pin needs
// its own story: in the CT harness `[data-slot=dialog-popup]` computes `position: static`, so the escapees
// land on the fixed viewport and the modal story cannot see the defect at all.
test("no absolutely-positioned box escapes either settings scroller (the containing-block pin)", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);
  await component.getByRole("heading", { name: "Message style" }).waitFor();

  expect(await readEscapedAbsolutes(page, '[role="region"][aria-label="Appearance settings"]')).toEqual([]);
  expect(await readEscapedAbsolutes(page, '[role="navigation"][aria-label="Settings sections"]')).toEqual([]);
});

test("a positioned scrolling host around the shell gains NO phantom scroll (the owner's blank space)", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellInScrollingHostStory />);
  await component.getByRole("heading", { name: "Message style" }).waitFor();

  const host = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-testid="scrolling-host"]');
    return el === null ? null : { clientHeight: el.clientHeight, scrollHeight: el.scrollHeight };
  });
  expect(host).not.toBeNull();
  // The pane owns its scroll axis; the host around it must have nothing to scroll. Pre-fix this measured
  // scrollHeight ≫ clientHeight with no content down there — the blank card the owner scrolled into.
  expect((host?.scrollHeight ?? 0) - (host?.clientHeight ?? 0)).toBeLessThanOrEqual(1);
});

// Scroll-spy (owner ruling): scrolling the pane updates which subcategory row is aria-current, and a
// short trailing section still wins once you scroll to the very bottom.
test("scrolling to the bottom activates the last subcategory (scroll-spy)", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);
  await component.getByRole("heading", { name: "Message style" }).waitFor();
  // At rest, the first section is active — Library (the trailing section since the ⑪ pageSize row) is NOT.
  await expect(component.getByRole("button", { name: "Library" })).not.toHaveAttribute("aria-current", "true");

  // Scroll the pane region to the very bottom → the short trailing "Library" section wins.
  await page.evaluate(() => {
    const region = document.querySelector('[role="region"]') as HTMLElement | null;
    if (region !== null) {
      region.scrollTop = region.scrollHeight;
    }
  });

  await expect(component.getByRole("button", { name: "Library" })).toHaveAttribute("aria-current", "true");
});

// Click-jump suppresses the spy so the nav never flickers through intermediate sections during the
// programmatic smooth scroll: a MutationObserver records EVERY subcategory that gains aria-current from
// the click until the scroll settles — only the target should ever appear.
test("a distant subcategory click lands on the target, never an intermediate (spy suppressed)", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);
  await component.getByRole("heading", { name: "Message style" }).waitFor();

  // Record every nav row that gains aria-current from now on (before the click).
  await page.evaluate(() => {
    // In-page globalThis scaffolding — `globalThis` in the mounted browser context carries no app
    // type; the cast is the monkeypatch/spy scaffolding itself, not a fabricated domain value.
    // FABRICATION-OK: in-page globalThis scaffolding (see above).
    const w = globalThis as unknown as { __seen: string[] };
    w.__seen = [];
    const nav = document.querySelector('[role="navigation"]');
    if (nav === null) {
      return;
    }
    const record = (): void => {
      // Every element that is aria-current at this mutation — collect all so an intermediate subcategory
      // flicker can't hide. Since the group ruling only a LEAF is ever current, so the sample is the set of
      // subcategories that lit up during the jump.
      for (const el of nav.querySelectorAll('[aria-current="true"]')) {
        const label = el.textContent?.trim();
        if (label !== undefined && label !== "" && !w.__seen.includes(label)) {
          w.__seen.push(label);
        }
      }
    };
    new MutationObserver(record).observe(nav, {
      attributeFilter: ["aria-current"],
      attributes: true,
      subtree: true,
    });
  });

  await component.getByRole("button", { name: "Effects" }).click();
  await expect(component.getByRole("button", { name: "Effects" })).toHaveAttribute("aria-current", "true");

  // Wait for the programmatic smooth-scroll to fully settle (scrollTop stable for several polls), so any
  // post-settle spy tick is included in the sample.
  await page.waitForFunction(() => {
    // FABRICATION-OK: in-page globalThis scaffolding (see the MutationObserver instrumentation above).
    const w = globalThis as unknown as { __top?: number; __stable?: number };
    const region = document.querySelector('[role="region"]') as HTMLElement | null;
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
  const seen = await page.evaluate(() => (globalThis as unknown as { __seen: string[] }).__seen);
  // The only row that ever held aria-current during the jump is the target subcategory — no INTERMEDIATE
  // section flickered through, and no parent category shared the marker.
  expect(seen).toEqual(["Effects"]);
});

// Flash geometry (owner P3): after a jump the flashed SECTION carries the inset-ring highlight, its box
// hugs the section's own content (height == the section's height, no grid stretch), and it sits fully
// within the scroll container's visible width (the inset ring can't be clipped at the scroll edge).
test("the jump flash hugs the section box and stays within the scroll container", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);
  await component.getByRole("heading", { name: "Message style" }).waitFor();

  await component.getByRole("button", { name: "Avatars" }).click();

  // Wait for the transient flash ring to land on the section (rAF-polled + smooth scroll), then measure
  // while it is present.
  await page.waitForFunction(() => {
    const section = document.querySelector('[id$="-avatars"]');
    return section !== null && getComputedStyle(section).boxShadow.includes("inset");
  });

  const geo = await page.evaluate(() => {
    const section = document.querySelector('[id$="-avatars"]') as HTMLElement | null;
    const region = document.querySelector('[role="region"]') as HTMLElement | null;
    if (section === null || region === null) {
      return null;
    }
    const sb = section.getBoundingClientRect();
    const rb = region.getBoundingClientRect();
    return {
      hasInsetRing: getComputedStyle(section).boxShadow.includes("inset"),
      sectionHeight: Math.round(sb.height),
      scrollHeight: section.scrollHeight,
      withinLeft: sb.left >= rb.left - 1,
      withinRight: sb.right <= rb.left + region.clientWidth + 1,
    };
  });

  expect(geo).not.toBeNull();
  // The flash is an INSET ring on the section (never an outset outline clipped at the scroll edge).
  expect(geo?.hasInsetRing).toBe(true);
  // The box hugs content — its rendered height is its own content height (no grid-stretch dead space).
  expect(Math.abs((geo?.sectionHeight ?? 0) - (geo?.scrollHeight ?? -1))).toBeLessThanOrEqual(2);
  expect(geo?.withinLeft).toBe(true);
  expect(geo?.withinRight).toBe(true);
});

// Header divider + top alignment (owner item 3): inside the real modal chrome, the `.shell-modal-header`
// hairline spans the FULL modal content width (not a nav-column orphan), and the nav's "User" heading
// starts at the SAME baseline as the pane's first section (the full-width search no longer offsets them).
test("the modal header divider spans the full content width and the columns share a top baseline", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  await mount(<SettingsModalStory />);
  await page.getByRole("heading", { name: "Message style" }).waitFor();

  const geo = await page.evaluate(() => {
    const popup = document.querySelector('[data-slot="dialog-popup"]') as HTMLElement | null;
    const header = document.querySelector(".shell-modal-header") as HTMLElement | null;
    const firstSection = document.querySelector('[id^="settings-anchor-appearance-"]') as HTMLElement | null;
    const userLabel = [...document.querySelectorAll("*")].find((n) => n.textContent === "User");
    if (popup === null || header === null || firstSection === null || userLabel === undefined) {
      return null;
    }
    const popupCS = getComputedStyle(popup);
    const contentWidth = popup.clientWidth - Number.parseFloat(popupCS.paddingLeft) - Number.parseFloat(popupCS.paddingRight);
    return {
      headerWidth: Math.round(header.getBoundingClientRect().width),
      contentWidth: Math.round(contentWidth),
      hasBorder: getComputedStyle(header).borderBottomWidth !== "0px",
      userTop: Math.round(userLabel.getBoundingClientRect().top),
      sectionTop: Math.round(firstSection.getBoundingClientRect().top),
    };
  });

  expect(geo).not.toBeNull();
  // The divider (header border) spans the full modal content box, not the nav column.
  expect(geo?.hasBorder).toBe(true);
  expect(Math.abs((geo?.headerWidth ?? 0) - (geo?.contentWidth ?? -1))).toBeLessThanOrEqual(2);
  // "User" (nav) and the first section (pane) start at the same baseline.
  expect(Math.abs((geo?.userTop ?? 0) - (geo?.sectionTop ?? -1))).toBeLessThanOrEqual(2);
});

// SCROLL-SPY, the no-scroll arm: a pane that FITS its column is at its top AND its bottom at once. The
// bottom arm used to win and light the LAST section while the reader is looking at the FIRST — a nav that
// lies about where you are. No scroll ⇒ the first section is current.
test("a pane that fits (no scroll) resolves the FIRST section, never the last", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellFitsStory />);
  await component.getByRole("heading", { name: "Message style" }).waitFor();

  // The premise: the pane region genuinely does not scroll in this box.
  const overflow = await page.evaluate(() => {
    const region = document.querySelector('[role="region"]') as HTMLElement | null;
    return region === null ? -1 : region.scrollHeight - region.clientHeight;
  });
  expect(overflow).toBeLessThanOrEqual(2);

  await expect(component.getByRole("button", { name: "Message style" })).toHaveAttribute("aria-current", "true");
  await expect(component.getByRole("button", { name: "Effects" })).not.toHaveAttribute("aria-current", "true");
});

// NAV LABEL ≠ HEADING (2026-08-01). "Message details & actions" does not fit the 220px
// (`--width-sidebar-sm`) nav column, so its subcategory declares a shorter `navLabel` — the NAV row is
// abbreviated, the section HEADING keeps the real name (a sidebar's width never renames a section). The
// full string still rides the row's native `title` tooltip (ListRow's `fullTitle`), so the abbreviation is
// recoverable on hover; pinned because a ListRow change that dropped the attribute would silently lose it.
test("a navLabel section shows the SHORT name in the nav, the FULL one in its heading + tooltip", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);
  await component.getByRole("heading", { name: "Message style" }).waitFor();

  const row = component.getByRole("navigation", { name: "Settings sections" }).locator('[data-slot="list-row-title"]', { hasText: "Message details" });
  await expect(row).toHaveText("Message details");
  await expect(row).toHaveAttribute("title", "Message details & actions");
  // The heading is untouched — the pane still calls the section by its real name.
  await expect(component.getByRole("heading", { name: "Message details & actions" })).toBeVisible();
});

// Search matches BOTH names (settings-search.ts merges `navLabel` into the entry's keywords): the reader who
// remembers the heading and the reader who read the abbreviated nav row must land on the same section.
test("search finds a navLabel section by its heading AND by its nav label", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);
  await component.getByRole("heading", { name: "Message style" }).waitFor();

  const search = component.getByRole("combobox", { name: "Search settings" });
  // The entry always READS as the full heading — only the matching accepts either spelling.
  const entry = component.getByRole("option", { name: "Message details & actions Appearance" });
  await search.fill("message details & actions");
  await expect(entry).toBeVisible();
  await search.fill("message details");
  await expect(entry).toBeVisible();
});

// The SWEEP: no nav row anywhere clips at the 220px column. A truncated row is unreadable at a glance, and
// the nav is the only place most of these names appear at all — so a section whose HEADING is genuinely
// longer than the column carries a shorter `navLabel` instead (the heading is never renamed to fit a
// sidebar). Every category is visited (owner viewer, so Admin's rows are swept too), because a pane's rows
// only render while it is active.
test("no nav row clips at the 220px column, in ANY category", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...SHELL_AMBIENT_ROUTES,
    "settings.getUserSettings": () => USER_SETTINGS_VIEW,
    "settings.getAppSettings": () => APP_CONFIG,
    "settings.getAppSettingsWithOverrides": () => ({ resolved: APP_CONFIG, overrides: {} }),
    "sessions.me": () => OWNER_VIEWER,
    "admin.listUsers": () => [],
    "admin.vllmEngines": () => ({}),
    "credentials.list": () => [],
    "connection.resolveChatCapability": () => makeResolvedChatCapability(),
  });
  const component = await mount(<SettingsShellStory />);
  const nav = component.getByRole("navigation", { name: "Settings sections" });
  await expect(component.getByRole("button", { name: "Admin" })).toBeVisible();

  // A CATEGORY row is the one with a leading icon; subcategory rows have none. The count is stable across
  // the sweep (expanding a category adds subcategory rows, never category rows).
  const categories = nav.locator('[data-slot="list-row-root"]:has([data-slot="list-row-leading"])');
  const total = await categories.count();
  const clipped: string[] = [];
  // biome-ignore-start lint/performance/noAwaitInLoops: the sweep is inherently sequential — only the ACTIVE pane's rows are in the DOM, so each category must be opened and measured before the next one is opened.
  for (let index = 0; index < total; index += 1) {
    await categories.nth(index).getByRole("button").click();
    // The click has landed once exactly one row is current (the pane's first section, or the section-less
    // category itself) — the rows to measure are painted by then.
    await expect(nav.locator('[aria-current="true"]')).toHaveCount(1);
    clipped.push(...(await readClippedNavLabels(page)));
  }
  // biome-ignore-end lint/performance/noAwaitInLoops: end of the sequential sweep.
  expect(total).toBeGreaterThan(5);
  expect([...new Set(clipped)]).toEqual([]);
});

// ── The NARROW arm (side-eye P0): push-detail, at the receipt's own 430×740 device ───────────────────
test.describe("narrow (430×740)", () => {
  test.use({ viewport: { width: 430, height: 740 } });

  test("the nav list owns the whole pane, and selecting a section PUSHES the pane over it", async ({ mount, page }) => {
    await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
    const component = await mount(<SettingsShellNarrowStory />);
    await expect(component.getByRole("button", { name: "Appearance" })).toBeVisible();

    // The LIST view: the nav fills the row, the pane column is not painted at all (the stacked arm gave it
    // a 60px window instead).
    const list = await readSettingsShellColumns(page);
    expect(list.navPainted).toBe(true);
    expect(list.contentPainted).toBe(false);
    expect(list.navWidth).toBe(list.rowWidth);

    // Selecting a section pushes the DETAIL over the list, with a back row.
    await component.getByRole("button", { name: "Avatars" }).click();
    const detail = await readSettingsShellColumns(page);
    expect(detail.navPainted).toBe(false);
    expect(detail.contentPainted).toBe(true);
    expect(detail.contentWidth).toBe(detail.rowWidth);
    await expect(component.getByRole("button", { name: "Back to settings sections" })).toBeVisible();

    // …and back returns to the list.
    await component.getByRole("button", { name: "Back to settings sections" }).click();
    const back = await readSettingsShellColumns(page);
    expect(back.navPainted).toBe(true);
    expect(back.contentPainted).toBe(false);
    await expect(component.getByRole("button", { name: "Back to settings sections" })).toBeHidden();
  });

  // The P0 receipt itself: the pushed pane's FIRST CONTROL was off-screen at y=754 in a 740px viewport.
  test("the pushed pane's first control is on-screen", async ({ mount, page }) => {
    await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
    const component = await mount(<SettingsShellNarrowStory />);
    await component.getByRole("button", { name: "Appearance" }).click();

    const region = component.getByRole("region", { name: "Appearance settings" });
    const firstControl = region.locator("button, input, select, textarea").first();
    await expect(firstControl).toBeInViewport();
    const box = await firstControl.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(740);
  });

  // A search jump has to land in the DETAIL view too — it names a destination, so it pushes.
  test("a search jump pushes the detail into view", async ({ mount, page }) => {
    await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": () => USER_SETTINGS_VIEW });
    const component = await mount(<SettingsShellNarrowStory />);
    await expect(component.getByRole("button", { name: "Appearance" })).toBeVisible();

    await component.getByRole("combobox", { name: "Search settings" }).fill("avatar size");
    await component.getByRole("option", { name: "Avatar size" }).first().click();

    await expect(component.getByRole("heading", { name: "Avatars" })).toBeInViewport();
    const columns = await readSettingsShellColumns(page);
    expect(columns.navPainted).toBe(false);
    expect(columns.contentPainted).toBe(true);
  });
});
