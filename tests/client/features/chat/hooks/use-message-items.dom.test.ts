// Unit: `lastUserRowIndex` — the pin-prompt scroll target. Pure over the merged canon+ghost item
// list; the surface pins whatever index this returns to the viewport top on a new send. The helper is typed
// structurally, so these fixtures need only `{ kind, view: { id, role } }` — no full MessageView value.
import type { MessageView } from "@orb/contracts/chat";
import { lastUserRowIndex } from "../../../../../packages/client/src/features/chat/hooks/use-message-items.ts";
import { expect, test } from "../../../../support/fixtures.ts";

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
