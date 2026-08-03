// verb: fetchModels — draft + saved paths through the injected infra/network op (best-effort, [] floors).

import type { ProviderMetadata } from "@orb/contracts/credentials";
import { userCredentials } from "@orb/db";
import { createCredentialsService } from "@orb/server/domain/credentials";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("fetchModels", () => {
  test("draft path forwards raw fields to the fetch op and returns its models", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    h.setModels(["gpt-x", "gpt-y"]);

    const models = await svc.fetchModels({
      principal: principal(owner),
      draft: { baseUrl: "https://llm.local/v1", key: "sk" },
    });
    expect(models).toEqual(["gpt-x", "gpt-y"]);
    expect(h.fetched[0]).toMatchObject({ baseUrl: "https://llm.local/v1", apiKey: "sk" });
  });

  test("saved custom_openai path decrypts + reads metadata baseUrl for the fetch op", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const cred = await svc.add({
      principal: principal(owner),
      provider: "custom_openai",
      key: "sk-c",
      metadata: { kind: "custom_openai", baseUrl: "https://saved.test/v1" },
    });
    h.setModels(["m1"]);

    const models = await svc.fetchModels({ principal: principal(owner), credentialId: cred.id });
    expect(models).toEqual(["m1"]);
    expect(h.fetched[0]).toMatchObject({ baseUrl: "https://saved.test/v1", apiKey: "sk-c" });
  });

  test("neither draft nor credentialId → [] (no fetch)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    expect(await svc.fetchModels({ principal: principal(owner) })).toEqual([]);
    expect(h.fetched).toHaveLength(0);
  });

  test("a custom_openai row with corrupt/missing baseUrl metadata → [] (never fetches undefined)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const cred = await svc.add({
      principal: principal(owner),
      provider: "custom_openai",
      key: "sk-c",
      metadata: { kind: "custom_openai", baseUrl: "https://placeholder.test/v1" },
    });
    await db
      .update(userCredentials)
      // FABRICATION-OK: a deliberately corrupt custom_openai row (no baseUrl) — proves the read seam returns null for it.
      .set({ metadata: { kind: "custom_openai" } as unknown as ProviderMetadata })
      .where(eq(userCredentials.id, cred.id));

    const models = await svc.fetchModels({ principal: principal(owner), credentialId: cred.id });
    expect(models).toEqual([]);
    expect(h.fetched).toHaveLength(0);
  });
});
