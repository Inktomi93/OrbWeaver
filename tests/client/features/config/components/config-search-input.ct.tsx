// CT: the Settings SEARCH (#866 S2) — the typed-`@` search riding the
// LIST scroller's top, over the REAL door registries (`ConfigHostStory`). Drives the production seam: the
// static index (groups · sections · leaves), the DYNAMIC member rows (a collection's members through its own
// `useSearchRows` fiber), the token menu, the narrowing, the marked hits, and the JUMP — a selected hit
// deep-links through `openConfigTo` and the CONTENT pane lands on the section's own anchor.
//
// The three MOVED-LEAF pins from the retired shell's search live here now (their `deletions` receipts name
// this file): an ABSORBED appearance leaf ("Reduce motion" — its `motion` sub merged into Sizing & motion)
// still jumps to a live anchor; a MOVED chat-behavior leaf ("Custom stopping strings") still lands on
// message-handling; the admin leaves stay invisible to a plain viewer (`when` parity — one predicate, three
// consumers).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { hitExtent, resolveSpacingPx } from "../../../../support/browser/touch-floor.ts";
import type { TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ConfigHostStory } from "../_ct-stories.tsx";

const USER_SETTINGS_VIEW = {
  userId: "user_ct_search",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS,
  configUnreadable: null,
  updatedAt: 0,
} satisfies TrpcWireOutput<"settings.getUserSettings">;

/** EXACTLY ONE SETTING CHANGED, the live drive's own case (#1099 F16): `appearance.chatStyle` off its
 *  `bubble` default. Its section (Message style) owns two other leaves that are still at their defaults —
 *  which is the whole point: the defect was that a section-grain verdict answered for every leaf under it,
 *  so one changed setting returned five rows and three of them were untouched. */
const MODIFIED_SETTINGS_VIEW = {
  ...USER_SETTINGS_VIEW,
  config: { ...DEFAULT_USER_SETTINGS, appearance: { ...DEFAULT_USER_SETTINGS.appearance, chatStyle: "flat" } },
} satisfies TrpcWireOutput<"settings.getUserSettings">;

/** One tag, so a MEMBER row exists for the dynamic-rows pin. */
const TAG = {
  id: "tag_ct_search00000001",
  name: "slice-of-life",
  color: null,
  color2: null,
  source: null,
  folderType: "NONE",
  sortOrder: 0,
  isHiddenOnCard: false,
  usage: { characters: 1, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 1 },
} satisfies TrpcWireOutput<"tag.listTagsWithUsage">[number];

const AMBIENT = {
  "sessions.me": { userId: USER_SETTINGS_VIEW.userId, handle: "ct_search", globalRole: "user" },
  "settings.getUserSettings": (): typeof USER_SETTINGS_VIEW => USER_SETTINGS_VIEW,
  // The Looks section (#866 S4) reads the theme library the moment the appearance group mounts.
  "settings.listThemes": (): TrpcWireOutput<"settings.listThemes"> => [],
  "tag.listTagsWithUsage": [TAG],
  "regex.listScripts": [],
  "worldInfo.listBooksWithUsage": [],
  "rosterPreset.list": [],
  "persona.list": [],
} satisfies TrpcRoutes<
  | "sessions.me"
  | "settings.getUserSettings"
  | "settings.listThemes"
  | "tag.listTagsWithUsage"
  | "regex.listScripts"
  | "worldInfo.listBooksWithUsage"
  | "rosterPreset.list"
  | "persona.list"
>;

async function stub(page: Page, getUserSettings: () => TrpcWireOutput<"settings.getUserSettings"> = AMBIENT["settings.getUserSettings"]): Promise<void> {
  await routeTrpc(page, { ...AMBIENT, "settings.getUserSettings": getUserSettings });
}

test("aria-expanded follows the LIST's existence: collapsed at rest, true with a query, back when cleared", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  const search = component.getByRole("combobox", { name: "Search settings" });
  await expect(search).toHaveAttribute("aria-expanded", "false");
  await expect(component.getByRole("listbox")).toHaveCount(0);

  await search.fill("avatar size");
  await expect(component.getByRole("listbox")).toHaveCount(1);
  await expect(search).toHaveAttribute("aria-expanded", "true");

  await search.fill("");
  await expect(component.getByRole("listbox")).toHaveCount(0);
  await expect(search).toHaveAttribute("aria-expanded", "false");
});

