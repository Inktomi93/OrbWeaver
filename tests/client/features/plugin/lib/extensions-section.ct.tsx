// CT: the EXTENSIONS rail section — the platform's full-page home (plugin-ui-plane #679 U5, §4.5b/§9, seam 16)
// — over the REAL section registry with a stubbed network. The subjects are `registry.get("extensions").list()`
// and `.content()`, the exact calls the shell makes, so what is pinned is the production path.
//
// THE OWNER'S U5 TESTS, the two this file owns:
//   * "a plugin registers a page and it appears behind the Extensions rail entry's switcher" — a `page`-anchored
//     surface becomes a plugin-labelled row, and picking it renders the page.
//   * "zero pages ⇒ the teaching empty" — with an action, because a dead-end empty is what makes the whole
//     platform undiscoverable (the section ships rail-VISIBLE precisely so this state teaches).
//
// AND THE ONE §9 SAYS IS LOAD-BEARING: THE PINNED ATTRIBUTION BAND. A full page is the biggest impersonation
// canvas in this design — a page can draw a convincing fake settings screen entirely out of house primitives,
// because house primitives are what it is made of. So the band's presence is pinned ON EVERY PAGE (both pages
// of a two-page roster, not one), and it is pinned to carry the plugin's NAME and the "Extension" kicker: a
// band that rendered without the name would be the wall reporting green while doing nothing.

import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ExtensionsPageStory, ExtensionsSwitcherStory } from "../_ct-stories.tsx";

const A_PAST_INSTANT = 1_760_000_000_000;
const ORACLE_ID = castId<PluginId>("plugin_ct_oracle00000001");
const CHIPS_ID = castId<PluginId>("plugin_ct_chips000000001");

/** One installed row as `plugin.list` projects it — the join every plugin surface reads its NAME from.
 *  `lifecycle` is the LIVE half: `status`/`grantedCapabilities`/`reconsentPending` are the three fields the
 *  Extensions empty resolves its reason from, so an arm states them rather than inheriting a default. */
function pluginRow(id: PluginId, slug: string, name: string, lifecycle: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    slug,
    name,
    version: "1.0.0",
    status: "enabled",
    origin: "upload",
    declaredCapabilities: ["ui.surface"],
    grantedCapabilities: ["ui.surface"],
    netHosts: null,
    reconsentPending: false,
    widenedNetHosts: [],
    builtAgainst: null,
    lastError: null,
    installedAt: A_PAST_INSTANT,
    updatedAt: A_PAST_INSTANT,
    ...lifecycle,
  };
}

/** The FRESH-BOOT lifecycle, verbatim from `entry/boot/seed-example-plugins.ts`: installed, disabled, NOTHING
 *  granted, with the standing consent ask raised. This is the shape the dev db actually holds for all nine
 *  seeded examples (#924) — the state the pane used to describe as "install a plugin". */
const SEEDED_AWAITING_CONSENT = { status: "disabled", grantedCapabilities: [], reconsentPending: true } as const;

/** One `listSurfaces` row (the serializable meta + its pluginId; the `onAction` handle stays server-side). */
function pageRow(pluginId: PluginId, id: string, title: string, spec: unknown): Record<string, unknown> {
  return { pluginId, id, anchor: "page", title, tier: "static", spec };
}

const DECK_SPEC = { kind: "stack", gap: "block", children: [{ kind: "text", value: { $state: "status" }, voice: "label" }] };
const CHIPS_SPEC = { kind: "stack", gap: "block", children: [{ kind: "text", value: "Scene chips live here.", voice: "body" }] };

const TWO_PAGES: Readonly<Record<string, unknown>> = {
  "plugin.list": () => [pluginRow(ORACLE_ID, "oracle-deck", "Oracle Deck"), pluginRow(CHIPS_ID, "scene-chips", "Scene Chips")],
  "plugin.listSurfaces": () => [pageRow(ORACLE_ID, "deck_page", "The Deck", DECK_SPEC), pageRow(CHIPS_ID, "chips_page", "Chips", CHIPS_SPEC)],
  "plugin.getSurfaceState": () => ({ status: "Session open · 2 dealt" }),
};

