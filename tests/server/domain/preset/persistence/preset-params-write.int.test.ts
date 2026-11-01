// @subject packages/contracts/src/preset/index.ts
// @subject packages/server/src/transport/trpc/routers/preset.ts
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { presets } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { eq, sql } from "drizzle-orm";

const outcome = (call: Promise<unknown>): Promise<unknown> =>
  call.then(
    () => "accepted",
    (err: unknown) => (err as { code?: unknown }).code,
  );

const strayParams = { ...DEFAULT_PROMPT_CONFIG, params: { temperature: 0.7, notAKnob: 1 } };

test("preset.create and preset.update refuse a stray key inside params instead of resetting the blob", async ({ harness }) => {
  const caller = await harness.internalCallerFor(harness.ownerId);
  const kept = await caller.preset.create({
    name: "Tuned",
    kind: "chat",
    config: { ...DEFAULT_PROMPT_CONFIG, params: { temperature: 0.7 } },
  });

  const create = await outcome(caller.preset.create({ name: "Stray", kind: "chat", config: strayParams }));
  const update = await outcome(caller.preset.update({ id: kept.id, config: strayParams }));
  // Positive control: the same door accepts a clean params value.
  const control = await outcome(caller.preset.update({ id: kept.id, config: { ...DEFAULT_PROMPT_CONFIG, params: { temperature: 0.5 } } }));

  expect({ create, update, control, strayRows: (await caller.preset.list()).filter((p) => p.name === "Stray").length }).toEqual({
    create: "BAD_REQUEST",
    update: "BAD_REQUEST",
    control: "accepted",
    strayRows: 0,
  });
  expect((await caller.preset.get({ id: kept.id })).config.params).toEqual({ temperature: 0.5 });
});

test("a stored row whose params fail the schema still loads, with default params", async ({ harness }) => {
  const caller = await harness.internalCallerFor(harness.ownerId);
  const row = await caller.preset.create({ name: "Legacy", kind: "chat", config: DEFAULT_PROMPT_CONFIG });
  await harness.db
    .update(presets)
    .set({ config: sql`${JSON.stringify({ ...DEFAULT_PROMPT_CONFIG, params: { temperature: 0.7, notAKnob: 1 } })}` })
    .where(eq(presets.id, row.id));

  const loaded = await caller.preset.get({ id: row.id });

  expect(loaded.config.params).toEqual({});
  expect(loaded.config.sections).toEqual(DEFAULT_PROMPT_CONFIG.sections);
});
