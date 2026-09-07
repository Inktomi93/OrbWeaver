// CT: ConfigGroupPlaceholder (#696) — the honest "not built yet" body for a config group whose sections
// haven't landed. It lost its last PRODUCTION subject at C5 (cb8026bfc turned the final
// `{ placeholder: true }` group — automation — into a real surface), so the host's placeholder branch
// (config-content-surface.tsx `GroupBody`) renders for nobody today. The mechanism is deliberate scaffolded
// intent (the `body: { placeholder: true }` arm of the §3.1 union and the render branch guard it), so
// rather than delete future intent it earns a live subject: `ConfigHostStory placeholder` mounts the REAL
// host over a group registry where ONE group (connections) carries a placeholder body — production groups
// untouched (`ctPlaceholderConfigGroups`).
//
// This drives the PRODUCTION path: the host resolves the deferred group, hits the placeholder branch,
// and mounts the teaching copy — the group's own label + distinct description + the "Not built yet" chip
// ([[empty-states-are-load-bearing]] — a status, never a generic sparkle, and never a dead-end CTA).
//
// AND IT DRIVES THE OTHER HALF OF THE SAME ARM (#925 owner ruling 2026-09-02, #1043): feature status lives
// in the LIST — a genuinely unbuilt group is a GREYED row there that still works as a door — and there is no
// status region in CONTENT any more. The two halves are one claim about one arm, so they are pinned in one
// file: the band says "Not built yet" in WORDS (never colour alone), it is quieter than its live siblings,
// and it opens the coming-soon body on activation.
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ConfigHostStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = { userId: "user_ct_placeholder", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };
// A plain user — the placeholder group (connections) is un-gated, so this only feeds the LIST's
// admin-gating projection; the deep link lands straight on the placeholder group, so no real group mounts.
const VIEWER_ROUTE: Readonly<Record<string, unknown>> = {
  "sessions.me": { userId: SETTINGS_VIEW.userId, handle: "ct_placeholder", globalRole: "user" },
  "settings.getUserSettings": () => SETTINGS_VIEW,
  // THE ARRIVAL DEFAULT MOUNTS A REAL GROUP (#925): a host mounted with no deep link now lands on the first
  // group (Appearance), whose Looks section reads the theme library — so this file's mounts exercise that
  // pipeline whether or not they are about it, and an unfed read would run it inert.
  "settings.listThemes": () => [],
  // The LIST paints every shelf, so the four collection bands read their rosters for the counts — fed empty
  // (the honest fresh-library arm) rather than left to routeTrpc's inert null.
  "tag.listTagsWithUsage": [],
  "regex.listScripts": [],
  "worldInfo.listBooksWithUsage": [],
  "rosterPreset.list": [],
};

test("a deferred category renders the teaching placeholder: its distinct copy + the 'Not built yet' chip", async ({ mount, page }) => {
  await routeTrpc(page, VIEWER_ROUTE);
  const component = await mount(<ConfigHostStory placeholder={true} target="connections" />);

  // The deep link landed on the placeholder group — the CONTENT region is labelled by its own group label.
  const region = component.getByRole("region", { name: "Connections settings" });
  await expect(region).toBeVisible();

  // The placeholder body's tell: it says "not built yet" IN WORDS (the chip), so a deferred pane can never be
  // mistaken for a real pane whose controls FAILED to render.
  await expect(region.getByText("Not built yet")).toBeVisible();
  // …with the category's OWN distinct copy (its ConfigGroupDefinition description), never a generic sparkle.
  await expect(region.getByText("Provider credentials and the per-role model connections.")).toBeVisible();
  // …titled by the group's own label (scoped to the region — the LIST band carries the same word).
  await expect(region.getByText("Connections", { exact: true })).toBeVisible();
});

/** The LIST band of the deferred group, and of a LIVE sibling on the same shelf — the pair the greyed
 *  treatment is a claim about (a "quieter" row is only quieter than something). */
const DEFERRED_BAND = '[data-slot="config-band"][data-config-group="connections"]';
const LIVE_BAND = '[data-slot="config-band"][data-config-group="automation"]';
/** The LIST landmark, named by the host. */
const LIST_REGION = '[data-slot="config-list"]';

test("the LIST says a group is unbuilt — in WORDS, on a row that still works as a door", async ({ mount, page }) => {
  await routeTrpc(page, VIEWER_ROUTE);
  const component = await mount(<ConfigHostStory placeholder={true} />);

  const band = component.locator(DEFERRED_BAND);
  // IN WORDS, and inside the band's own accessible NAME: a status a screen reader cannot hear is half a
  // status, and this row is the only place the surface still says "Not built yet" at all (#1043 — the
  // CONTENT-side band that used the same phrase for a library the user simply had not FILLED is gone).
  await expect(band).toHaveAccessibleName(/Not built yet/);
  await expect(band.getByText("Not built yet")).toBeVisible();
  // …AS TWO WORDS, NOT ONE TOKEN. HONESTLY LABELLED: this is a FENCE, not a defect proof — it was GREEN
  // before #1169 touched anything (run red-first against the unmodified source), because the marker's box
  // has always been non-inline enough for the accessible-name computation to insert the separator itself.
  // #1214-1's welding defect was real on the MODIFIED marker and is fixed there by a stated `aria-label`;
  // the assumption that this arm shared it was measured and refused. What this pins is the REGRESSION
  // SURFACE the #1169 voice budget opened: the marker's box changed (kicker text → `Badge`), and a box
  // change is exactly what can weld a name. The regex above cannot tell the two spellings apart; this can.
  await expect(band).toHaveAccessibleName("Connections Not built yet");
  // NEVER COLOUR ALONE, but colour too: the row is quieter than a live sibling, and the pin is the DELTA
  // between two real bands rather than a remembered token value.
  const [deferred, live] = await Promise.all([
    band.evaluate((el: Element) => getComputedStyle(el).color),
    component.locator(LIVE_BAND).evaluate((el: Element) => getComputedStyle(el).color),
  ]);
  expect(deferred, "the unbuilt row is not painted like a live one").not.toBe(live);
  // AND IT IS STILL A DOOR (the whole ruling): clicking it lands the coming-soon body in CONTENT.
  await band.click();
  const region = component.getByRole("region", { name: "Connections settings" });
  await expect(region.getByText("Not built yet")).toBeVisible();
  await expect(region.getByText("Provider credentials and the per-role model connections.")).toBeVisible();
});

test("a BUILT group's row says nothing about readiness — the LIST greys only the unbuilt arm", async ({ mount, page }) => {
  await routeTrpc(page, VIEWER_ROUTE);
  const component = await mount(<ConfigHostStory placeholder={true} />);

  // The classification receipt in one assertion (#1043): every other group in the registry is BUILT, so
  // exactly ONE row in the whole LIST wears the marker — including the four collections, whose EMPTY
  // libraries are the misread this row exists to prevent.
  await expect(component.locator(LIST_REGION).getByText("Not built yet")).toHaveCount(1);
  await expect(component.locator('[data-slot="config-band"][data-config-group="regex"]')).toHaveAccessibleName(/^Regex scripts/);
  await expect(component.locator('[data-slot="config-band"][data-config-group="regex"]')).not.toHaveAccessibleName(/Not built yet/);
});
