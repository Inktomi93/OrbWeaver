// @subject packages/contracts/src/chat/metadata.ts
// The wait-for-everyone knob and the count the server's send and the composer's waiting line both read. A stored
// group blob from before the knob reads as off, and the count restarts at every reply.

import { humansYetToWrite, storedGroupConfigSchema } from "@orb/contracts/chat";
import type { UserId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { expect, test } from "@orb/testkit/node";

const ANN = brandedId("UserId").parse("ann");
const BO = brandedId("UserId").parse("bo");
const CY = brandedId("UserId").parse("cy");

function row(role: MessageRole, authorUserId: UserId | null): { readonly role: MessageRole; readonly authorUserId: UserId | null } {
  return { role, authorUserId };
}

test("a stored group blob written before the knob reads as a room that never waits", () => {
  expect(storedGroupConfigSchema.parse({ output: "per-speaker", policy: "list" }).waitForEveryone).toBe(false);
  expect(storedGroupConfigSchema.parse({ output: "narrator", policy: "list", waitForEveryone: true }).waitForEveryone).toBe(true);
});

test("a corrupt stored value heals to off instead of reverting the whole room to the defaults", () => {
  const parsed = storedGroupConfigSchema.parse({ output: "narrator", policy: "list", waitForEveryone: "yes" });
  expect(parsed).toMatchObject({ output: "narrator", policy: "list", waitForEveryone: false });
});

test("only lines after the last reply count, in roster order", () => {
  const canon = [row("user", ANN), row("assistant", null), row("user", CY), row("assistant", null), row("user", BO)];
  expect(humansYetToWrite([ANN, BO, CY], canon)).toEqual([ANN, CY]);
});

test("a room with no reply yet counts every line, and a fresh reply restarts the count", () => {
  expect(humansYetToWrite([ANN, BO], [row("user", ANN), row("user", BO)])).toEqual([]);
  expect(humansYetToWrite([ANN, BO], [row("user", ANN), row("user", BO), row("assistant", null)])).toEqual([ANN, BO]);
});

test("a system row is neither a reply nor a write, and an authorless line counts for nobody", () => {
  const canon = [row("user", ANN), row("system", null), row("user", null)];
  expect(humansYetToWrite([ANN, BO], canon)).toEqual([BO]);
});

test("a line from someone no longer present counts for nobody present", () => {
  expect(humansYetToWrite([ANN], [row("user", BO)])).toEqual([ANN]);
});
