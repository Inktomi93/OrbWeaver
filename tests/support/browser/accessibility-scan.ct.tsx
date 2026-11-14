// The scan keeps the vendor result whole and judges apart what is not the page's: a control an OPEN popup covers is reclassified, a control a
// closed select's trigger or a plain node covers stays a finding; a control that meets Label in Name is reclassified, one whose name drops a
// shown word stays a finding.
import { readFile } from "node:fs/promises";
import { ID_PREFIX, mintUserId } from "@orb/kit/ids";
import { accessibilityEvidence, surfaceCheckpoint, webVitalsInitScript } from "@orb/testkit/browser/spec";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso";
import { webVitalsSource } from "@orb/testkit/node/helpers";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { MemberRowNameStory } from "../../client/features/chat/components/_member-row-name-stories.tsx";
import type { ClosedCoverStory, DroppedWordsStory, MenuOverTargetStory } from "./_accessibility-scan-stories.tsx";

const MENU_STORY = "tests/support/browser/_accessibility-scan-stories/MenuOverTargetStory";
const COVER_STORY = "tests/support/browser/_accessibility-scan-stories/ClosedCoverStory";
const TARGET_NAME = "Planted target";
// The planted target is 40px wide: covering 30px leaves less than the 24px floor uncovered, which axe files as `partiallyObscured`.
const COVERED_PX = 30;

async function attachmentJson(info: TestInfo, name: string): Promise<unknown> {
  const path = info.attachments.find((attachment) => attachment.name === name)?.path;
  if (path === undefined) {
    throw new Error(`The checkpoint did not retain ${name}`);
  }
  return JSON.parse(await readFile(path, "utf8"));
}

/** Raise `cover` above its neighbours and slide the planted target so the cover's right edge lies over the target's left COVERED_PX. */
async function laySpotUnder(page: Page, cover: Locator, targetName = TARGET_NAME): Promise<void> {
  const target = page.getByRole("button", { name: targetName, exact: true });
  const [targetBox, coverBox] = [await target.boundingBox(), await cover.boundingBox()];
  if (targetBox === null || coverBox === null) {
    throw new Error("The cover or the target has no box to lay one under the other");
  }
  await cover.evaluate((node) => {
    node.style.position = "relative";
    node.style.zIndex = "5";
  });
  await target.evaluate(
    (node, { dx, dy }) => {
      node.style.transform = `translate(${String(dx)}px, ${String(dy)}px)`;
    },
    { dx: coverBox.x + coverBox.width - COVERED_PX - targetBox.x, dy: coverBox.y - targetBox.y },
  );
}

async function targetSizeFindings(page: Page): Promise<{ violations: number; incomplete: number; reclassified: readonly string[]; raw: number }> {
  const { raw, results, reclassified } = await accessibilityEvidence(page);
  const planted = (html: string): boolean => html.includes(TARGET_NAME);
  const count = (rules: typeof results.violations): number =>
    rules
      .filter(({ id }) => id === "target-size")
      .flatMap(({ nodes }) => nodes)
      .filter(({ html }) => planted(html)).length;
  return {
    violations: count(results.violations),
    incomplete: count(results.incomplete),
    raw: count(raw.violations),
    reclassified: reclassified.filter(({ ruleId, html }) => ruleId === "target-size" && planted(html)).map(({ reason }) => reason),
  };
}

test("a control an open menu covers is reclassified with its reason while the vendor result keeps it a violation", async ({ mount, page }) => {
  await mount<typeof MenuOverTargetStory>(MENU_STORY, {});
  await page.getByRole("button", { name: "Open the menu", exact: true }).focus();
  // Opened from the keyboard, the first item is the one tabbable row: a covered control then reads as a finding, not as needs-review.
  await page.keyboard.press("Enter");
  const item = page.getByRole("menuitem", { name: "Rename the character", exact: true });
  await expect(item).toBeVisible();
  await laySpotUnder(page, item);
  const found = await targetSizeFindings(page);
  expect(found).toMatchObject({ violations: 0, incomplete: 1, raw: 1 });
  expect(found.reclassified).toHaveLength(1);
});

