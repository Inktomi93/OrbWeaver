// @subject packages/server/src/domain/connection/contract/stored.ts
// A stored declaration another build wrote is planted directly: the current create verb cannot produce it.

import { modelIdSchema, providerIdSchema, SUMMARIZE_CONCURRENCY_MAX } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node";
import { sql } from "drizzle-orm";

test("stored summarize compatibility clamps only its cap and leaves the persisted declaration unchanged", async ({ db, ownerCaller }) => {
  const row = await ownerCaller.connection.create({
    providerId: providerIdSchema.parse("openrouter"),
    credentialId: null,
    baseUrl: null,
    model: modelIdSchema.parse("openai/gpt-4o-mini"),
  });
  const declaration = JSON.stringify({ kind: "generation", features: { concurrency: { summarize: SUMMARIZE_CONCURRENCY_MAX + 1, embed: 3 } } });
  await db.run(sql`update user_connections set declared = ${declaration} where id = ${row.id}`);

  expect((await ownerCaller.connection.get({ connectionId: row.id })).declared).toEqual({
    kind: "generation",
    features: { concurrency: { summarize: SUMMARIZE_CONCURRENCY_MAX, embed: 3 } },
  });
  expect(await db.get<{ declared: string }>(sql`select declared from user_connections where id = ${row.id}`)).toEqual({ declared: declaration });

  const rejected = JSON.stringify({ kind: "generation", features: { concurrency: { summarize: 0, embed: 3 } } });
  await db.run(sql`update user_connections set declared = ${rejected} where id = ${row.id}`);
  await expect(ownerCaller.connection.get({ connectionId: row.id })).rejects.toThrow("stored connection could not be read");
  expect(await db.get<{ declared: string }>(sql`select declared from user_connections where id = ${row.id}`)).toEqual({ declared: rejected });
});

test("a stored declared path the parse now refuses reads as unset, a plain one as written, and the bytes stay", async ({ db, ownerCaller }) => {
  const row = await ownerCaller.connection.create({
    providerId: providerIdSchema.parse("openrouter"),
    credentialId: null,
    baseUrl: null,
    model: modelIdSchema.parse("openai/gpt-4o-mini"),
  });
  const plain = { keyCheckPath: "/v1/me", rerankPath: "/rerank", sleep: { isSleepingPath: "/is_sleeping", wakePath: "/wake_up" } };
  const offOrigin = {
    keyCheckPath: "//evil.example/me",
    rerankPath: ".evil.example/collect",
    sleep: { isSleepingPath: "/is_sleeping", wakePath: "/\\evil.example/wake" },
  };
  const states = [
    { features: { ...offOrigin, detectServer: false }, reads: { detectServer: false } },
    { features: { ...plain, detectServer: false }, reads: { ...plain, detectServer: false } },
  ];
  for (const { features, reads } of states) {
    const declaration = JSON.stringify({ kind: "generation", features });
    await db.run(sql`update user_connections set declared = ${declaration} where id = ${row.id}`);
    expect((await ownerCaller.connection.get({ connectionId: row.id })).declared).toEqual({ kind: "generation", features: reads });
    expect(await db.get<{ declared: string }>(sql`select declared from user_connections where id = ${row.id}`)).toEqual({ declared: declaration });
  }
});
