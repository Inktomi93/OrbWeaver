// Canonical credential writes publish only the owned branded identity on the bus, while the stored
// user_credentials row holds the key as ciphertext and a rotation replaces it.

import { userCredentials } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

const FIRST_SECRET = "bus-private-first-credential-material";
const NEXT_SECRET = "bus-private-replacement-credential-material";
const FOREIGN_SECRET = "bus-private-other-owner-credential-material";

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