test("typing `@` opens the TOKEN MENU and a pick completes the token in place; the funnel does the same", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);
  const search = component.getByRole("combobox", { name: "Search settings" });

  await search.fill("@");
  await expect(component.getByRole("option", { name: /@modified/ })).toBeVisible();
  await expect(component.getByRole("option", { name: /@shelf:/ })).toBeVisible();
  await component.getByRole("option", { name: /@shelf:/ }).click();
  await expect(search).toHaveValue("@shelf:");

  // The FUNNEL is the same door for a reader who doesn't know the grammar.
  await search.fill("");
  await component.getByRole("button", { name: "Add a search filter" }).click();
  await expect(component.getByRole("option", { name: /@modified/ })).toBeVisible();
});

test("a hit jumps: the selected section's anchor lands in the CONTENT pane, marked label and all", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);
  const search = component.getByRole("combobox", { name: "Search settings" });

  await search.fill("avatar size");
  const hit = component.getByRole("option", { name: /Avatar size/ });
  await expect(hit).toBeVisible();
  // The hit shows WHY it matched — a real <mark> inside the row label (§3.3 hits-in-place).
  await expect(hit.locator("mark").first()).toHaveText(/avatar/i);
  await hit.click();

  await expect(component.getByRole("region", { name: "Appearance settings" })).toBeVisible();
  await expect(component.locator("#config-anchor-appearance-avatars")).toBeInViewport();
  // The query SURVIVES the jump (marks live for the life of the query) — clearing is the reader's act.
  await expect(search).toHaveValue("avatar size");
});

// The shelf token, driven in BOTH directions over TWO rows that sit on different shelves — a one-row probe
// passes on a filter that drops everything. The rows were re-picked at the `@orb/inference` cut-over
// (2026-09-20): Connections moved from the `app` shelf to `user` (every row is the member's own now,
// §5.3a), so "Model roles" is the USER-shelf row and Automation's "Library-wide rules" is the APP-shelf one.
// A plain viewer is mounted here, so Admin — the only other `app` group — is invisible by `when` parity.
test("@shelf:… narrows to that shelf; the other shelf's rows drop out", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);
  const search = component.getByRole("combobox", { name: "Search settings" });
  const userShelfRow = component.getByRole("option", { name: /Model roles/ });
  const appShelfRow = component.getByRole("option", { name: /Library-wide rules/ });

  await search.fill("model roles");
  await expect(userShelfRow).toBeVisible();
  await search.fill("@shelf:user model roles");
  await expect(userShelfRow).toBeVisible();
  await search.fill("@shelf:app model roles");
  await expect(userShelfRow).toHaveCount(0);

  await search.fill("library-wide rules");
  await expect(appShelfRow).toBeVisible();
  await search.fill("@shelf:app library-wide rules");
  await expect(appShelfRow).toBeVisible();
  await search.fill("@shelf:user library-wide rules");
  await expect(appShelfRow).toHaveCount(0);
});

test("a COLLECTION MEMBER is found by name (the dynamic `useSearchRows` fiber) and opens as the member", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);
  const search = component.getByRole("combobox", { name: "Search settings" });

  await search.fill("slice-of-life");
  const hit = component.getByRole("option", { name: /slice-of-life/ });
  await expect(hit).toBeVisible();
  await hit.click();
  // The member's own editor takes the CONTENT pane (C-7: mounted, never a dialog).
  await expect(component.getByRole("region", { name: "Settings", exact: true })).toBeVisible();
});

test("an ABSORBED leaf still jumps to a LIVE anchor — 'Reduce motion' lands on Sizing & motion", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  await component.getByRole("combobox", { name: "Search settings" }).fill("reduce motion");
  const hit = component.getByRole("option", { name: /Reduce motion/ });
  await expect(hit).toBeVisible();
  await hit.click();
  await expect(component.locator("#config-anchor-appearance-sizing")).toBeInViewport();
  await expect(component.getByRole("switch", { name: "Reduce motion" })).toBeVisible();
});

test("a MOVED leaf still jumps — 'stopping strings' lands on chat-behavior's message handling", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  await component.getByRole("combobox", { name: "Search settings" }).fill("stopping strings");
  const hit = component.getByRole("option", { name: /stopping strings/i }).first();
  await expect(hit).toBeVisible();
  await hit.click();
  await expect(component.locator("#config-anchor-chat-behavior-message-handling")).toBeInViewport();
  await expect(component.getByRole("textbox", { name: "Custom stopping strings" })).toBeVisible();
});

