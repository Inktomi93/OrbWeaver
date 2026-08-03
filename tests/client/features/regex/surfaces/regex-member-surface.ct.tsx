// CT: the regex MEMBER EDITOR mounted in CONTENT (config-rail C-7). It replaces the settings pane's
// Dialog-in-a-modal without changing one field: the same authored set (name · find pattern · replace ·
// placement chips · enabled · run-on-edit) bound to the same autosave form, saving through the same
// `regex.updateScript` verb — and the delete verb, which the pane's list used to own.
//
// The autosave writes are asserted at the WIRE (busDriven — the stubbed response doesn't refetch), the same
// way the retired pane CT did.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { deriveRegexTierFlags } from "../../../../../packages/client/src/features/regex/lib/derive-tier-flags";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { RegexMemberStory } from "../_ct-stories";

const RUN_ON_EDIT = /Run on edit/;
const DELETE_CASCADE = /removes it from every preset, character, and room/;

const SCRIPT = {
  id: "regex_script_stripooc",
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

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "regex.listScripts": () => [SCRIPT],
    "regex.listGlobal": () => [],
    "regex.updateScript": () => SCRIPT,
    "regex.removeScript": () => ({ deleted: true }),
  });
}

test("mounts the whole authored field set — no dialog, no lost field", async ({ mount, page }) => {
  await stub(page);
  const editor = await mount(<RegexMemberStory />);
  await expect(editor.getByRole("heading", { name: "strip ooc" })).toBeVisible();
  await expect(editor.getByRole("textbox", { name: "Name" })).toHaveValue("strip ooc");
  await expect(editor.getByText("Find pattern")).toBeVisible();
  // The pattern editor is a LAZY CodeMirror mount whose header once called itself "modal-only" — paneside
  // it must still arrive, or the one field whose syntax a user can get wrong has no editor at all.
  await expect(page.locator(".cm-editor")).toBeVisible();
  await expect(editor.getByText("Replace with")).toBeVisible();
  await expect(editor.getByText("Runs on")).toBeVisible();
  await expect(editor.getByRole("switch", { name: "Enabled" })).toBeVisible();
  await expect(editor.getByRole("switch", { name: RUN_ON_EDIT })).toBeVisible();
});

test("editing a field autosaves through updateScript with the tier flags DERIVED from the chips", async ({ mount, page }) => {
  const trpc = await stub(page);
  const editor = await mount(<RegexMemberStory />);
  await editor.getByRole("textbox", { name: "Name" }).fill("strip ooc lines");
  await expect
    .poll(() => (trpc.lastInput("regex.updateScript") as { readonly input?: { readonly name?: string } } | undefined)?.input?.name, {
      intervals: [50, 100, 250, 500],
      timeout: 5000,
    })
    .toBe("strip ooc lines");
  // The one tier-flag write boundary: `markdownOnly`/`promptOnly` are re-derived from `placement` on every
  // save (never authored), so the pair can never contradict the chips. This fixture's placement is
  // AI_OUTPUT only — `withDerivedTierFlags`' output-only arm — and the assertion is that the SAVE carries
  // that derivation rather than the row's stored flags.
  const input = trpc.lastInput("regex.updateScript") as { readonly input: { readonly markdownOnly: boolean; readonly promptOnly: boolean } };
  expect({ markdownOnly: input.input.markdownOnly, promptOnly: input.input.promptOnly }).toEqual(deriveRegexTierFlags(["AI_OUTPUT"]));
});

test("delete confirms, then fires removeScript", async ({ mount, page }) => {
  const trpc = await stub(page);
  const editor = await mount(<RegexMemberStory />);
  await editor.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(DELETE_CASCADE)).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  await expect.poll(() => trpc.lastInput("regex.removeScript"), { intervals: [20, 50, 100] }).toEqual({ scriptId: SCRIPT.id });
});

test("a deleted member says so instead of rendering a dead form", async ({ mount, page }) => {
  await stub(page);
  const editor = await mount(<RegexMemberStory memberId="regex_script_gone" />);
  await expect(editor.getByText("Script not found")).toBeVisible();
});
