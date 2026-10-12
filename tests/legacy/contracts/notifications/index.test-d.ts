// Type-level pin for the notification-type vocabulary (#1379 item 3) — the completeness half of a proof
// whose other half lives on the declaration itself.
//
// `NOTIFICATION_TYPES` is the runtime tuple the db's `notifications.type` column derives its enum and its
// CHECK list from. It used to be HAND-SPELLED in `@orb/db/schema/notifications.ts`, because the contract
// exported only the derived TYPE and a DDL fragment needs VALUES; the db test then proved the two agreed
// by reaching into zod's internal discriminated-union option shape at runtime. Moving the tuple to its one
// home removed the respelling; this file removes the introspection, by making the property a `tsc`
// obligation instead of an assertion.
//
// `satisfies readonly NotificationType[]` on the declaration already refuses a NON-MEMBER. The direction
// it CANNOT see is a MISSING one — a new `notificationEventSchema` arm whose discriminant nobody added to
// the tuple, which would silently ship a db CHECK that rejects the new event at insert time. That is what
// the `Exclude` below catches, and it is the exact failure the deleted runtime test existed for.

import type { NotificationType } from "@orb/contracts/notifications";
import { NOTIFICATION_TYPES } from "@orb/contracts/notifications";
import { expectTypeOf, test } from "vitest";

test("the tuple is EXACTLY the union — neither a missing member nor an extra one", () => {
  // Both directions, stated as one equality: the tuple's member type IS the union.
  expectTypeOf<(typeof NOTIFICATION_TYPES)[number]>().toEqualTypeOf<NotificationType>();
  // The missing-member direction spelled out on its own, because it is the one the declaration's
  // `satisfies` is blind to: a union member absent from the tuple leaves a residue here.
  expectTypeOf<Exclude<NotificationType, (typeof NOTIFICATION_TYPES)[number]>>().toEqualTypeOf<never>();
});

test("the tuple is a NON-EMPTY tuple type — what drizzle's `text({ enum })` requires", () => {
  // The reason the values are a literal tuple rather than `Object.keys` of a mapped Record: a
  // `readonly string[]` is not assignable to drizzle's `readonly [string, ...string[]]`.
  expectTypeOf(NOTIFICATION_TYPES[0]).toEqualTypeOf<"invite">();
  expectTypeOf(NOTIFICATION_TYPES).items.toExtend<NotificationType>();
});
