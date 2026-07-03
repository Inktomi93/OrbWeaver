import type { BuddyAgentRequest } from "@orb/server/domain/buddy";
import { expectTypeOf, test } from "vitest";

// Type-level pins for THE FIREWALL (participants-agents-identity §8.6). The buddy
// writes its own `buddy_turns`, NEVER chat `messages` — so `BuddyAgentRequest` has NO `chatId` slot:
// passing chat context into a buddy turn is structurally unrepresentable (a compile error), not a runtime
// guard. This is the seam chat (P5, D38) reuses; until §8.6 makes buddy a participant, the firewall holds.

test("BuddyAgentRequest has NO chatId slot (the firewall)", () => {
  // If a `chatId` field were ever added, this assertion fails `tsc` → the firewall regression is caught.
  expectTypeOf<BuddyAgentRequest>().not.toHaveProperty("chatId");
});

test("BuddyAgentRequest carries the agent-turn pieces (soul prompt + view prompt + sealed credential)", () => {
  expectTypeOf<BuddyAgentRequest>().toHaveProperty("systemPrompt");
  expectTypeOf<BuddyAgentRequest>().toHaveProperty("prompt");
  expectTypeOf<BuddyAgentRequest>().toHaveProperty("credential");
  expectTypeOf<BuddyAgentRequest>().toHaveProperty("toolServer");
});
