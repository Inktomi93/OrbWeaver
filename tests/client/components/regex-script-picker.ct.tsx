// CT: the shared regex PICKER (D121-E). This component is the user-visible payoff of the whole reshape —
// before it, a preset and a character each held their OWN copy of a script, and the character editor
// surfaced four of the ten fields (F3: it defaulted `placement: []`, so an in-app card script could never
// fire). Now every surface picks from the ONE library.
//
// The pins are the two things a picker must get right: it shows the WHOLE library with attachment state,
// and toggling writes the JUNCTION rather than mutating the carrier.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../support/ct/route-trpc";
import { routeTrpc } from "../../support/ct/route-trpc";
import { RegexPickerStory } from "../features/regex/_ct-stories";

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
