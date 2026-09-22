// Resolver behavior not owned by the broad runtime smoke: actor ridesOn precedence, explicit-row selection,
// missing-provider refusal, and which id the capability rows read on the OpenRouter route — all through the
// real runtime fold.

import { createInferenceRuntime, DEFAULT_EMBED_MODEL, NoConnectionError } from "@orb/inference";
import { principal } from "../../support/factories/principal.ts";
import { expect, test } from "../../support/fixtures.ts";
import { openRouterCatalogFetch } from "../_openrouter-catalog.ts";
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

// ── #2575: capability facts must survive the OpenRouter route ────────────────────────────────────────────
// The resolve runs the REAL catalog parser over a raw OpenRouter fixture (the live catalog's own field names),
// so the advertised tier, the curated rows and the family floor fold exactly as they do in production.

async function openRouterCapability(model: string): Promise<unknown> {
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({ ownerId, providerId: "openrouter", model, allowBackground: true });
  stores.connections.rows.set(row.id, row);
  stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "chat", connectionId: row.id });
  const runtime = await createInferenceRuntime(fakeDeps({ stores, fetch: openRouterCatalogFetch() }));
  const outcome = await runtime.resolve({ task: "chat", principal: principal(ownerId) });
  return outcome.resolved.capability;
}

test("#2575: OpenRouter's advertised `tools` cell no longer erases the curated forced-choice refusal", async () => {
  for (const model of ["anthropic/claude-fable-5.1", "anthropic/claude-opus-5.5"]) {
    await expect(openRouterCapability(model), model).resolves.toMatchObject({ generation: { tools: { parallel: true, forcedChoice: false } } });
  }
  // PLANTED CONTROL: a Claude that accepts forced tool use states no refusal on the same route.
  const opus5 = await openRouterCapability("anthropic/claude-opus-5");
  expect(opus5).toMatchObject({ generation: { tools: { parallel: true } } });
  expect(opus5).not.toMatchObject({ generation: { tools: { forcedChoice: false } } });
});

test("#2575: a `:batch` variant takes its base model's curated facts (the catalog pairs them by canonical slug)", async () => {
  // The end-anchored o4-mini row states mandatory reasoning; its `:batch` sibling missed it by spelling alone.
  await expect(openRouterCapability("openai/o4-mini:batch")).resolves.toMatchObject({ generation: { reasoning: { mandatory: true } } });
  await expect(openRouterCapability("openai/o4-mini")).resolves.toMatchObject({ generation: { reasoning: { mandatory: true } } });
  await expect(openRouterCapability("anthropic/claude-fable-5.1:batch")).resolves.toMatchObject({
    generation: { tools: { forcedChoice: false }, reasoning: { mandatory: true } },
  });
});

test("#2575: a floating `~…-latest` alias folds as the target its catalog row names, and only then", async () => {
  await expect(openRouterCapability("~anthropic/claude-fable-latest")).resolves.toMatchObject({
    generation: { tools: { forcedChoice: false }, reasoning: { mandatory: true } },
  });
  // PLANTED CONTROL: an alias whose row names no target is left unmatched — no Claude row, no guessed facts.
  const mystery = await openRouterCapability("~anthropic/claude-mystery-latest");
  expect(mystery).not.toMatchObject({ generation: { tools: { forcedChoice: false } } });
  expect(mystery).not.toMatchObject({ generation: { reasoning: { mode: "adaptive" } } });
});