const NO_PAGES: Readonly<Record<string, unknown>> = {
  // INSTALLED AND ENABLED but registering no `page` surface — the common case for everyone who has a plugin at
  // all, and the arm where a rail entry that only ever showed a full list would teach nothing.
  "plugin.list": () => [pluginRow(ORACLE_ID, "oracle-deck", "Oracle Deck")],
  "plugin.listSurfaces": () => [],
};

/** NOTHING INSTALLED — the only account for which "install a plugin" is true guidance. */
const NONE_INSTALLED: Readonly<Record<string, unknown>> = {
  "plugin.list": () => [],
  "plugin.listSurfaces": () => [],
};

/** THE FRESH BOOT (#924): two installed rows, neither allowed to do anything, both asking. */
const AWAITING_CONSENT: Readonly<Record<string, unknown>> = {
  "plugin.list": () => [
    pluginRow(ORACLE_ID, "oracle-deck", "Oracle Deck", SEEDED_AWAITING_CONSENT),
    pluginRow(CHIPS_ID, "scene-chips", "Scene Chips", SEEDED_AWAITING_CONSENT),
  ],
  "plugin.listSurfaces": () => [],
};

/** A PLUGIN DIED (#1865): granted and meant to be running, but its activation failed, so the row is
 *  `errored` and it registers nothing. The second row is `disabled` on purpose — without the fifth arm this
 *  exact shape satisfies `all-off`'s "nothing is enabled" predicate and the pane blames the reader for a
 *  failure that was ours. */
const SOME_ERRORED: Readonly<Record<string, unknown>> = {
  "plugin.list": () => [
    pluginRow(ORACLE_ID, "oracle-deck", "Oracle Deck", { status: "errored", lastError: "registration failed: unsupported JSON Schema construct" }),
    pluginRow(CHIPS_ID, "scene-chips", "Scene Chips", { status: "disabled" }),
  ],
  "plugin.listSurfaces": () => [],
};

/** GRANTED, BUT SWITCHED OFF — nothing is asking and nothing is running, so nothing registers. */
const ALL_OFF: Readonly<Record<string, unknown>> = {
  "plugin.list": () => [pluginRow(ORACLE_ID, "oracle-deck", "Oracle Deck", { status: "disabled" })],
  "plugin.listSurfaces": () => [],
};

test.describe("the page switcher", () => {
  test("arrival focus lands on the named Extensions list region", async ({ mount, page }) => {
    await routeTrpc(page, TWO_PAGES);
    // A section switch starts with focus on the rail control that activated it. Keep that precondition
    // outside the CT mount root so mounting the destination cannot erase it back to <body> first.
    await page.evaluate(() => {
      const origin = document.createElement("button");
      origin.dataset["focusOrigin"] = "extensions";
      document.body.append(origin);
      origin.focus();
    });
    await expect(page.locator('[data-focus-origin="extensions"]')).toBeFocused();
    const section = await mount(<ExtensionsSwitcherStory />);

    const destination = page.getByRole("region", { name: "Extension pages" });
    await expect(destination).toBeFocused();
    await expect(destination).toHaveAccessibleName("Extension pages");
    await expect(section.getByRole("button", { name: /The Deck.*Oracle Deck/u })).toBeVisible();
  });

  test("a registered `page` surface becomes a PLUGIN-LABELLED row (one per page, across plugins)", async ({ mount, page }) => {
    await routeTrpc(page, TWO_PAGES);
    await mount(<ExtensionsSwitcherStory />);

    const rows = page.getByRole("button", { name: /The Deck|Chips/u });
    await expect(rows).toHaveCount(2);
    // THE ATTRIBUTION IS IN THE ACCESSIBLE NAME, not just beside it: two plugins may both register a page called
    // "Browse", and a list of identically-named rows is unusable by voice and ambiguous by eye. The plugin name
    // is the row's disambiguator AND its subtitle.
    await expect(page.getByRole("button", { name: /The Deck.*Oracle Deck/u })).toBeVisible();
    await expect(page.getByRole("button", { name: /Chips.*Scene Chips/u })).toBeVisible();
  });

  test("a row whose page title equals its plugin name is not doubled (P3-7)", async ({ mount, page }) => {
    // The qualifier/subtitle exist to ATTRIBUTE the page to its plugin — when the two strings are equal the
    // attribution is already the title, and "Card Atlas" over a "Card Atlas" subtitle (spoken twice by AT)
    // is noise, not disambiguation.
    await routeTrpc(page, {
      "plugin.list": () => [pluginRow(ORACLE_ID, "oracle-deck", "Oracle Deck")],
      "plugin.listSurfaces": () => [pageRow(ORACLE_ID, "deck_page", "Oracle Deck", DECK_SPEC)],
    });
    await mount(<ExtensionsSwitcherStory />);

    const row = page.getByRole("button", { name: "Oracle Deck" });
    await expect(row).toBeVisible();
    await expect(row.getByText("Oracle Deck")).toHaveCount(1);
  });

  test("ZERO pages ⇒ the TEACHING empty, with the action that leads to installing one", async ({ mount, page }) => {
    await routeTrpc(page, NO_PAGES);
    await mount(<ExtensionsSwitcherStory />);

    await expect(page.getByText("No extension pages yet")).toBeVisible();
    await expect(page.getByText("Install a plugin with page surfaces and it will appear here.")).toBeVisible();
    // `empty-state-has-action` is the law; this is the RENDERED half of it — a dead-end empty here would make
    // the whole platform undiscoverable for anyone who has never installed a page-bearing plugin.
    await expect(page.getByRole("button", { name: "Open Plugins" })).toBeVisible();
  });
});

