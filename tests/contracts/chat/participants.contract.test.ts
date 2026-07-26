import { messageRoleSchema } from "@orb/contracts/chat";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { expect, test } from "../../support/fixtures";

// ═══ messageRoleSchema — THE canonical role wire (D32) ══════════════════════════

test("messageRoleSchema is z.enum(MESSAGE_ROLES) and round-trips system|user|assistant", () => {
  for (const role of MESSAGE_ROLES) {
    expect(messageRoleSchema.parse(role)).toBe(role);
  }
  expect(messageRoleSchema.options).toEqual(["system", "user", "assistant"]);
  expect(messageRoleSchema.safeParse("tool").success).toBe(false);
});
