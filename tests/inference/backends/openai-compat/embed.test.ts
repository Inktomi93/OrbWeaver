// Pair-input evidence must not change ordinary text embedding requests on either hosted SDK dialect.
import { providerIdSchema } from "@orb/contracts/inference";
import { runOpenAiCompatEmbed } from "../../../../packages/inference/src/backends/openai-compat/embed.ts";
import { curatedRows } from "../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../packages/inference/src/capability/synthesize.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeApiKeySecret, fakeDeps, fakeResolved } from "../../_support.ts";
import type { RecordedRequest } from "../_hosted-support.ts";
import { scriptedJsonFetch } from "../_hosted-support.ts";

test.each([
  { providerId: "openai", model: "text-embedding-3-small" },
  { providerId: "openrouter", model: "openai/text-embedding-3-small" },
])("$providerId text embeddings keep their existing input and provider model stamp", async ({ providerId, model }) => {
  const capability = synthesizeCapability("embedding", "other", { curated: curatedRows({ providerId: providerIdSchema.parse(providerId), model }) }).capability;
  const connection = fakeResolved({ task: "embed", providerId, model, capability, secret: fakeApiKeySecret("test-key") });
  const recorded: RecordedRequest[] = [];
  const fetch = scriptedJsonFetch(
    [JSON.stringify({ object: "list", model, data: [{ object: "embedding", index: 0, embedding: [3, 4] }], usage: { prompt_tokens: 2, total_tokens: 2 } })],
    recorded,
  );
  const deps = fakeDeps();
  const result = await runOpenAiCompatEmbed({ connection, input: "lighthouse keeper", dimensions: 2 }, { log: deps.log, transport: { fetch, app: deps.app } });
  expect(recorded).toHaveLength(1);
  expect(recorded[0]?.body).toMatchObject({ model, input: ["lighthouse keeper"], dimensions: 2 });
  expect(recorded[0]?.body).not.toHaveProperty("messages");
  expect(result.model).toBe(model);
  expect(Array.from(result.vectors[0] ?? [])).toEqual([expect.closeTo(0.6), expect.closeTo(0.8)]);
});
