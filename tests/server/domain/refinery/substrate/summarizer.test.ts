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
  expect(await summarizerFactsOf(clients)).toEqual({ model: "test-summarize-model", contextTokens: 32_000 });
});

test("an UNBOUND structured slot refuses by type — never a defaulted model", async () => {
  const clients = makeFakeRoleClients({ unbound: ["structured"] });
  await expect(summarizerFactsOf(clients)).rejects.toBeInstanceOf(RefineryNotConfiguredError);
});

test("the read happens per CALL — a model change between calls is visible immediately", async () => {
  const first = makeFakeRoleClients({ structuredModel: "model-a" });
  const second = makeFakeRoleClients({ structuredModel: "model-b" });
  expect((await summarizerFactsOf(first)).model).toBe("model-a");
  expect((await summarizerFactsOf(second)).model).toBe("model-b");
});

test("a NON-generation capability in the slot reports `null` tokens rather than inventing a window", async () => {
  const clients = makeFakeRoleClients();
  const embeddingSlot = {
    ...clients,
    resolved: (): ReturnType<typeof clients.resolved> => clients.resolved("embed"),
  };
  expect(await summarizerFactsOf(embeddingSlot)).toMatchObject({ contextTokens: null });
});
