// Detached RPG rounds seal fresh traces after their outer SEND; the snapshot rows they write move from
// absent to uncommitted to committed under each trace.
// @subject packages/server/src/domain/chat/engine/engine.ts
// @subject packages/server/src/domain/chat/verbs/turn.ts

import { closeDb, rpgSnapshots } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { freshHeldDb, processObservability } from "@orb/testkit/node/composed";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { eq } from "drizzle-orm";
import { coreFrame, coreSse } from "../../chat/engine/core-physical.ts";
import { turnRpgReply, turnRpgRoom } from "../../chat/verbs/turn-rpg-physical.ts";

test("the actual detached RPG round seals a fresh trace after its outer SEND has completed and its durable write settles", async () => {
  const held = await freshHeldDb();
  await using lifetime = new AsyncDisposableStack();
  lifetime.defer(() => closeDb(held.db));
  const h = lifetime.use(
    await turnRpgRoom(
      [
        (): Response =>
          coreSse([
            coreFrame({ choices: [{ delta: { content: "The keeper reaches the observatory." } }] }),
            terminalSseLine({ usage: { promptTokens: 12, completionTokens: 8 } }),
          ]),
        (): Response => turnRpgReply("", "Detached observatory"),
      ],
      { server: { db: held.db } },
      "cheap",
    ),
  );
  const outer = `rpg-round-outer:${h.chatId}`;
  const gate = held.hold(/^insert into "rpg_snapshots"/u);
  try {
    const sending = processObservability.inRequestSpan(outer, "controlled public SEND", () =>
      h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Reach the observatory." }),
    );
    await gate.reached;
    const sent = await sending;
    expect(sent.aborted).toBe(false);
    const assistant = sent.messages.find((message) => message.role === "assistant");
    if (assistant === undefined) {
      throw new Error("the traced turn has no selected assistant");
    }
    expect(processObservability.traces(100).find((trace) => trace.requestId === outer)).toMatchObject({ rootName: "controlled public SEND", status: "ok" });
    expect(await h.root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.variantId, assistant.selectedVariantId))).toEqual([]);
    gate.release();
    await h.root.settleBackground();
    expect(await h.root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.variantId, assistant.selectedVariantId))).toMatchObject([
      { messageId: assistant.id, location: "Detached observatory" },
    ]);
    const rounds = processObservability
      .traces(100)
      .filter((trace) => trace.rootName === "rpg.turnCompleted" && trace.spans.some((span) => span.attributes["messageId"] === assistant.id));
    expect(rounds).toHaveLength(1);
    expect(rounds[0]).toMatchObject({ requestId: expect.stringMatching(/^rpg-turn:/u), status: "ok" });
    expect(rounds[0]?.requestId).not.toBe(outer);
    expect(rounds[0]?.spans.find((span) => span.name === "rpg.turnCompleted")?.parentSpanId).toBeUndefined();
  } finally {
    gate.release();
    await h.root.settleBackground();
  }
});

test("the actual SEND user-commit confirms prior state under its own fresh trace after the outer request seals", async () => {
  const held = await freshHeldDb();
  await using lifetime = new AsyncDisposableStack();
  lifetime.defer(() => closeDb(held.db));
  const h = lifetime.use(
    await turnRpgRoom(
      [
        (): Response => turnRpgReply("The keeper offers a draft beat.", "Committed observatory"),
        (): Response => turnRpgReply("The keeper acknowledges the player's next beat."),
      ],
      { server: { db: held.db } },
    ),
  );
  const params = { principal: h.owner, chatId: h.chatId };
  const initial = await h.root.services.chat.send({ ...params, content: "Offer the first beat." });
  expect(initial.aborted).toBe(false);
  const assistant = initial.messages.find((message) => message.role === "assistant");
  if (assistant === undefined) {
    throw new Error("the traced commit has no prior assistant variant");
  }
  await h.root.settleBackground();
  const variantId = assistant.selectedVariantId;
  expect(await h.root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.variantId, variantId))).toMatchObject([
    { committed: 0, location: "Committed observatory" },
  ]);
  const outer = `rpg-user-commit-outer:${h.chatId}`;
  const gate = held.hold(/^update "rpg_snapshots" set "committed"/u);
  try {
    const sending = processObservability.inRequestSpan(outer, "controlled committing SEND", () =>
      h.root.services.chat.send({ ...params, content: "Accept that draft beat." }),
    );
    await gate.reached;
    const sent = await sending;
    expect(sent.aborted).toBe(false);
    const user = sent.messages.find((message) => message.role === "user");
    if (user === undefined) {
      throw new Error("the committing SEND has no actual user row");
    }
    expect(processObservability.traces(100).find((trace) => trace.requestId === outer)).toMatchObject({ rootName: "controlled committing SEND", status: "ok" });
    expect(await h.root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.variantId, variantId))).toMatchObject([{ committed: 0 }]);
    gate.release();
    await h.root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.variantId, variantId));
    await h.root.settleBackground();
    expect(await h.root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.variantId, variantId))).toMatchObject([
      { committed: 1, location: "Committed observatory" },
    ]);
    const commits = processObservability
      .traces(100)
      .filter((trace) => trace.rootName === "rpg.userCommit" && trace.spans.some((span) => span.attributes["messageId"] === user.id));
    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({ requestId: `rpg-user-commit:${user.id}`, status: "ok" });
    expect(commits[0]?.requestId).not.toBe(outer);
    expect(commits[0]?.spans.find((span) => span.name === "rpg.userCommit")?.parentSpanId).toBeUndefined();
  } finally {
    gate.release();
    await h.root.settleBackground();
  }
});
