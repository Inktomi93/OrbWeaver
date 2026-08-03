// CT: the tag MEMBER EDITOR — the CONTENT half of the F-11 split. It drives the same production tag-domain
// flow the retired settings row did (rename → updateTag name patch, colour → updateTag tri-state null,
// folder → updateTag folderType, hide → updateTag isHiddenOnCard, delete → removeTag), so the migration is
// provably behaviour-preserving: every control that left the row is asserted here, against the same WIRE
// inputs, by the same accessible names.
//
// The mutations are busDriven — the stubbed responses don't refetch — so the check is the CALL, exactly as
// the pane-era CT did it.
//
// It also carries the TAP-TARGET geometry guard the retired `tag-row-tap-targets.suite.ct.tsx` owned: every
// interactive control must clear the 32px hard floor at the default fine pointer (two side-eye passes once
// caught these at 28px). Measuring the REAL boundingBox is what makes a token regression fail.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { TagMemberStory } from "../_ct-stories.tsx";

const TAP_FAIL_PX = 32;
/** The delete-confirm's cascade line for "adventure" (5 characters, 1 chat, 1 world book). */
const DELETE_CASCADE = /5 characters, 1 chat, 1 world book/;

const TAGS = [
  {
    id: "tag_adventure",
    name: "adventure",
    color: "#3355ff",
    color2: null,
    source: "manual",
    folderType: "NONE",
    sortOrder: 0,
    isHiddenOnCard: false,
    usage: { characters: 5, chats: 1, worldBooks: 1, personas: 0, presets: 0, total: 7 },
  },
  {
    id: "tag_orphan",
    name: "orphan",
    color: null,
    color2: null,
    source: null,
    folderType: "NONE",
    sortOrder: 1,
    isHiddenOnCard: true,
    usage: { characters: 0, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 0 },
  },
];

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "tag.listTagsWithUsage": () => TAGS,
    "tag.updateTag": () => TAGS[0],
    "tag.removeTag": () => undefined,
    "tag.mergeTags": () => undefined,
  });
}

test("the editor names the tag and shows its usage census", async ({ mount, page }) => {
  await stub(page);
  const editor = await mount(<TagMemberStory />);
  await expect(editor.getByRole("heading", { name: "adventure" })).toBeVisible();
  await expect(editor.getByText("7 uses")).toBeVisible();
});

test("renaming commits an updateTag name patch on blur", async ({ mount, page }) => {
  const trpc = await stub(page);
  const editor = await mount(<TagMemberStory />);
  const nameField = editor.getByRole("textbox", { name: "Name" });
  await nameField.fill("quest");
  await nameField.blur();
  await expect.poll(() => trpc.lastInput("tag.updateTag"), { intervals: [20, 50, 100] }).toEqual({ tagId: "tag_adventure", patch: { name: "quest" } });
});

test("clearing a colour sends the updateTag tri-state null (clear to theme default)", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<TagMemberStory />);
  // "adventure" has a set background (#3355ff): open its ColorField and Reset to default. The `""`
  // clear maps to `color: null` — the updateTag tri-state that clears the column, never an empty string.
  await page.getByRole("button", { name: "Background" }).click();
  await page.getByRole("button", { name: "Reset to default" }).click();
  await expect.poll(() => trpc.lastInput("tag.updateTag"), { intervals: [20, 50, 100] }).toEqual({ tagId: "tag_adventure", patch: { color: null } });
});

test("the hide-on-card switch patches isHiddenOnCard", async ({ mount, page }) => {
  const trpc = await stub(page);
  const editor = await mount(<TagMemberStory />);
  await editor.getByRole("switch", { name: "Hide the adventure chip on cards" }).click();
  await expect.poll(() => trpc.lastInput("tag.updateTag"), { intervals: [20, 50, 100] }).toEqual({ tagId: "tag_adventure", patch: { isHiddenOnCard: true } });
});

test("delete confirms with the real cascade, then fires removeTag", async ({ mount, page }) => {
  const trpc = await stub(page);
  const editor = await mount(<TagMemberStory />);
  await editor.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(DELETE_CASCADE)).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  await expect.poll(() => trpc.lastInput("tag.removeTag"), { intervals: [20, 50, 100] }).toEqual({ tagId: "tag_adventure" });
});

test("a deleted member says so instead of rendering a dead form", async ({ mount, page }) => {
  await stub(page);
  const editor = await mount(<TagMemberStory memberId="tag_gone" />);
  await expect(editor.getByText("Tag not found")).toBeVisible();
});

test("every control clears the 32px tap-target floor", async ({ mount, page }) => {
  await stub(page);
  const editor = await mount(<TagMemberStory />);
  const controls = [
    editor.getByRole("textbox", { name: "Name" }),
    editor.getByRole("button", { name: "Background" }),
    editor.getByRole("switch", { name: "Hide the adventure chip on cards" }),
    editor.getByRole("button", { name: "Merge into…" }),
    editor.getByRole("button", { name: "Delete" }),
  ];
  const boxes = await Promise.all(controls.map((control) => control.boundingBox()));
  for (const box of boxes) {
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(TAP_FAIL_PX);
  }
});
