// Real producers own encryption and closed storage; no fixture-side emitter or notification assembly.
import { notifications, userCredentials } from "@orb/db";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { eq } from "drizzle-orm";

const FIRST_SECRET = "bus-private-first-credential-material";
const NEXT_SECRET = "bus-private-replacement-credential-material";
const FOREIGN_SECRET = "bus-private-other-owner-credential-material";
const NOTIFICATION_SECRET = "bus-private-untrusted-notification-material";

test("canonical credential writes publish only the actual owned branded identity, never stored key material", async () => {
  await using root = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 1) });
  const owner = await root.internalCallerFor(root.ownerId);
  const foreign = await root.actor();
  const other = await root.internalCallerFor(foreign.id);
  const stop = new AbortController();
  const ownEvents = root.app.liveBuses.user.subscribeUserEvents(root.ownerId, stop.signal)[Symbol.asyncIterator]();
  const foreignEvents = root.app.liveBuses.user.subscribeUserEvents(foreign.id, stop.signal)[Symbol.asyncIterator]();
  try {
    const created = await owner.credentials.add({ provider: "custom-openai", key: FIRST_SECRET });
    const first = await ownEvents.next();
    const original = await root.db.select().from(userCredentials).where(eq(userCredentials.id, created.id)).get();
    if (original === undefined) {
      throw new Error("the canonical credential writer omitted its sealed row");
    }
    expect(first).toEqual({ done: false, value: { type: "credentialsChanged", credentialId: created.id } });
    expect(original.ownerId).toBe(root.ownerId);
    root.clock.advance(1);
    const replaced = await owner.credentials.replace({ credentialId: created.id, key: NEXT_SECRET });
    const second = await ownEvents.next();
    const rotated = await root.db.select().from(userCredentials).where(eq(userCredentials.id, created.id)).get();
    if (rotated === undefined) {
      throw new Error("the canonical replacement omitted its sealed row");
    }
    expect(replaced.id).toBe(created.id);
    expect(second).toEqual({ done: false, value: { type: "credentialsChanged", credentialId: created.id } });
    expect(rotated.ciphertext).not.toBe(original.ciphertext);
    const foreignView = await other.credentials.add({ provider: "custom-openai", key: FOREIGN_SECRET });
    const third = await foreignEvents.next();
    expect(third).toEqual({ done: false, value: { type: "credentialsChanged", credentialId: foreignView.id } });
    expect(await other.credentials.list()).toEqual([foreignView]);
    expect(await owner.credentials.list()).toEqual([replaced]);
    const publicBytes = JSON.stringify({ first, second, third, created, replaced, foreignView });
    for (const secret of [
      FIRST_SECRET,
      NEXT_SECRET,
      FOREIGN_SECRET,
      original.ciphertext,
      original.iv,
      original.tag,
      rotated.ciphertext,
      rotated.iv,
      rotated.tag,
    ]) {
      expect(publicBytes).not.toContain(secret);
    }
  } finally {
    stop.abort();
    await Promise.allSettled([ownEvents.return?.(), foreignEvents.return?.()]);
  }
});

test("real notification record and standing correction strip extra input before stored and recipient replay bytes", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const foreign = await root.actor();
  const other = await root.principalFor(foreign.id);
  const event = { type: "plugins-awaiting-consent", recipientUserId: principal.userId, pendingCount: 2, apiKey: NOTIFICATION_SECRET } as const;
  const raised = await root.services.notifications.record({ event });
  const stored = await root.db.select().from(notifications).where(eq(notifications.id, raised.id)).get();
  if (stored === undefined) {
    throw new Error("the canonical notification writer omitted its durable row");
  }
  expect(stored.payload).toEqual({ type: event.type, recipientUserId: principal.userId, pendingCount: 2 });
  expect(raised.payload).toEqual(stored.payload);
  const correction = { ...event, pendingCount: 1 };
  const corrected = await root.services.notifications.refreshStanding({ event: correction });
  expect(corrected).toHaveLength(1);
  expect(corrected[0]).toMatchObject({ id: raised.id, seq: raised.seq, payload: { type: event.type, recipientUserId: principal.userId, pendingCount: 1 } });
  const rows = await root.db.select().from(notifications).where(eq(notifications.id, raised.id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.payload).toEqual({ type: event.type, recipientUserId: principal.userId, pendingCount: 1 });
  const replay = await root.services.notifications.replaySince({ principal, afterSeq: 0 });
  expect(replay).toHaveLength(1);
  expect(replay[0]?.payload).toEqual(rows[0]?.payload);
  expect(await root.services.notifications.replaySince({ principal: other, afterSeq: 0 })).toEqual([]);
  expect(JSON.stringify({ raised, stored, corrected, rows, replay })).not.toContain(NOTIFICATION_SECRET);
});
