// CT: the real Regex settings pane (regex-settings-surface.tsx — the D121-E script LIBRARY). Drives the
// production CRUD path: `regex.listScripts` seeds the list, `regex.listGlobal` seeds the GLOBAL switches,
// Add fires `regex.createScript` and opens the shared editor on the returned row, and the global switch
// fires `regex.attachGlobal`/`detachGlobal`. Assertions anchor to the real accessible names + the WIRE call
// (busDriven — the stubbed response doesn't refetch, so the check is the CALL, exactly like the Tags/System
// pane CTs).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { RegexSettingsStory } from "../_ct-stories";

const SCRIPT = {
  id: "regex_script_0000000000000001",
  name: "strip ooc",
  findRegex: "\\(ooc\\)",
  replaceString: "",
  placement: ["AI_OUTPUT"],
  enabled: true,
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: false,
  trimStrings: [],
  substituteRegex: 0,
};

const CREATED = { ...SCRIPT, id: "regex_script_0000000000000002", name: "New script" };

const CREATE_PROC = "regex.createScript";
const ATTACH_PROC = "regex.attachGlobal";
const DETACH_PROC = "regex.detachGlobal";

function stub(page: Page, globals: readonly unknown[] = []): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "regex.listScripts": () => [SCRIPT],
    "regex.listGlobal": () => globals,
    [CREATE_PROC]: () => CREATED,
    [ATTACH_PROC]: () => null,
    [DETACH_PROC]: () => ({ detached: true }),
    "regex.updateScript": () => SCRIPT,
    "regex.removeScript": () => ({ deleted: true }),
  });
}

test("lists the owner's library rows", async ({ mount, page }) => {
  await stub(page);
  await mount(<RegexSettingsStory />);
  await expect(page.getByText("strip ooc").first()).toBeVisible();
});

test("a row not attached globally reads as attached-only, not as global", async ({ mount, page }) => {
  await stub(page, []);
  await mount(<RegexSettingsStory />);
  // The subtitle is the scope's user-visible affordance — "attached only" means this script runs ONLY where
  // a preset/character/room picks it up, which is the whole point of the library being reference-based.
  await expect(page.getByText("attached only")).toBeVisible();
});

test("Add creates a real library ROW (not an array push) and opens the shared editor on it", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<RegexSettingsStory />);
  await page.getByRole("button", { name: "Add script" }).click();
  // The write is a row mint — the D121-E shape. Under the old embedded blob this was a `pushFieldValue`
  // into a settings array, which is exactly why three carriers could disagree.
  await expect.poll(() => trpc.lastInput(CREATE_PROC), { intervals: [100, 250, 500, 750] }).toMatchObject({ input: { name: "New script" } });
  await expect(page.getByRole("heading", { name: "Edit regex script" })).toBeVisible();
});

test("the GLOBAL switch attaches the script at the global scope", async ({ mount, page }) => {
  const trpc = await stub(page, []);
  await mount(<RegexSettingsStory />);
  await page.getByRole("switch", { name: "strip ooc runs in every chat" }).click();
  await expect.poll(() => trpc.lastInput(ATTACH_PROC), { intervals: [100, 250, 500] }).toMatchObject({ scriptId: SCRIPT.id });
});

test("un-switching an already-global script detaches it", async ({ mount, page }) => {
  const trpc = await stub(page, [SCRIPT]);
  await mount(<RegexSettingsStory />);
  await expect(page.getByText("global")).toBeVisible();
  await page.getByRole("switch", { name: "strip ooc runs in every chat" }).click();
  await expect.poll(() => trpc.lastInput(DETACH_PROC), { intervals: [100, 250, 500] }).toMatchObject({ scriptId: SCRIPT.id });
});