// #924 — WHICH empty is a fact about the ASKER, and the four facts have four different next steps. One string
// used to serve all of them, and on a FRESH BOOT (nine seeded plugins, all disabled with an empty grant and a
// standing ask) that string told a person to install what they already had, while the grant screen that would
// have made them work went unmentioned. Each arm below pins the FACT and the affordance that resolves it.
test.describe("the teaching empty names WHICH emptiness", () => {
  test("NOTHING INSTALLED ⇒ say so, and offer the install screen", async ({ mount, page }) => {
    await routeTrpc(page, NONE_INSTALLED);
    await mount(<ExtensionsSwitcherStory />);

    await expect(page.getByText("No plugins installed yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add a plugin" })).toBeVisible();
    // The old collapse: an account with nothing installed and an account with nine ungranted plugins read
    // identically. It must not be the page-surfaces line any more.
    await expect(page.getByText("No extension pages yet")).toHaveCount(0);
  });

  test("INSTALLED BUT AWAITING CONSENT ⇒ the fresh-boot fact, counted, pointing at the grant", async ({ mount, page }) => {
    await routeTrpc(page, AWAITING_CONSENT);
    await mount(<ExtensionsSwitcherStory />);

    await expect(page.getByText("Your plugins are waiting on you")).toBeVisible();
    // COUNTED, because "some plugins" is the same shrug the old copy was. Two rows asking ⇒ "2 plugins are".
    await expect(page.getByText(/2 plugins are installed but not allowed to do anything yet/u)).toBeVisible();
    // The two lies this arm replaces.
    await expect(page.getByText("No extension pages yet")).toHaveCount(0);
    await expect(page.getByText("No plugins installed yet")).toHaveCount(0);
  });

  // ── #1699: THE ARM THAT NAMES ITS PLUGINS (side-eye 2026-09-05) ─────────────────────────────────────
  // #924 made this arm state the right FACT, and it stopped there: nine installed plugins rendered as ONE
  // `button "Review what they ask for"` — the only map row on the surface with no semantic identity. A
  // first-timer landing here could not name a single thing they had installed. The fact and the count are
  // unchanged (pinned above); what is added is the identity: every waiting plugin is on screen by NAME,
  // wearing its own consent state, behind its own CTA.

  test("#1699 every waiting plugin is on screen by NAME, wearing its consent state", async ({ mount, page }) => {
    await routeTrpc(page, AWAITING_CONSENT);
    const component = await mount(<ExtensionsSwitcherStory />);

    // The row TITLE, exactly — the per-plugin CTA below it also contains the name, which is the point of it.
    await expect(component.getByText("Oracle Deck", { exact: true })).toBeVisible();
    await expect(component.getByText("Scene Chips", { exact: true })).toBeVisible();
    // STATE IS TEXT, NEVER A VOICE (#1169) — the same `statusCopy` badge the Plugins screen paints for the
    // same row, so the two surfaces cannot spell one plugin's state two ways.
    await expect(component.getByText("Off — asked for more than you allowed")).toHaveCount(2);
  });

  test("#1699 the CTA names its plugin, and the anonymous one is gone", async ({ mount, page }) => {
    await routeTrpc(page, AWAITING_CONSENT);
    const component = await mount(<ExtensionsSwitcherStory />);

    await expect(component.getByRole("button", { name: "Review what Oracle Deck asks for" })).toBeVisible();
    await expect(component.getByRole("button", { name: "Review what Scene Chips asks for" })).toBeVisible();
    // The finding itself: one unnamed door standing in for nine plugins.
    await expect(component.getByRole("button", { name: "Review what they ask for" })).toHaveCount(0);
  });

  test("GRANTED BUT SWITCHED OFF ⇒ turn one on, not install another", async ({ mount, page }) => {
    await routeTrpc(page, ALL_OFF);
    await mount(<ExtensionsSwitcherStory />);

    await expect(page.getByText("Your plugins are turned off")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Plugins" })).toBeVisible();
    await expect(page.getByText("No extension pages yet")).toHaveCount(0);
  });

  test("A PLUGIN THAT DIED ⇒ say it failed, never 'you turned them off' or 'go install one' (#1865)", async ({ mount, page }) => {
    await routeTrpc(page, SOME_ERRORED);
    await mount(<ExtensionsSwitcherStory />);

    await expect(page.getByText("A plugin failed to start")).toBeVisible();
    await expect(page.getByRole("button", { name: "See what went wrong" })).toBeVisible();
    // NON-VACUOUS, and the whole point of the arm: both wrong answers this shape used to produce are gone.
    // The `errored`+`disabled` mix satisfies `all-off`'s predicate, and one enabled sibling would have
    // produced `no-pages` instead — so the two are asserted absent, not merely unasserted.
    await expect(page.getByText("Your plugins are turned off")).toHaveCount(0);
    await expect(page.getByText("No extension pages yet")).toHaveCount(0);
  });

  test("the CONTENT pane mirrors the SAME reason — two panes never state two facts", async ({ mount, page }) => {
    // The P3-6 mirror generalized: it is not enough that both panes show *an* empty, they must show the same
    // one. A LIST saying "waiting on you" beside a CONTENT pane saying "install a plugin" is the original
    // defect with an extra step.
    await routeTrpc(page, AWAITING_CONSENT);
    const component = await mount(<ExtensionsPageStory selectKey={null} />);

    await expect(page.getByText("Your plugins are waiting on you")).toBeVisible();
    // #1699 — the mirror is of the WHOLE arm, identity included: the CONTENT pane names the same plugins
    // behind the same per-plugin doors. A CONTENT pane that kept the anonymous CTA would re-open the
    // two-panes-two-stories defect this mirror exists to close, one level down.
    await expect(component.getByRole("button", { name: "Review what Oracle Deck asks for" })).toBeVisible();
    await expect(component.getByRole("button", { name: "Review what Scene Chips asks for" })).toBeVisible();
    await expect(component.getByRole("button", { name: "Review what they ask for" })).toHaveCount(0);
    await expect(page.getByText("No extension pages yet")).toHaveCount(0);
    await expect(page.getByText("Pick an extension page")).toHaveCount(0);
  });
});