test("`when` parity: a plain viewer's search has NO admin hits — one predicate, three consumers", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  await component.getByRole("combobox", { name: "Search settings" }).fill("engines");
  await expect(component.getByRole("option", { name: /Engines/ })).toHaveCount(0);
});

// ── `@modified`: the honest answer, and the mark that makes it findable (#1099 F16 + Errand A) ───────────
// The LIST-band and shelf pins ride in THIS file rather than the list surface's own CT because they read the
// SAME derivation as the search filter (`useConfigModified`) off the SAME one-changed-setting stub: split
// across two files, the two halves could drift into disagreeing about which sections are modified, which is
// exactly the failure the one-map derivation exists to prevent.

test("@modified returns ONLY what differs — an unmodified sibling leaf of a modified section is not a hit", async ({ mount, page }) => {
  await stub(page, () => MODIFIED_SETTINGS_VIEW);
  const component = await mount(<ConfigHostStory />);

  await component.getByRole("combobox", { name: "Search settings" }).fill("@modified ");
  const options = component.getByRole("listbox").getByRole("option");
  await expect(options).toHaveCount(3);
  // The group that holds it, the section that owns the key, and the leaf itself — nothing else.
  await expect(component.getByRole("option", { name: /^Appearance/ })).toHaveCount(1);
  await expect(component.getByRole("option", { name: /^Message style/ })).toHaveCount(1);
  await expect(component.getByRole("option", { name: /^Chat display/ })).toHaveCount(1);
  // The two leaves that ride the same section and were never touched.
  await expect(component.getByRole("option", { name: /Color quoted speech/ })).toHaveCount(0);
  await expect(component.getByRole("option", { name: /Auto-fix unfinished formatting/ })).toHaveCount(0);
});

test("every @modified hit CARRIES the mark — in its visible row and in its accessible name", async ({ mount, page }) => {
  await stub(page, () => MODIFIED_SETTINGS_VIEW);
  const component = await mount(<ConfigHostStory />);

  await component.getByRole("combobox", { name: "Search settings" }).fill("@modified ");
  const options = component.getByRole("listbox").getByRole("option");
  await expect(options).toHaveCount(3);
  for (const option of await options.all()) {
    // The name is label (+ group) + the mark, joined with spaces by `aria-labelledby` — the visible token IS
    // the announced one, so a screen-reader user is told which hits are the changed ones too.
    await expect(option).toHaveAccessibleName(/ Modified$/);
    await expect(option.locator('[data-slot="config-search-mark"]')).toBeVisible();
  }
});

test("a modified setting is findable from a PLAIN query too: the hit says so without the token", async ({ mount, page }) => {
  await stub(page, () => MODIFIED_SETTINGS_VIEW);
  const component = await mount(<ConfigHostStory />);

  await component.getByRole("combobox", { name: "Search settings" }).fill("chat display");
  await expect(component.getByRole("option", { name: /^Chat display/ }).first()).toHaveAccessibleName(/ Modified$/);
});

test("modified PROPAGATES UP: the group band and its shelf say so, at rest, with nothing typed", async ({ mount, page }) => {
  await stub(page, () => MODIFIED_SETTINGS_VIEW);
  const component = await mount(<ConfigHostStory />);

  // The band carries the word INSIDE the button, so it is part of the band's own accessible name.
  await expect(component.getByRole("button", { name: "Appearance Modified" })).toBeVisible();
  await expect(component.locator('[data-config-group="appearance"] [data-slot="config-group-modified"]')).toBeVisible();
  await expect(component.locator('[data-config-shelf="user"] [data-slot="config-shelf-modified"]')).toBeVisible();
  // A group with nothing changed inside it stays unmarked — the mark is a verdict, not decoration.
  await expect(component.locator('[data-config-group="connections"] [data-slot="config-group-modified"]')).toHaveCount(0);
});

test("nothing modified ⇒ no marks anywhere, and @modified is an honest empty", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  await expect(component.locator('[data-slot="config-group-modified"]')).toHaveCount(0);
  await expect(component.locator('[data-slot="config-shelf-modified"]')).toHaveCount(0);
  await component.getByRole("combobox", { name: "Search settings" }).fill("@modified ");
  await expect(component.getByRole("listbox").getByRole("option")).toHaveCount(0);
});

