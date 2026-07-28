// Unit: `lastUserRowIndex` — the pin-prompt scroll target (PD-147). Pure over the merged canon+ghost item
// list; the surface pins whatever index this returns to the viewport top on a new send. The helper is typed
// structurally, so these fixtures need only `{ kind, view: { id, role } }` — no full MessageView value.
import type { MessageView } from "@orb/contracts/chat";
import { isStateAnchorSlot, lastUserRowIndex } from "../../../../../packages/client/src/features/chat/hooks/use-message-items";
import { expect, test } from "../../../../support/fixtures";

function row(id: string, role: MessageView["role"]): { kind: "message"; view: { id: string; role: MessageView["role"] } } {
  return { kind: "message", view: { id, role } };
}
const ghost = { kind: "ghost", id: "__ghost__" } as const;

test("returns the index of the last user row, ignoring a trailing ghost", () => {
  const items = [row("a", "assistant"), row("u1", "user"), row("r1", "assistant"), row("u2", "user"), ghost];
  expect(lastUserRowIndex(items)).toBe(3);
});

test("returns -1 when there is no user row (greeting-only thread)", () => {
  expect(lastUserRowIndex([row("g", "assistant"), ghost])).toBe(-1);
});

test("returns -1 for an empty list", () => {
  expect(lastUserRowIndex([])).toBe(-1);
});

// `isStateAnchorSlot` — the rpg state-anchor filter (W-A): an EMPTY-body committed slot is a silent snapshot
// carrier the list hides; any row with content (a real turn, a restore notice) renders.
test("an empty-body slot is a state anchor (hidden)", () => {
  expect(isStateAnchorSlot({ content: "" })).toBe(true);
  expect(isStateAnchorSlot({ content: "   " })).toBe(true);
});

test("a slot WITH content still renders (a real turn, a checkpoint-restore notice)", () => {
  expect(isStateAnchorSlot({ content: "Restored to a checkpoint." })).toBe(false);
  expect(isStateAnchorSlot({ content: "hi" })).toBe(false);
});
