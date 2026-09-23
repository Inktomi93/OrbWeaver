// verb: listConstantCanon — a chat's CONSTANT ("always"-scope) lorebook canon (docs/plans/rpg/design.md; the rpg
// crew's world-gen input). Load-bearing: only ENABLED always-scope entries of the chat's ATTACHED books
// project (keyword-scoped and disabled entries are excluded; an unattached book contributes nothing);
// priority DESC ordering; the projection is title+content only (lean pre-play canon, room-public — the
// caller gates membership upstream, mirroring listChatBooks).

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeHarness, principal, seedChat, seedUser } from "../../_support.ts";

describe("listConstantCanon", () => {
  test("projects only enabled always-scope entries of attached books, priority DESC, title+content only", async () => {
    const db = await freshDb();
    const harness = makeHarness(db, { requireChatHost: () => Promise.resolve() });
    const svc = createWorldInfoService(harness.ctx);
    const host = await seedUser(db, { handle: castId<Handle>("host") });
    const chatId = await seedChat(db);

    const attached = await svc.createBook({ principal: principal(host), input: { name: "Attached" } });
    await svc.attachToChat({ principal: principal(host), chatId, bookId: attached.id });

    // Constant (keyless => always by the keys-presence heuristic), two priorities to pin the ordering.
    await svc.createEntry({
      principal: principal(host),
      bookId: attached.id,
      input: { title: "Low canon", content: "low", priority: 1 },
    });
    await svc.createEntry({
      principal: principal(host),
      bookId: attached.id,
      input: { title: "High canon", content: "high", priority: 10 },
    });
    // Keyword-scoped (keys present) — excluded from constant canon.
    await svc.createEntry({
      principal: principal(host),
      bookId: attached.id,
      input: { title: "Keyed", content: "keyed", keys: ["dragon"], priority: 99 },
    });
    // Disabled always-scope — excluded.
    const disabled = await svc.createEntry({
      principal: principal(host),
      bookId: attached.id,
      input: { title: "Disabled", content: "off", priority: 50 },
    });
    await svc.updateEntry({ principal: principal(host), entryId: disabled.id, input: { enabled: false } });

    // An UNATTACHED book's constant entry must not leak into this chat's canon.
    const unattached = await svc.createBook({ principal: principal(host), input: { name: "Unattached" } });
    await svc.createEntry({
      principal: principal(host),
      bookId: unattached.id,
      input: { title: "Elsewhere", content: "no", priority: 100 },
    });

    const canon = await svc.listConstantCanon({ chatId });
    expect(canon).toEqual([
      { title: "High canon", content: "high" },
      { title: "Low canon", content: "low" },
    ]);
  });

  test("a chat with no attached books yields empty canon", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const chatId = await seedChat(db);
    expect(await svc.listConstantCanon({ chatId })).toEqual([]);
  });
});
