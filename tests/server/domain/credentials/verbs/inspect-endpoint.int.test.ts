// verb: inspectEndpoint — saved custom_openai → builds the resolved credential + calls the injected
// inspect op; a non-custom credential returns a non-throwing "not a custom endpoint" result.

import type { ProviderMetadata } from "@orb/contracts/credentials";
import { userCredentials } from "@orb/db";
import { createCredentialsService } from "@orb/server/domain/credentials";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedCredential, seedUser } from "../_support.ts";

describe("inspectEndpoint", () => {
  test("a saved custom_openai credential is resolved and handed to the inspect op", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const cred = await svc.add({
      principal: principal(owner),
      provider: "custom_openai",
      key: "sk-c",
      metadata: { kind: "custom_openai", baseUrl: "https://e.test/v1", model: "m-default" },
    });

    const result = await svc.inspectEndpoint({
      principal: principal(owner),
      credentialId: cred.id,
    });
    expect(result.ok).toBe(true);
    expect(h.inspected[0]?.model).toBe("m-default");
    expect(h.inspected[0]?.credential).toMatchObject({
      source: "custom_openai",
      baseUrl: "https://e.test/v1",
      apiKey: "sk-c",
    });
  });

  test("an explicit model overrides the metadata default", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const cred = await svc.add({
      principal: principal(owner),
      provider: "custom_openai",
      key: "sk-c",
      metadata: { kind: "custom_openai", baseUrl: "https://e.test/v1", model: "m-default" },
    });
    await svc.inspectEndpoint({
      principal: principal(owner),
      credentialId: cred.id,
      model: "m-override",
    });
    expect(h.inspected[0]?.model).toBe("m-override");
  });

  test("a non-custom credential returns a non-throwing 'not a custom endpoint' result", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const { svc, owner, cred } = await seedCredential(db, h);
    const result = await svc.inspectEndpoint({
      principal: principal(owner),
      credentialId: cred.id,
    });
    expect(result.ok).toBe(false);
    expect(h.inspected).toHaveLength(0);
  });

  test("a custom_openai row with corrupt/missing baseUrl metadata → clean ok:false (never invoked)", async () => {
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

    const result = await svc.inspectEndpoint({
      principal: principal(owner),
      credentialId: cred.id,
    });
    expect(result.ok).toBe(false);
    expect(h.inspected).toHaveLength(0);
  });
});
