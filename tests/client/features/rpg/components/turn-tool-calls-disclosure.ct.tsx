// CT: the per-row "what this turn did" disclosure (TOOLCALLS-INVISIBLE, arm A) — mounted through the REAL
// rpg `message-footer` contribution, so this exercises the `when` → `body` path `main.tsx` wires rather than
// the component in isolation.
//
// WHAT IT PINS, and why each one is the defect it is:
//   • the disclosure is COLLAPSED by default (a transcript must not become a debug dump);
//   • a DROPPED call says so, with the failing field as VISIBLE TEXT — `SCENE-DROPPED` cost a live session
//     hours because that reason existed nowhere a human could read it;
//   • APPLICABILITY is keyed to the VARIANT, not the message: swiping to a variant with no record renders
//     NOTHING (not an empty shell) — the swipe-correctness the variantId keying buys;
//   • a USER row never mounts it at all (`when` refuses).

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { TurnToolCallsDisclosureStory, TurnToolCallsOtherVariantStory, TurnToolCallsUserRowStory } from "../_ct-stories.tsx";

/** A REAL folded turn's call set, in the shape `recordToolCalls` produces — all three verdicts at once,
 *  because the mixed row is the one a user actually has to read. The `update_scene` drop is the live
 *  `SCENE-DROPPED` payload verbatim (an indoor scene against an all-outdoor weather enum). */
const RECORDED_TURN = [
  {
    variantId: "mv_ct_folded",
    messageId: "msg_ct_folded",
    createdAt: 1_700_000_000_000,
    calls: [
      { name: "update_party", args: '{"members":[{"targetRef":"Alex","trackerDeltas":{"hp":-3}}]}', verdict: "applied" as const, issues: [] },
      {
        name: "update_scene",
        args: '{"location":"Throne Room","weather":{"type":"indoors"}}',
        verdict: "salvaged" as const,
        issues: ["update_scene.weather"],
      },
      {
        name: "upsert_quest",
        args: '{"name":42}',
        verdict: "dropped" as const,
        issues: ['name: Invalid input: expected string — sent "42"'],
      },
    ],
  },
];

// Regex literals hoisted to module scope (biome `useTopLevelRegex`).
const RE_TRIGGER = /Game actions on this turn/;
const RE_COUNT_3 = /3/;
const RE_EXPECTED_STRING = /Invalid input: expected string/;

test("collapsed by default; opening it names each call and whether it landed", async ({ mount, page }) => {
  await routeTrpc(page, { "rpg.listTurnToolCalls": () => RECORDED_TURN });

  const component = await mount(<TurnToolCallsDisclosureStory />);

  // §13.10 N3 — stable identity leads, the volatile count is suffixed, so this name survives a count change.
  const trigger = component.getByRole("button", { name: RE_TRIGGER });
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAccessibleName(RE_COUNT_3);

  // A transcript row must not open as a debug dump.
  await expect(component.getByText("update_scene")).toHaveCount(0);

  await trigger.click();

  await expect(component.locator("[data-slot=turn-tool-call]")).toHaveCount(3);
  await expect(component.getByText("update_party")).toBeVisible();
  await expect(component.getByText("recorded", { exact: true })).toBeVisible();
});

test("a DROPPED call says so, and its reason is VISIBLE TEXT (never a hover-only tooltip)", async ({ mount, page }) => {
  // The SCENE-DROPPED lesson: 12 identical silent drops cost a live session hours. The whole point of this
  // surface is that the reason reaches the person at the keyboard, on touch as well as on a mouse.
  await routeTrpc(page, { "rpg.listTurnToolCalls": () => RECORDED_TURN });

  const component = await mount(<TurnToolCallsDisclosureStory />);
  await component.getByRole("button", { name: RE_TRIGGER }).click();

  await expect(component.getByText("not recorded")).toBeVisible();
  await expect(component.getByText(RE_EXPECTED_STRING)).toBeVisible();
  // …and the SALVAGED arm names the field the closed vocabulary could not hold.
  await expect(component.getByText("partly recorded")).toBeVisible();
  await expect(component.getByText("update_scene.weather")).toBeVisible();
});

test("APPLICABILITY is per-VARIANT: the same slot swiped to an unrecorded variant renders nothing", async ({ mount, page }) => {
  // The swipe-correctness the `variantId` keying buys. A message-keyed record would wrongly show this
  // variant its sibling's calls; an absent record must render NOTHING, not an empty disclosure.
  await routeTrpc(page, { "rpg.listTurnToolCalls": () => RECORDED_TURN });

  const component = await mount(<TurnToolCallsOtherVariantStory />);

  await expect(component.getByRole("button", { name: RE_TRIGGER })).toHaveCount(0);
  await expect(component.locator("[data-slot=turn-tool-calls]")).toHaveCount(0);
});

test("a USER row never mounts it — `when` refuses before any lookup", async ({ mount, page }) => {
  await routeTrpc(page, { "rpg.listTurnToolCalls": () => RECORDED_TURN });

  const component = await mount(<TurnToolCallsUserRowStory />);

  await expect(component.locator("[data-slot=turn-tool-calls]")).toHaveCount(0);
});

test("a room with NO records renders no disclosure at all (a non-game chat is untouched)", async ({ mount, page }) => {
  // [[no-separate-reduced-modes]]: there is no flag and no "reduced" transcript — the surface is simply
  // absent where it does not apply.
  await routeTrpc(page, { "rpg.listTurnToolCalls": () => [] });

  const component = await mount(<TurnToolCallsDisclosureStory />);

  await expect(component.locator("[data-slot=turn-tool-calls]")).toHaveCount(0);
});
