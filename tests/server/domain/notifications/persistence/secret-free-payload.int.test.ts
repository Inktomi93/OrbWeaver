// The closed notification union is the secret-free guard: a smuggled secret field never reaches the
// stored payload bytes.
// @subject packages/server/src/domain/notifications/verbs/record.ts
// @subject packages/server/src/domain/notifications/persistence/queries.ts

import { notifications } from "@orb/db";
import { eq, sql } from "drizzle-orm";
import { describe } from "vitest";
import { expect, test } from "../_fixtures.ts";

describe("record — the closed union is the secret-free belt", () => {
  test("an unknown secret field smuggled onto the event does NOT survive the parse", async ({ harness, notificationActors: actors }) => {
    const svc = harness.services.notifications;
    const dirty = {
      ...actors.aliceInvite,
      apiKey: "sk-leak-me",
      baseUrl: "https://evil.example",
    };
    const view = await svc.record({ event: dirty });
    expect(view.payload).toEqual(actors.aliceInvite);
    const [stored] = await harness.db
      .select({ payload: sql<string>`${notifications.payload}` })
      .from(notifications)
      .where(eq(notifications.id, view.id));
    expect(stored?.payload).toBe(JSON.stringify(actors.aliceInvite));
    expect(stored?.payload).not.toContain(dirty.apiKey);
    expect(stored?.payload).not.toContain(dirty.baseUrl);
  });
});
