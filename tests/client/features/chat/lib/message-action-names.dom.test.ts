// The LITERAL control for the message row's static accessible names (#2436).
//
// Four components and ~47 CT locators across eight spec files now IMPORT these consts, which is what makes
// the coupling compile-time — and exactly what makes every one of those pins blind to a COPY change: assert
// `name: MESSAGE_EDIT_NAME` against a button rendering `MESSAGE_EDIT_NAME` and any wording survives. So the
// wording is pinned ONCE, here, at the consts' own mirror home. If this file goes red the copy changed;
// that is the point.
//
// Two of these strings are RULINGS rather than taste, and their tests say so: `Generate a variant`
// (#570, owner 2026-08-23 — the lone chevron generates, so borrowing the pager's word is the drift the
// ruling forbids) and `More message actions` (#869 — deliberately unlike the composer utility menu's own
// name, after Chrome stacked two tooltips with different copy). Changing either is changing that ruling.
import {
  MESSAGE_ACTIONS_MENU_NAME,
  MESSAGE_EDIT_NAME,
  MESSAGE_FORK_NAME,
  MESSAGE_REACTION_ADD_NAME,
  MESSAGE_REASONING_NAME,
  VARIANT_GENERATE_NAME,
  VARIANT_NEXT_NAME,
  VARIANT_PREV_NAME,
} from "../../../../../packages/client/src/features/chat/lib/message-action-names.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("the row action cluster's names", () => {
  expect(MESSAGE_EDIT_NAME).toBe("Edit message");
  expect(MESSAGE_FORK_NAME).toBe("Fork chat here");
  expect(MESSAGE_REACTION_ADD_NAME).toBe("Add a reaction");
  expect(MESSAGE_ACTIONS_MENU_NAME).toBe("More message actions");
});

test("the overflow trigger does NOT borrow the composer utility menu's name (#869)", () => {
  expect(MESSAGE_ACTIONS_MENU_NAME).not.toBe("Message tools");
});

test("the settled reasoning disclosure names the CHANNEL, never a fabricated duration", () => {
  expect(MESSAGE_REASONING_NAME).toBe("Reasoning");
  expect(MESSAGE_REASONING_NAME).not.toMatch(/thought for/i);
});

test("the variant pager's names", () => {
  expect(VARIANT_PREV_NAME).toBe("Previous variant");
  expect(VARIANT_NEXT_NAME).toBe("Next variant");
});

test("the lone chevron says it GENERATES — #570's ruling, not the pager's word", () => {
  expect(VARIANT_GENERATE_NAME).toBe("Generate a variant");
  expect(VARIANT_GENERATE_NAME).not.toBe(VARIANT_NEXT_NAME);
});
