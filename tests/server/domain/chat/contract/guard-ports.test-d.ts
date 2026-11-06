import type { RequireHostOp, RequireParticipantOp } from "@orb/contracts/chat";
import type { createWiredChatGuards } from "@orb/server/domain/chat";
import { expectTypeOf, test } from "vitest";

type Guards = ReturnType<typeof createWiredChatGuards>;

test("wired admission ports retain the canonical void-returning contracts", () => {
  expectTypeOf<Guards["requireHost"]>().toEqualTypeOf<RequireHostOp>();
  expectTypeOf<Guards["requireParticipant"]>().toEqualTypeOf<RequireParticipantOp>();
});
