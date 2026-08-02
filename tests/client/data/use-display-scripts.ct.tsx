// CT: the DISPLAY TIER (D121-E, closing F1) and the owner's 2026-08-02 host-broadcast ruling — BOTH arms.
//
// F1 was a dead wire: the leg existed in `message-render.ts` and nothing ever supplied `displayScripts`, so
// a DISPLAY-placement script never ran for anyone. These tests are its proof-of-life, and they assert
// through what a USER sees — the rendered body text — never through the hook's return value.
//
// THE FOUR PINS:
//   1. toggle OFF  → a member is unaffected by the HOST's scripts (the default; the room broadcasts nothing).
//   2. toggle OFF  → the member's OWN script still transforms their rendered body.
//   3. toggle ON   → the host's script transforms a MEMBER's body, and the member's own still applies on top
//                    (viewer-LAST — the ruling's counter-style guarantee).
//   4. either arm  → the composer, the edit textarea, and the wire payload keep the RAW canon, always.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../support/ct/route-trpc";
import { DisplayTierInRoomStory } from "./_ct-stories";

// The story's raw canon, restated here rather than imported: playwright-ct rewrites every named import
// from a `_ct-stories` module into a generated component `const`, so a story module may only ever export
// components to its CT (every sibling CT in this directory imports components alone).
const RAW = "the GOBLIN snarls";

/** A library row shaped exactly as `regexScriptSchema` parses one (the wire the hook narrows). */
function script(id: string, name: string, findRegex: string, replaceString: string): Record<string, unknown> {
  return {
    id,
    name,
    findRegex,
    replaceString,
    placement: ["DISPLAY"],
    enabled: true,
    markdownOnly: true,
    promptOnly: false,
    runOnEdit: false,
    trimStrings: [],
    substituteRegex: 0,
  };
}

// The MEMBER's own script lowercases the shout; the HOST's broadcast script paints it as an effect. Chosen
// so the two are independently visible in one output string — which is what makes pin 3 legible.
const OWN = script("regex_script_00000000000000000a", "own", "snarls", "grumbles");
const HOST = script("regex_script_00000000000000000b", "host", "GOBLIN", "✦GOBLIN✦");

/** `listRoomDisplayScripts` returns `[]` when the room never opted in — that IS the toggle-off arm. */
function stub(page: Page, roomBroadcast: readonly Record<string, unknown>[]): Promise<unknown> {
  return routeTrpc(page, {
    "regex.listScripts": () => [OWN],
    "regex.listRoomDisplayScripts": () => roomBroadcast,
  });
}

test("toggle OFF: the room broadcasts nothing, so the host's script does NOT touch a member's body", async ({ mount, page }) => {
  await stub(page, []);
  await mount(<DisplayTierInRoomStory />);
  const body = page.getByTestId("rendered-body");
  // The member's own script DID run (pin 2) …
  await expect(body).toHaveText("the GOBLIN grumbles");
  // … and the host's did not: the shout is untouched, no effect markers.
  await expect(body).not.toContainText("✦");
});

test("toggle ON: the host's script transforms a member's body AND the member's own still applies", async ({ mount, page }) => {
  await stub(page, [HOST]);
  await mount(<DisplayTierInRoomStory />);
  // BOTH transforms landed — host's broadcast effect + the member's own rewrite. Viewer-LAST means a viewer
  // can always counter-style what the host broadcast; here the two are disjoint so both survive.
  await expect(page.getByTestId("rendered-body")).toHaveText("the ✦GOBLIN✦ grumbles");
});

test("NEITHER arm touches the composer, the edit textarea, or the wire payload", async ({ mount, page }) => {
  await stub(page, [HOST]);
  await mount(<DisplayTierInRoomStory />);
  // The rendered body IS transformed …
  await expect(page.getByTestId("rendered-body")).not.toHaveText(RAW);
  // … while every non-render surface still holds the RAW canon. This is the whole safety claim of the host
  // toggle: it restyles how the room LOOKS, never what anyone types, sends, or persists.
  await expect(page.getByLabel("Message composer")).toHaveValue(RAW);
  await expect(page.getByLabel("Edit message")).toHaveValue(RAW);
  await expect(page.getByTestId("wire-payload")).toHaveText(RAW);
});