test.describe("the page-scale shell", () => {
  test("THE ATTRIBUTION BAND IS PRESENT ON EVERY PAGE — name, and the 'Extension' kicker (§9)", async ({ mount, page }) => {
    await routeTrpc(page, TWO_PAGES);

    // Page one.
    const first = await mount(<ExtensionsPageStory selectKey={`${ORACLE_ID}:deck_page`} />);
    const band = page.getByTestId("plugin-page-attribution");
    await expect(band).toBeVisible();
    await expect(band).toContainText("Oracle Deck");
    await expect(band).toContainText("The Deck");
    await expect(band).toContainText("Extension");
    // …and the page's own body rendered beneath it, bound to the plugin's published state.
    await expect(page.getByText("Session open · 2 dealt")).toBeVisible();
    await first.unmount();

    // Page TWO — the band is pinned on EVERY page, not on the one the first test happened to open. A wall that
    // holds for one page and not the next is not a wall.
    await mount(<ExtensionsPageStory selectKey={`${CHIPS_ID}:chips_page`} />);
    const secondBand = page.getByTestId("plugin-page-attribution");
    await expect(secondBand).toBeVisible();
    await expect(secondBand).toContainText("Scene Chips");
    await expect(secondBand).toContainText("Extension");
  });

  test("NO SELECTION reads differently from NO PAGES — 'pick one' and 'there are none' are different facts", async ({ mount, page }) => {
    await routeTrpc(page, TWO_PAGES);
    await mount(<ExtensionsPageStory selectKey={null} />);
    // Two pages exist; nothing is picked. Collapsing this into the install-a-plugin empty would tell a person
    // with two extensions installed that they have none.
    await expect(page.getByText("Pick an extension page")).toBeVisible();
    await expect(page.getByText("No extension pages yet")).toHaveCount(0);
    // …and no band, because no page is being attributed.
    await expect(page.getByTestId("plugin-page-attribution")).toHaveCount(0);
  });

  test("ZERO pages + no selection ⇒ the CONTENT pane mirrors the teaching empty, never 'pick one on the left' (P3-6)", async ({ mount, page }) => {
    // The contradictory double empty-state (side-eye 2026-08-29): with no pages registered the LIST said
    // "No extension pages yet" while this pane said "Choose a page on the left" — telling a first-timer to
    // pick from a list that is itself explaining there is nothing to pick. The mirror reuses the LIST's own
    // copy constants, so the two panes cannot drift apart.
    await routeTrpc(page, NO_PAGES);
    await mount(<ExtensionsPageStory selectKey={null} />);

    await expect(page.getByText("No extension pages yet")).toBeVisible();
    await expect(page.getByText("Install a plugin with page surfaces and it will appear here.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Plugins" })).toBeVisible();
    await expect(page.getByText("Pick an extension page")).toHaveCount(0);
  });

  test("a page titled exactly like its plugin says the name ONCE in the band (P3-7)", async ({ mount, page }) => {
    // "Card Atlas · Card Atlas" read as a placeholder bug and wasted the title line. The wall loses
    // nothing: the band's job is the plugin's NAME, which still renders — only the redundant echo goes,
    // and the kicker still names the class.
    await routeTrpc(page, {
      "plugin.list": () => [pluginRow(ORACLE_ID, "oracle-deck", "Oracle Deck")],
      "plugin.listSurfaces": () => [pageRow(ORACLE_ID, "deck_page", "Oracle Deck", DECK_SPEC)],
      "plugin.getSurfaceState": () => ({ status: "Session open · 2 dealt" }),
    });
    await mount(<ExtensionsPageStory selectKey={`${ORACLE_ID}:deck_page`} />);

    const band = page.getByTestId("plugin-page-attribution");
    await expect(band).toBeVisible();
    await expect(band).toContainText("Extension");
    await expect(band.getByText("Oracle Deck")).toHaveCount(1);
    await expect(band.getByText("·")).toHaveCount(0);
  });

  test("a page whose plugin went away renders the honest GONE line, never a blank pane", async ({ mount, page }) => {
    await routeTrpc(page, NO_PAGES);
    // The drill outlived its page (the plugin was disabled while it was open). The store is ephemeral and never
    // self-heals by writing — it just stops resolving until the person picks again (D138 rule 2).
    await mount(<ExtensionsPageStory selectKey={`${ORACLE_ID}:deck_page`} />);
    await expect(page.getByText("That page is no longer available")).toBeVisible();
    await expect(page.getByTestId("plugin-page-attribution")).toHaveCount(0);
  });
});
