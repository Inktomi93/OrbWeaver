// Resolver behavior not owned by the broad runtime smoke: actor ridesOn precedence, explicit-row selection,
// and missing-provider refusal through the real runtime fold.

import { createInferenceRuntime, DEFAULT_EMBED_MODEL, NoConnectionError } from "@orb/inference";
import { principal } from "../../support/factories/principal.ts";
import { expect, test } from "../../support/fixtures.ts";
import { fakeConnection, fakeDeps, memoryStores, newRuleId, newUserId } from "../_support.ts";

test("structured resolves through the actor's summarize binding before the funder's summarize binding", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const actorRow = fakeConnection({ ownerId, providerId: "custom-openai", model: "actor-model", baseUrl: "http://actor.test/v1", allowBackground: true });
  const ownerRow = fakeConnection({ ownerId, providerId: "custom-openai", model: "owner-model", baseUrl: "http://owner.test/v1", allowBackground: true });
  stores.connections.rows.set(actorRow.id, actorRow);
  stores.connections.rows.set(ownerRow.id, ownerRow);
  const ruleId = newRuleId();
  stores.bindings.bind({ actorKind: "automation-rule", actorId: ruleId, task: "summarize", connectionId: actorRow.id });
  stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "summarize", connectionId: ownerRow.id });
  const runtime = await createInferenceRuntime(fakeDeps({ stores }));

  const resolved = await runtime.resolve({ task: "structured", principal: principal(ownerId), actor: { kind: "automation-rule", ruleId } });
  expect(resolved.resolved.connectionId).toBe(actorRow.id);
  expect(resolved.resolved.model).toBe("actor-model");
  expect(resolved.resolved.task).toBe("structured");
});

test("an explicit owned connection bypasses the binding and carries its declared embedding capability", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const bound = fakeConnection({ ownerId, providerId: "local-light", model: DEFAULT_EMBED_MODEL, allowBackground: true });
  const explicit = fakeConnection({
    ownerId,
    providerId: "local-light",
    model: "acme/other-encoder",
    declared: { kind: "embedding", embedding: { dims: 1024, dtype: "q8", input: ["text"] } },
    allowBackground: true,
  });
  stores.connections.rows.set(bound.id, bound);
  stores.connections.rows.set(explicit.id, explicit);
  stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "embed", connectionId: bound.id });
  const runtime = await createInferenceRuntime(fakeDeps({ stores }));

  const outcome = await runtime.resolve({ task: "embed", principal: principal(ownerId), connectionId: explicit.id });
  expect(outcome.resolved.connectionId).toBe(explicit.id);
  expect(outcome.resolved.model).toBe("acme/other-encoder");
  expect(outcome.resolved.capability).toMatchObject({ kind: "embedding", embedding: { dims: 1024, dtype: "q8", input: ["text"] } });
});

test("a connection whose provider is absent refuses as no-connection", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({ ownerId, providerId: "plugin:gone/relay", model: "model", allowBackground: true });
  stores.connections.rows.set(row.id, row);
  stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "chat", connectionId: row.id });
  const runtime = await createInferenceRuntime(fakeDeps({ stores }));
  await expect(runtime.resolve({ task: "chat", principal: principal(ownerId) })).rejects.toBeInstanceOf(NoConnectionError);
});