test("a covered control joins the rule's existing needs-review entry instead of a second one", async ({ mount, page }) => {
  await mount<typeof MenuOverTargetStory>(MENU_STORY, { withSecondRow: true });
  await page.getByRole("button", { name: "Open the menu", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Rename the character", exact: true })).toBeVisible();
  await laySpotUnder(page, page.getByRole("menuitem", { name: "Rename the character", exact: true }));
  // The vendor files a target a not-tabbable row covers as needs-review: that is the entry the reclassified node must join.
  await laySpotUnder(page, page.getByRole("menuitem", { name: "Delete the character", exact: true }), "Second target");
  const { raw, results } = await accessibilityEvidence(page);
  const vendorEntry = raw.incomplete.filter(({ id }) => id === "target-size");
  expect(vendorEntry).toHaveLength(1);
  const entries = results.incomplete.filter(({ id }) => id === "target-size");
  expect(entries).toHaveLength(1);
  expect(entries[0]?.nodes).toHaveLength((vendorEntry[0]?.nodes.length ?? 0) + 1);
});

test("a control a closed select's trigger covers stays a finding", async ({ mount, page }) => {
  await mount<typeof ClosedCoverStory>(COVER_STORY, {});
  const trigger = page.getByRole("combobox", { name: "Pick", exact: true });
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await trigger.evaluate((node) => {
    node.style.inlineSize = "40px";
  });
  await laySpotUnder(page, trigger);
  expect(await targetSizeFindings(page)).toMatchObject({ violations: 1, incomplete: 0, raw: 1, reclassified: [] });
});

test("a control a plain node covers stays a finding", async ({ mount, page }) => {
  await mount<typeof ClosedCoverStory>(COVER_STORY, {});
  await laySpotUnder(page, page.getByRole("button", { name: "Cover", exact: true }));
  expect(await targetSizeFindings(page)).toMatchObject({ violations: 1, incomplete: 0, raw: 1, reclassified: [] });
});

const MEMBER_ROW_STORY = "tests/client/features/chat/components/_member-row-name-stories/MemberRowNameStory";
const DROPPED_WORDS_STORY = "tests/support/browser/_accessibility-scan-stories/DroppedWordsStory";
const NAME_RULE = "label-content-name-mismatch";

type MemberRow = Parameters<typeof MemberRowNameStory>[0]["row"];
const ids = createSeededIds(FIXTURE_ID_CURSOR);

async function nameRuleFindings(page: Page): Promise<{ violations: number; incomplete: number; raw: number; reclassified: number }> {
  const { raw, results, reclassified } = await accessibilityEvidence(page);
  const count = (rules: typeof results.violations): number => rules.filter(({ id }) => id === NAME_RULE).flatMap(({ nodes }) => nodes).length;
  return {
    violations: count(results.violations),
    incomplete: count(results.incomplete),
    raw: count(raw.violations),
    reclassified: reclassified.filter(({ ruleId }) => ruleId === NAME_RULE).length,
  };
}

// The Members row prints a state word and keeps the responding mark out of its name; axe wants the shown words as one run of the name.
const MEMBER_ROWS: readonly { readonly title: string; readonly row: () => MemberRow }[] = [
  {
    title: "a responding character seat",
    row: () => ({
      kind: "character",
      key: "scan-member",
      characterId: ids.typeId(ID_PREFIX.character),
      displayName: "Charlotte",
      disabled: false,
      talkativeness: 0.5,
      avatarHash: null,
      responding: true,
    }),
  },
  {
    title: "the viewer's own host seat, online",
    row: () => ({
      kind: "person",
      key: "scan-member",
      userId: mintUserId(ids.next),
      displayName: "Riley",
      isHost: true,
      isViewer: true,
      avatarHash: null,
      pendingNominee: false,
      historyVisibility: "full",
      online: true,
      lastSeenAt: null,
    }),
  },
];

for (const { title, row } of MEMBER_ROWS) {
  test(`${title} meets Label in Name, so its vendor name mismatch is judged apart`, async ({ mount, page }) => {
    const component = await mount<typeof MemberRowNameStory>(MEMBER_ROW_STORY, { row: row() });
    await expect(component.locator('[data-slot="member-row"]').getByRole("button")).toBeVisible();
    expect(await nameRuleFindings(page)).toEqual({ violations: 0, incomplete: 1, raw: 1, reclassified: 1 });
  });
}

// A description is not a label, but stripping one cannot leave a control with nothing shown to compare: a control
// whose whole shown text is its own description has no label in its name.
for (const { title, described } of [
  { title: "a control whose name drops the words it shows", described: false },
  { title: "a control whose whole shown text is its own description", described: true },
] as const) {
  test(`${title} stays a name mismatch`, async ({ mount, page }) => {
    await mount<typeof DroppedWordsStory>(DROPPED_WORDS_STORY, { described });
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
    expect(await nameRuleFindings(page)).toEqual({ violations: 1, incomplete: 0, raw: 1, reclassified: 0 });
  });
}

test("the walk's axe attachment keeps the covered control a violation and a second record names what was judged apart", async ({ mount, page }, info) => {
  await page.addInitScript({ content: webVitalsInitScript(await webVitalsSource()) });
  await mount<typeof MenuOverTargetStory>(MENU_STORY, {});
  await page.getByRole("button", { name: "Open the menu", exact: true }).focus();
  await page.keyboard.press("Enter");
  const item = page.getByRole("menuitem", { name: "Rename the character", exact: true });
  await expect(item).toBeVisible();
  await laySpotUnder(page, item);
  const name = "popup-over-target";
  await surfaceCheckpoint(info, {
    name,
    scope: page.getByRole("menu", { name: "Fixture menu", exact: true }),
    state: "loaded",
    witnesses: [item],
    checks: ["names"],
  });
  const raw = await attachmentJson(info, `${name}-axe`);
  const record = await attachmentJson(info, `${name}-axe-reclassified`);
  expect(JSON.stringify(raw)).toContain(TARGET_NAME);
  expect(raw).toMatchObject({ violations: expect.arrayContaining([expect.objectContaining({ id: "target-size" })]) });
  expect(record).toEqual([expect.objectContaining({ ruleId: "target-size", html: expect.stringContaining(TARGET_NAME), reason: expect.any(String) })]);
});
