// The mounted rule birth is idempotent on its request id: a response lost after the real handler committed is
// recovered by the retry, never minted twice. The caller is the box owner's own loopback session.
// @subject packages/server/src/transport/trpc/routers/automation.ts
import { once } from "node:events";
import { createServer } from "node:http";
import { ID_PREFIX } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

const body = {
  timeZone: UTC_TIME_ZONE,
  name: "custom",
  trigger: { bus: "chat" as const, type: "messageCommitted" as const },
  actions: [{ type: "set_variable" as const, scope: "chat" as const, key: "mood", op: "set" as const, value: "grim" }],
};

test("lost mounted HTTP response after real commit recovers one unchanged birth with no second position", async () => {
  await using root = await createServerHarness({
    physicalPeer: () => "127.0.0.1",
    authConfig: { mode: "single-user", fallback: "owner" },
  });
  const owner = await root.internalCallerFor(root.ownerId);
  const other = await root.actor();
  const { chat } = await owner.chat.startChat({ characterIds: [], opening: "none" });
  const birth = { ...body, chatId: chat.id, creationRequestId: root.idSource.typeId(ID_PREFIX.automationRuleCreation) };
  const forgedCatalog = await root.http.request(`/api/trpc/automation.listRuleTools?input=${encodeURIComponent(JSON.stringify({ userId: other.id }))}`);
  expect(forgedCatalog.status).toBe(400);
  await forgedCatalog.arrayBuffer();

  const committed = Promise.withResolvers<void>();
  const handlerFailure = Promise.withResolvers<never>();
  // The relay runs the real request to completion, reads the committed answer, then drops the client's socket.
  const relay = createServer((req, res) => {
    void (async (): Promise<void> => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        if (!Buffer.isBuffer(chunk)) {
          throw new Error("expected an HTTP byte buffer");
        }
        chunks.push(chunk);
      }
      const response = await root.http.request(`http://localhost${req.url ?? ""}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: Buffer.concat(chunks).toString("utf8"),
      });
      if (response.status !== 200) {
        throw new Error(`expected committed response, got ${String(response.status)}`);
      }
      await response.text();
      committed.resolve();
      res.destroy();
    })().catch((error: Error) => {
      handlerFailure.reject(error);
      res.destroy();
    });
  });
  relay.listen(0, "127.0.0.1");
  try {
    await once(relay, "listening");
    const address = relay.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected loopback address");
    }
    const request = fetch(`http://127.0.0.1:${String(address.port)}/api/trpc/automation.createRule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(birth),
    });
    // Settle the client side now so the relay's drop is observed, not reported as an unhandled rejection.
    const clientOutcome = request.then(
      () => "delivered",
      () => "lost",
    );
    await Promise.race([committed.promise, handlerFailure.promise]);
    expect(await clientOutcome).toBe("lost");
    const stored = await owner.automation.listRules({ chatId: chat.id });
    expect(stored).toHaveLength(1);
    expect(await owner.automation.createRule(birth)).toEqual(stored[0]);
    expect(await owner.automation.createRule({ ...birth, name: "response-loss retry" })).toEqual(stored[0]);
    expect(await owner.automation.listRules({ chatId: chat.id })).toEqual(stored);
    const recovered = stored[0];
    if (recovered === undefined) {
      throw new Error("expected committed birth");
    }
    const updated = await owner.automation.updateRule({ ...body, ruleId: recovered.id, name: "ordinary update after recovery" });
    expect(updated).toMatchObject({ id: recovered.id, name: "ordinary update after recovery", enabled: false, position: 0 });
    expect(await owner.automation.listRules({ chatId: chat.id })).toEqual([updated]);
  } finally {
    relay.closeAllConnections();
    await new Promise<void>((resolve, reject) => relay.close((error) => (error === undefined ? resolve() : reject(error))));
  }
});