// ── #1215: the search box is a TAP TARGET on a phone — A FENCE, NOT A DEFECT PROOF ──────────────────
// SAY WHAT THIS IS. #1215 reported `[data-slot=command-root]` at a 40px short side under design-audit
// `--mobile`. It does not reproduce, and this arm was written red-first and PASSED against the unmodified
// source — so it fences a floor that already holds; it never caught the reported defect and must not be
// read as having done so. The two receipts behind that refusal (2026-09-05):
//   · this arm itself, at the audit's own device slot (touch, coarse, 430×932) and again squeezed, green
//     before any change;
//   · `pnpm snap /config --mobile --design-audit --dirty` came back nav=OK / p1=0 with `command-root`
//     absent from the whole census — on a phone the stage landed on CONTENT, so the LIST and its search
//     were not in the audited DOM at all. The one 40px tap-target population in that run is three
//     `[aria-label="Theme actions: …"]` theme-row menus, which is a different element and its own row.
// The `@orb/ui` Command primitive has carried `pointer-coarse:h-touch-target` on its input wrapper since
// 275c0e40d and pins it in `tests/ui/primitives/command/command.ct.tsx`. What is NOT pinned anywhere else,
// and is why this arm is worth keeping: that the floor SURVIVES THIS CONSUMER'S MOUNT. The search block is
// a plain flex child of the LIST's `h-full min-h-0 overflow-y-auto` column with no `shrink-0`, and the
// Command root carries `overflow-hidden` — the pair that disables a flex item's automatic content-based
// minimum. Nothing structural stops this box from being squashed; only the measurement says it is not.
test.describe("coarse pointer", () => {
  test.use({ hasTouch: true, viewport: { width: 430, height: 932 } });

  test("#2317: the filter funnel keeps the effective touch floor under compact density", async ({ mount, page }) => {
    await stub(page);
    // Density is a bare inherited attribute in tiers.css. Mount the production host inside that real
    // carrier so the failing compact arm is present on first paint rather than mutated after layout.
    const component = await mount(
      <div data-density="compact">
        <ConfigHostStory />
      </div>,
    );
    await expect(component).toHaveAttribute("data-density", "compact");
    const funnel = component.getByRole("button", { name: "Add a search filter" });
    await expect(funnel).toBeVisible();

    const floor = await resolveSpacingPx(page, "--spacing-touch-target");
    expect(floor, "the coarse-pointer token arm is active").toBeGreaterThanOrEqual(44);
    await expect.poll(() => hitExtent(funnel, "x"), "the horizontal hit extent reaches the resolved floor").toBeGreaterThanOrEqual(floor);
    await expect.poll(() => hitExtent(funnel, "y"), "the vertical hit extent reaches the resolved floor").toBeGreaterThanOrEqual(floor);

    // The same production action still opens the token menu; geometry cannot replace the behavior pin.
    await funnel.click();
    await expect(component.getByRole("option", { name: /@modified/ })).toBeVisible();
  });

  test("#1215: the settings search meets the coarse touch floor — the root box AND the input inside it", async ({ mount, page }) => {
    await stub(page);
    const component = await mount(<ConfigHostStory />);

    const root = component.locator('[data-slot="command-root"]');
    const input = component.getByRole("combobox", { name: "Search settings" });
    await expect(root).toBeVisible();
    await expect(input).toBeVisible();

    // The floor is read from the resolved token, never a hardcoded px — `--spacing-touch-target` is
    // pointer-conditional (44px coarse / 28px fine), so this also proves the emulation actually took.
    const readFloor = async (): Promise<number> => await resolveSpacingPx(page, "--spacing-touch-target");
    await expect.poll(readFloor).toBeGreaterThanOrEqual(44);
    const floor = await readFloor();

    // THE ROOT, not the input, at rest: the input's floor at rest is the PRIMITIVE'S claim and is already
    // pinned at `tests/ui/primitives/command/command.ct.tsx:142` — restating it here would be a second pin
    // of one fact with no way to keep the two in step. What is only true HERE is the box AROUND it, which
    // is the flex child that could be squashed.
    await expect.poll(async (): Promise<number> => (await root.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(floor);

    // …AND UNDER SQUEEZE, which is the only shape in which this consumer could lose the primitive's floor.
    // The search rides the top of a `h-full min-h-0 overflow-y-auto` column as a plain flex child with no
    // `shrink-0`, and the Command root carries `overflow-hidden` — which is exactly the pair that disables
    // a flex item's automatic content-based minimum. A phone short enough to overflow the LIST hard is
    // therefore the arm that would squash the box, and a receipt taken only at a tall viewport would not
    // have asked the question.
    await page.setViewportSize({ width: 390, height: 420 });
    await expect.poll(async (): Promise<number> => (await root.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(floor);
    await expect.poll(async (): Promise<number> => (await input.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(floor);
  });
});
