// A bulk remove deletes every owned card it names with no outside contention, seated or not: the deletes retire
// their canon one after another, so siblings never refuse each other, and every deleted card gets its audit row, one
// change event for the call, and its id in the result.
// @subject packages/server/src/domain/character/verbs/bulk-remove.ts
// @subject packages/server/src/domain/stats/persistence/retire-canon.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import { auditLogs } from "@orb/db";
import type { CharacterId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { and, eq } from "drizzle-orm";

const CARDS = 6;
// A publish after the call marks the end of what the call delivered, so a missing event cannot hang the read.
const END: UserBusEvent = { type: "settingsChanged" };

const LAYOUT_NAMES = ["unseated", "seated", "mixed"] as const;
const LAYOUTS = { unseated: () => false, seated: () => true, mixed: (index: number) => index % 2 === 0 } as const satisfies Record<
  (typeof LAYOUT_NAMES)[number],
  (index: number) => boolean
>;

async function cards(root: ServerTestHarness, owner: Principal, seated: (index: number) => boolean): Promise<readonly CharacterId[]> {
  const ids: CharacterId[] = [];
  for (let index = 0; index < CARDS; index += 1) {
    const handle = `bulk-card-${String(index)}`;
    const card = await root.services.character.create({
      principal: owner,
      input: createCharacterSchema.parse({ name: handle, handle, description: `Card ${handle}` }),
    });
    if (seated(index)) {
      const room = await root.services.chat.startChat({ principal: owner, characterIds: [card.id], opening: "none" });
      await root.app.chatRpgOps.postNarratorMessage(room.chat.id, "The room opens.");
    }
    ids.push(card.id);
  }
  return ids;
}

async function removalAudits(root: ServerTestHarness, owner: Principal): Promise<readonly string[]> {
  const rows = await root.db
    .select({ entityId: auditLogs.entityId })
    .from(auditLogs)
    .where(and(eq(auditLogs.actorUserId, owner.userId), eq(auditLogs.action, "character.remove")));
  return rows.map((row) => row.entityId ?? "").toSorted((a, b) => a.localeCompare(b));
}

for (const layout of LAYOUT_NAMES) {
  test(`a bulk remove of ${String(CARDS)} ${layout} cards deletes them all, audits each and announces once`, async () => {
    await using root = await createServerHarness();
    const owner = await root.principalFor(root.ownerId);
    const ids = await cards(root, owner, LAYOUTS[layout]);
    const kept = await root.services.character.create({
      principal: owner,
      input: createCharacterSchema.parse({ name: "kept", handle: "kept", description: "Stays." }),
    });
    const stop = new AbortController();
    const events = root.app.liveBuses.user.subscribeUserEvents(owner.userId, stop.signal)[Symbol.asyncIterator]();
    try {
      const result = await root.services.character.bulkRemove({ principal: owner, characterIds: ids });

      expect(result).toEqual({ applied: ids, failed: [] });
      // Control: the card the call did not name is still there, and nothing else is.
      expect(await root.services.character.count({ principal: owner })).toBe(1);
      expect((await root.services.character.get({ principal: owner, characterId: kept.id })).id).toBe(kept.id);
      expect(await removalAudits(root, owner)).toEqual(ids.toSorted((a, b) => a.localeCompare(b)));
      root.app.liveBuses.user.publishUserEvent(owner.userId, END);
      const seen: UserBusEvent[] = [];
      for (let next = await events.next(); !next.done && next.value !== END; next = await events.next()) {
        seen.push(next.value);
      }
      expect(seen.filter((event) => event.type === "charactersChanged")).toEqual([{ type: "charactersChanged" }]);
      await root.services.stats.reconcile(owner.userId);
      expect((await root.services.stats.overview(owner.userId))?.characters ?? 0).toBe(0);
    } finally {
      stop.abort();
    }
  });
}
