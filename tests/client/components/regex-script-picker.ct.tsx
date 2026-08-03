// CT: the shared regex PICKER (D121-E). This component is the user-visible payoff of the whole reshape —
// before it, a preset and a character each held their OWN copy of a script, and the character editor
// surfaced four of the ten fields (F3: it defaulted `placement: []`, so an in-app card script could never
// fire). Now every surface picks from the ONE library.
//
// The pins are the two things a picker must get right: it shows the WHOLE library with attachment state,
// and toggling writes the JUNCTION rather than mutating the carrier.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../support/ct/route-trpc.ts";
import { RegexPickerHeadlessStory, RegexPickerInDeckStory, RegexPickerStory } from "../features/regex/_ct-stories.tsx";

const ATTACHED = {
  id: "regex_script_000000000000000a",
  name: "already on",
  findRegex: "a",
  replaceString: "b",
  placement: ["AI_OUTPUT"],
  enabled: true,
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: false,
  trimStrings: [],
  substituteRegex: 0,
};
const LOOSE = { ...ATTACHED, id: "regex_script_000000000000000b", name: "not yet on" };

// Hoisted (useTopLevelRegex): a literal re-compiled per assertion is a needless per-run cost.
const AUTHORED_IN_SETTINGS = /Settings → Regex/;

const ATTACH_PROC = "regex.attachToCharacter";
const DETACH_PROC = "regex.detachFromCharacter";

function stub(page: Page, library: readonly unknown[], attached: readonly unknown[]): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "regex.listScripts": () => library,
    "regex.listForCharacter": () => attached,
    [ATTACH_PROC]: () => null,
    [DETACH_PROC]: () => ({ detached: true }),
  });
}

test("shows the WHOLE library, with attachment state per row", async ({ mount, page }) => {
  await stub(page, [ATTACHED, LOOSE], [ATTACHED]);
  await mount(<RegexPickerStory />);
  // Both library rows are offered — a picker that only listed the attached set would be a read-out, not a
  // picker, and there would be no way to add the second one.
  await expect(page.getByText("already on")).toBeVisible();
  await expect(page.getByText("not yet on")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Attach already on" })).toBeChecked();
  await expect(page.getByRole("switch", { name: "Attach not yet on" })).not.toBeChecked();
});

test("switching a loose row ON writes the character JUNCTION (never the card)", async ({ mount, page }) => {
  const trpc = await stub(page, [ATTACHED, LOOSE], [ATTACHED]);
  await mount(<RegexPickerStory />);
  await page.getByRole("switch", { name: "Attach not yet on" }).click();
  await expect.poll(() => trpc.lastInput(ATTACH_PROC), { intervals: [100, 250, 500] }).toMatchObject({ scriptId: LOOSE.id });
});

test("switching an attached row OFF detaches it", async ({ mount, page }) => {
  const trpc = await stub(page, [ATTACHED, LOOSE], [ATTACHED]);
  await mount(<RegexPickerStory />);
  await page.getByRole("switch", { name: "Attach already on" }).click();
  await expect.poll(() => trpc.lastInput(DETACH_PROC), { intervals: [100, 250, 500] }).toMatchObject({ scriptId: ATTACHED.id });
});

test("an empty library points at the one place scripts are authored", async ({ mount, page }) => {
  await stub(page, [], []);
  await mount(<RegexPickerStory />);
  // The empty state is load-bearing: a picker with nothing in it must not look broken, it must say where to
  // go. One library, one editor — so there is exactly one honest answer to give here.
  await expect(page.getByText(AUTHORED_IN_SETTINGS)).toBeVisible();
});

// …AND IT CARRIES THE ACTION when the host can navigate (side-eye X-19): an empty state that prints a
// navigation instruction next to a surface capable of navigating is prose standing in for a button.
test("the empty arm offers the jump, not just the address", async ({ mount, page }) => {
  await stub(page, [], []);
  await mount(<RegexPickerHeadlessStory />);
  await expect(page.getByRole("button", { name: "Open your script library" })).toBeVisible();
});

// THE GROUP HEADING SPEAKS THE DECK'S VOICE (side-eye F-8 REGRESSED → R-4). This component landed after the
// fix-round that moved `EntryListEditor` to the kicker arm, and rebuilt the very defect it closed: on the
// Transforms deck its `Regex` heading painted 16px sentence-case white among four 10.5px muted caps
// kickers. Asserted as a RELATION against a live sibling group, so it cannot be satisfied by a px literal
// drifting out from under it.
test("the picker's group heading paints like the deck's other group headings, not like a page title", async ({ mount, page }) => {
  await stub(page, [ATTACHED], []);
  await mount(<RegexPickerInDeckStory />);
  // BARRIER on the SETTLED deck: the picker suspends, and its QueryBoundary's fallback replaces the sibling
  // group too — an unbarriered census measures the loading arm and finds no headings at all.
  await expect(page.getByRole("switch", { name: "Attach already on" })).toBeVisible();
  const painted = await page.evaluate(() => {
    const read = (text: string): { size: string; transform: string; color: string } | null => {
      const found = [...document.querySelectorAll("h3")].find((h) => h.textContent?.trim() === text);
      if (found === null || found === undefined) {
        return null;
      }
      const style = getComputedStyle(found);
      return { size: style.fontSize, transform: style.textTransform, color: style.color };
    };
    return { sibling: read("Delivery"), regex: read("Regex") };
  });
  expect(painted.sibling).not.toBeNull();
  expect(painted.regex).toEqual(painted.sibling);
});

// THE PICKER DROPS ITS HEADING when it IS the body of something already named (side-eye X-7): the character
// facet rendered `Regex scripts` as a drill header, again as this heading 65px below it, and again on the
// CONTEXT inspector beside it — four labels, one concept, one screen.
test("with no heading prop the picker adds no second heading to its host", async ({ mount, page }) => {
  await stub(page, [ATTACHED], []);
  await mount(<RegexPickerHeadlessStory />);
  // Settled first — the count must be taken against the resolved picker, not its fallback.
  await expect(page.getByRole("switch", { name: "Attach already on" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Regex scripts" })).toHaveCount(1);
});
