import type { AutomationRuleCreateInput, AutomationRuleEditable, AutomationRuleUpdateInput } from "@orb/contracts/automation";
import { automationRuleEditableSchema } from "@orb/contracts/automation";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { createRuleSaveSession } from "../../../../../packages/client/src/features/automation/lib/rule-save-session.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { createSeededIds } from "../../../../support/ids.ts";

const ids = createSeededIds();
const chatId = typeIdSchema(ID_PREFIX.chat).parse(ids.next(ID_PREFIX.chat));
const ruleId = typeIdSchema(ID_PREFIX.automationRule).parse(ids.next(ID_PREFIX.automationRule));
const requestId = typeIdSchema(ID_PREFIX.automationRuleCreation).parse(ids.next(ID_PREFIX.automationRuleCreation));
type Rule = Awaited<ReturnType<Parameters<typeof createRuleSaveSession>[0]["create"]>>;
type Body = Pick<Rule, keyof AutomationRuleEditable>;
const action = { type: "set_variable", scope: "chat", key: "beats", op: "inc", value: "1" } satisfies Body["actions"][number];
function body(name: string): Body {
  return {
    ...automationRuleEditableSchema.parse({
      name,
      description: null,
      predicateCel: null,
      trigger: { bus: "chat", type: "messageCommitted" },
      actions: [action],
    }),
    description: null,
    predicateCel: null,
    actions: [action],
  };
}
function row(value: Body): Rule {
  return {
    ...value,
    description: value.description ?? null,
    predicateCel: value.predicateCel ?? null,
    id: ruleId,
    chatId,
    enabled: false,
    position: 0,
    actionsCorrupt: false,
    rulePresetId: null,
    rulePresetKnobs: null,
    suggestOnRefusal: true,
    lastError: null,
    lastFiredAt: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

test("queued edits and teardown-equivalent duplicates share one birth and promote before PUT", async () => {
  const started = Promise.withResolvers<void>();
  const held = Promise.withResolvers<ReturnType<typeof row>>();
  const writes: string[] = [];
  const acknowledgments: string[] = [];
  const { save } = createRuleSaveSession({
    chatId,
    requestId,
    ruleId: null,
    assertOwner: () => undefined,
    create: (input) => {
      writes.push(`create:${input.name}:${input.creationRequestId}`);
      started.resolve();
      return held.promise;
    },
    update: (input) => {
      writes.push(`update:${input.name}:${input.ruleId}`);
      return Promise.resolve(row(body(input.name)));
    },
    acknowledge: (value) => {
      acknowledgments.push(value.name);
    },
  });
  const first = save(body("A"));
  await started.promise;
  const second = save(body("B"));
  const teardown = save(body("B"));
  expect(writes).toEqual([`create:A:${requestId}`]);
  held.resolve(row(body("A")));
  await Promise.all([first, second, teardown]);
  expect(writes).toEqual([`create:A:${requestId}`, `update:B:${ruleId}`]);
  expect(acknowledgments).toEqual(["A", "B"]);
});

test("an ambiguous create failure retains its request key, then explicitly updates a changed recovery", async () => {
  const births: AutomationRuleCreateInput[] = [];
  const updates: AutomationRuleUpdateInput[] = [];
  const recovered = { ...row(body("committed A")), enabled: true, position: 7 };
  const { save } = createRuleSaveSession({
    chatId,
    requestId,
    ruleId: null,
    assertOwner: () => undefined,
    create: (input) => {
      births.push(input);
      if (births.length === 1) {
        return Promise.reject(new Error("response lost after commit"));
      }
      return Promise.resolve(recovered);
    },
    update: (input) => {
      updates.push(input);
      return Promise.resolve({ ...recovered, ...body(input.name) });
    },
    acknowledge: () => undefined,
  });
  await expect(save(body("committed A"))).rejects.toThrow("response lost");
  await save(body("newer B"));
  expect(births.map((input) => input.creationRequestId)).toEqual([requestId, requestId]);
  expect(updates).toEqual([{ ...body("newer B"), ruleId }]);
  expect(recovered.enabled).toBe(true);
  expect(recovered.position).toBe(7);
});

test("acknowledged deletion and failed PUT never reopen creation", async () => {
  let births = 0;
  const updates: string[] = [];
  const { save } = createRuleSaveSession({
    chatId,
    requestId,
    ruleId: null,
    assertOwner: () => undefined,
    create: () => {
      births += 1;
      return Promise.resolve(row(body("A")));
    },
    update: (input) => {
      updates.push(input.ruleId);
      return Promise.reject(new Error("NOT_FOUND"));
    },
    acknowledge: () => undefined,
  });
  await save(body("A"));
  await expect(save(body("B"))).rejects.toThrow("NOT_FOUND");
  await expect(save(body("C"))).rejects.toThrow("NOT_FOUND");
  expect(births).toBe(1);
  expect(updates).toEqual([ruleId, ruleId]);
});

test("account switch during creation prevents acknowledgment and every queued write", async () => {
  const started = Promise.withResolvers<void>();
  const held = Promise.withResolvers<ReturnType<typeof row>>();
  const session: { sameOwner: boolean } = { sameOwner: true };
  let updates = 0;
  let acknowledgments = 0;
  const { save } = createRuleSaveSession({
    chatId,
    requestId,
    ruleId: null,
    assertOwner: () => {
      if (!session.sameOwner) {
        throw new Error("account changed");
      }
    },
    create: () => {
      started.resolve();
      return held.promise;
    },
    update: () => {
      updates += 1;
      return Promise.resolve(row(body("B")));
    },
    acknowledge: () => {
      acknowledgments += 1;
    },
  });
  const first = expect(save(body("A"))).rejects.toThrow("account changed");
  await started.promise;
  const second = expect(save(body("B"))).rejects.toThrow("account changed");
  session.sameOwner = false;
  held.resolve(row(body("A")));
  await Promise.all([first, second]);
  expect(updates).toBe(0);
  expect(acknowledgments).toBe(0);
});

test("a new authoritative row invalidates duplicate suppression for the previously saved body", async () => {
  const updates: string[] = [];
  const queue = createRuleSaveSession({
    chatId,
    requestId: null,
    ruleId,
    assertOwner: () => undefined,
    create: () => Promise.reject(new Error("Existing edits must not create")),
    update: (input) => {
      updates.push(input.name);
      return Promise.resolve(row(body(input.name)));
    },
    acknowledge: () => undefined,
  });
  await queue.save(body("Local A"));
  queue.observe(row(body("Remote C")));
  await queue.save(body("Local A"));
  expect(updates).toEqual(["Local A", "Local A"]);
});
