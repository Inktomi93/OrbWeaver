// A stored rule whose actions this build cannot decode is auto-disabled by a manual run; the index refresh that
// follows may fail and is retried at the next event. The undecodable row is planted directly: no verb writes it.
// @subject packages/server/src/domain/automation/substrate/run-now.ts
import { automationRules, closeDb } from "@orb/db";
import type { AutomationRuleId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, freshDb } from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";
import { enabledRule } from "../runtime.fixtures.ts";

function statementText(input: unknown): string | null {
  if (typeof input === "string") {
    return input;
  }
  if (typeof input === "object" && input !== null && "sql" in input && typeof input.sql === "string") {
    return input.sql;
  }
  return null;
}

async function storedRule(root: ServerTestHarness, id: AutomationRuleId): Promise<typeof automationRules.$inferSelect> {
  const row = await root.db.select().from(automationRules).where(eq(automationRules.id, id)).get();
  if (row === undefined) {
    throw new Error("the production-created rule has no stored row");
  }
  return row;
}

test("a failed index refresh after manual auto-disable preserves the committed run and retries at the event door", async () => {
  let armed = false;
  let refreshReads = 0;
  const db = await freshDb(
    (client) =>
      new Proxy(client, {
        get(target, property): unknown {
          const operation: unknown = Reflect.get(target, property, target);
          if (typeof operation !== "function") {
            return operation;
          }
          if (property !== "execute") {
            return operation.bind(target);
          }
          return (...args: readonly unknown[]): unknown => {
            const text = statementText(args[0]);
            if (armed && text !== null && /select distinct .* from "automation_rules"/u.test(text)) {
              refreshReads += 1;
              if (refreshReads === 1) {
                return Promise.reject(new Error("synthetic index read refusal"));
              }
            }
            return Reflect.apply(operation, target, args);
          };
        },
      }),
  );
  await using database = new AsyncDisposableStack();
  database.defer(() => closeDb(db));
  await using root = await createServerHarness({ db });
  const principal = await root.principalFor(root.ownerId);
  const { chat } = await root.services.chat.startChat({ principal, characterIds: [], opening: "none" });
  const rule = await enabledRule(root, {
    chatId: chat.id,
    name: "Corrupt stored actions",
    trigger: { bus: "chat", type: "chatOpened" },
    actions: [{ type: "set_variable", scope: "global", key: "corrupt", op: "set", value: "must not run" }],
  });
  const healthy = await enabledRule(root, {
    chatId: chat.id,
    name: "Actual retry witness",
    trigger: { bus: "chat", type: "chatOpened" },
    actions: [{ type: "set_variable", scope: "global", key: "retry-witness", op: "inc" }],
  });
  await root.db.run(sql`UPDATE ${automationRules} SET actions = ${JSON.stringify([{ not: "an arm" }])} WHERE id = ${rule.id}`);
  armed = true;
  expect(await root.services.automation.runRuleNow({ principal, ruleId: rule.id })).toEqual({ outcome: "action_error" });
  expect((await storedRule(root, rule.id)).enabled).toBe(false);
  expect(refreshReads, "the committed disable reached the physical refresh read refusal").toBe(1);
  await root.services.automation.handleEvent({ type: "chatOpened", chatId: chat.id });
  expect(refreshReads, "the next real event retried the stale index").toBe(2);
  expect(await root.services.automation.getGlobalVariable({ principal, key: "retry-witness" })).toBe("1");
  expect((await root.services.automation.listFires({ principal, ruleId: healthy.id })).map((fire) => fire.outcome)).toEqual(["fired"]);
});
