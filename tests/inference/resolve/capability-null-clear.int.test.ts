// A curated row that states `tools: null` removes the tools block a broader row for the same model family stated, and
// leaves the rest of the capability alone; a sibling model the null row does not name keeps the block.
// @subject packages/inference/src/capability/synthesize.ts

import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

test("a curated null clears the tools block for the model it names and no other", async () => {
  await using root = await createServerHarness({ providerFetch: () => Promise.reject(new Error("the capability read must not reach the network")) });
  const principal = await root.principalFor(root.ownerId);
  const capabilityOf = async (model: string): Promise<{ readonly tools: unknown; readonly structured: boolean | undefined }> => {
    const row = await root.services.connection.create({
      principal,
      providerId: "openai",
      credentialId: null,
      baseUrl: null,
      model,
      declared: { kind: "generation", features: { detectServer: false } },
    });
    const { resolved } = await root.services.connection.resolve({ principal, task: "chat", connectionId: row.id });
    if (resolved.capability.kind !== "generation") {
      throw new Error("the connection resolved no generation capability");
    }
    const { generation } = resolved.capability;
    return { tools: generation.tools, structured: generation.output.structured };
  };

  const kept = await capabilityOf("gpt-4.1");
  expect(kept.tools).toMatchObject({ parallel: true });

  const cleared = await capabilityOf("gpt-6.1-sol");
  expect(cleared.tools).toBeUndefined();
  expect(cleared.structured).toBe(true);
});
