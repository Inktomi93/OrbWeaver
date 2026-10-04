// substrate/summarizer — the summarize-slot facts one refinery call reads. Two properties: the model is read
// PER CALL (a run stamped with a model the owner has since moved off is false provenance, so nothing here may
// be memoised), and an unbound slot is `RefineryNotConfiguredError` rather than a silent default. The context
// window is `null` when the capability declares none — a `0` there would make every budget computation clamp
// to nothing instead of falling back.

import { RefineryNotConfiguredError } from "../../../../../packages/server/src/domain/refinery/contract/errors.ts";
import { summarizerFactsOf } from "../../../../../packages/server/src/domain/refinery/substrate/summarizer.ts";
import { makeFakeRoleClients } from "../../../../support/factories/role-clients.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("reads the structured slot's model and its context window", async () => {
  const clients = makeFakeRoleClients({ summarizerContextTokens: 32_000 });
  expect(await summarizerFactsOf(clients, undefined)).toEqual({ model: "test-summarize-model", contextTokens: 32_000 });
});

// The budget must fit the window the call sends: an Ollama native row sends the Utility preset's Max context.
test("on a route whose window the request sets, the window is the Utility preset's Max context", async () => {
  const clients = makeFakeRoleClients({ summarizerContextTokens: 32_000 });
  const base = await clients.resolved("structured");
  if (base?.capability.kind !== "generation") {
    throw new Error("expected a generation slot");
  }
  const generation = { ...base.capability.generation, context: { window: 32_000, settable: { max: 131_072 } } };
  const settable = {
    ...clients,
    resolved: (): ReturnType<typeof clients.resolved> => Promise.resolve({ ...base, capability: { kind: "generation", generation } }),
  };
  expect((await summarizerFactsOf(settable, { maxContextTokens: 16_384 })).contextTokens).toBe(16_384);
  expect((await summarizerFactsOf(clients, { maxContextTokens: 16_384 })).contextTokens).toBe(32_000);
});

test("an UNBOUND structured slot refuses by type — never a defaulted model", async () => {
  const clients = makeFakeRoleClients({ unbound: ["structured"] });
  await expect(summarizerFactsOf(clients, undefined)).rejects.toBeInstanceOf(RefineryNotConfiguredError);
});

test("the read happens per CALL — a model change between calls is visible immediately", async () => {
  const first = makeFakeRoleClients({ structuredModel: "model-a" });
  const second = makeFakeRoleClients({ structuredModel: "model-b" });
  expect((await summarizerFactsOf(first, undefined)).model).toBe("model-a");
  expect((await summarizerFactsOf(second, undefined)).model).toBe("model-b");
});

test("a NON-generation capability in the slot reports `null` tokens rather than inventing a window", async () => {
  const clients = makeFakeRoleClients();
  const embeddingSlot = {
    ...clients,
    resolved: (): ReturnType<typeof clients.resolved> => clients.resolved("embed"),
  };
  expect(await summarizerFactsOf(embeddingSlot, undefined)).toMatchObject({ contextTokens: null });
});
