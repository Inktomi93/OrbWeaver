// CT: B8 — the REAL rpg in-thread dice RESULT renderer. Mirrors its
// source `packages/client/src/features/rpg/lib/dice-tool-renderer.tsx` (+ the card it draws,
// `components/rpg-dice-tool-card.tsx`).
//
// `rpgDiceToolRenderer` claims the exact `roll_dice` wire name; `RpgDiceToolResultStory` wires it into chat's
// real `MessageToolCalls` seam, so a persisted `roll_dice` `ToolCallRecord` is resolved to the dice card the
// production transcript would draw. The card is the ARM under test; the FALLBACK (a tool call is CANON — the
// record is never dropped) is the other half: an unexecuted call, a provider error, and a malformed/foreign
// result each render the generic `@orb/ui` `ToolCallBlock` instead.
//
// @orb/ui primitives drop `data-testid` (the slot-only seal), so the card is addressed by its own `data-slot`
// and its rendered numbers/text; the generic block by its `data-slot="tool-call-block"`.

import type { ToolCallRecord } from "@orb/contracts/chat";
import { expect, test } from "@playwright/experimental-ct-react";
import { RpgDiceToolResultStory } from "../../chat/_ct-stories.tsx";

const DICE_CARD = '[data-slot="rpg-dice-roll"]';
const GENERIC_BLOCK = '[data-slot="tool-call-block"]';

/** A persisted `roll_dice` call — the wire `ToolCallRecord` verbatim. `result` is the JSON the tool handler
 *  serialized (`{notation,total,faces,reason?}`), or `null`/malformed for the fallback arms. */
function diceRecord(over: Partial<ToolCallRecord>): ToolCallRecord {
  return {
    toolCallId: "call_dice_ct",
    name: "roll_dice",
    arguments: JSON.stringify({ notation: "d20" }),
    result: JSON.stringify({ notation: "d20", total: 14, faces: [14] }),
    isError: false,
    durationMs: 3,
    ...over,
  };
}

test("a well-formed roll_dice record draws the dice card with its total and notation", async ({ mount }) => {
  const component = await mount(<RpgDiceToolResultStory record={diceRecord({})} />);

  await expect(component.locator(DICE_CARD)).toBeVisible();
  await expect(component.getByText("Dice · d20")).toBeVisible();
  // `total` is THE number the roll produced (the `hero` voice).
  await expect(component.getByText("14", { exact: true })).toBeVisible();
  // A single-die roll shows no separate faces line (the total IS the face) — and never the generic JSON block.
  await expect(component.locator(GENERIC_BLOCK)).toHaveCount(0);
});

test("a multi-die roll_dice record shows the per-die faces beside the total", async ({ mount }) => {
  const record = diceRecord({
    arguments: JSON.stringify({ notation: "2d6", reason: "attack roll" }),
    result: JSON.stringify({ notation: "2d6", total: 7, faces: [3, 4], reason: "attack roll" }),
  });
  const component = await mount(<RpgDiceToolResultStory record={record} />);

  await expect(component.getByText("Dice · 2d6")).toBeVisible();
  await expect(component.getByText("7", { exact: true })).toBeVisible();
  // The per-die faces are auditable against the total.
  await expect(component.getByText("3 + 4")).toBeVisible();
  // The optional reason the model gave rides the card.
  await expect(component.getByText("attack roll")).toBeVisible();
});

test("an unexecuted roll_dice call falls back to the generic block (a tool call is canon — never dropped)", async ({ mount }) => {
  const component = await mount(<RpgDiceToolResultStory record={diceRecord({ result: null })} />);

  await expect(component.locator(GENERIC_BLOCK)).toBeVisible();
  await expect(component.locator(DICE_CARD)).toHaveCount(0);
  await expect(component.getByText("Requested, not run")).toBeVisible();
});

test("a roll_dice call flagged isError falls back to the generic block", async ({ mount }) => {
  const record = diceRecord({ isError: true, result: JSON.stringify({ notation: "d20", total: 14, faces: [14] }) });
  const component = await mount(<RpgDiceToolResultStory record={record} />);

  await expect(component.locator(GENERIC_BLOCK)).toBeVisible();
  await expect(component.locator(DICE_CARD)).toHaveCount(0);
});

test("a malformed / foreign result blob falls back to the generic block, never a throw or blank", async ({ mount }) => {
  // Not JSON at all → the parse yields nothing → the schema rejects → generic block.
  const malformed = await mount(<RpgDiceToolResultStory record={diceRecord({ result: "not json at all" })} />);
  await expect(malformed.locator(GENERIC_BLOCK)).toBeVisible();
  await expect(malformed.locator(DICE_CARD)).toHaveCount(0);
  await malformed.unmount();

  // Valid JSON of the WRONG shape → the schema rejects → generic block (the record is still shown).
  const foreign = await mount(<RpgDiceToolResultStory record={diceRecord({ result: JSON.stringify({ foo: 1 }) })} />);
  await expect(foreign.locator(GENERIC_BLOCK)).toBeVisible();
  await expect(foreign.locator(DICE_CARD)).toHaveCount(0);
});
