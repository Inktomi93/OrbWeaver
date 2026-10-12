import type { SessionView } from "@orb/contracts/session";
import { expectTypeOf, test } from "vitest";

// `SessionView` is a plain interface with no schema, so its shape is a compile-time contract.

// The token is not identity: the opaque token, its peppered hash, the SESSION_SECRET pepper and the owning
// userId are server-only. None may leak onto the admin-facing device view. This is the BFF browser session,
// not the agent-sdk chat session, so no SDK-frame lineage field belongs on it either.
test("SessionView is the device-list shape and declares no secret, identity or SDK-lineage field", () => {
  expectTypeOf<keyof SessionView>().toEqualTypeOf<"id" | "createdAt" | "lastSeenAt" | "expiresAt" | "revokedAt" | "userAgent">();
});

// A live device has revokedAt null; a UA-less mint has userAgent null.
test("revokedAt and userAgent are nullable", () => {
  expectTypeOf<SessionView["revokedAt"]>().toEqualTypeOf<number | null>();
  expectTypeOf<SessionView["userAgent"]>().toEqualTypeOf<string | null>();
});
