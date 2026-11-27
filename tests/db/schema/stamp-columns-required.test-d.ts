// A row stamp is required in its table's insert type, so every insert states it from the injected clock and none
// falls back to the stored wall-clock default. One case per stamp name `stampColumn` builds.
// @subject packages/db/src/custom-types/index.ts
// @subject packages/db/src/schema/workloads.ts

import type { assets, chatParticipants, dailyStats, embedSpaceState, messages, sessions, workloads } from "@orb/db/schema";
import { expectTypeOf, test } from "vitest";

type RequiredKeys<T> = { [K in keyof T]-?: Record<never, never> extends Pick<T, K> ? never : K }[keyof T];

test("each stamp name is a required insert key", () => {
  expectTypeOf<"scheduledAt" | "createdAt" | "updatedAt">().toExtend<RequiredKeys<typeof workloads.$inferInsert>>();
  expectTypeOf<"createdAt">().toExtend<RequiredKeys<typeof messages.$inferInsert>>();
  expectTypeOf<"computedAt">().toExtend<RequiredKeys<typeof dailyStats.$inferInsert>>();
  expectTypeOf<"joinedAt">().toExtend<RequiredKeys<typeof chatParticipants.$inferInsert>>();
  expectTypeOf<"completedAt">().toExtend<RequiredKeys<typeof embedSpaceState.$inferInsert>>();
  expectTypeOf<"uploadedAt">().toExtend<RequiredKeys<typeof assets.$inferInsert>>();
  expectTypeOf<"lastSeenAt">().toExtend<RequiredKeys<typeof sessions.$inferInsert>>();
});

declare const stated: typeof sessions.$inferInsert;

test("an insert that leaves a stamp out does not compile", () => {
  const { lastSeenAt: _left, ...unstamped } = stated;
  // @ts-expect-error a session insert without `lastSeenAt` must not compile
  const insert: typeof sessions.$inferInsert = unstamped;
  expectTypeOf(insert).toBeObject();
});
