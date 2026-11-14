// A store a plugin guest writes text into refuses a NUL in a key or a value, because the database driver returns
// stored text cut at its first NUL: a stored NUL would read back as a different string, and two keys differing only
// after one would read back as one. Each refusal writes nothing; the same write without the NUL is stored.
// The relay door is `tests/server/domain/plugin/verbs/ui-host-call-refusals.int.test.ts`.
// @subject packages/server/src/domain/plugin/persistence/storage.ts
// @subject packages/server/src/domain/automation/verbs/set-global-variable.ts
import { spawn } from "node:child_process";
import { expect, test } from "@orb/testkit/node";
import type { GuestOps } from "@orb/testkit/node/composed";
import { createServerHarness, guestRunner, installGuest } from "@orb/testkit/node/composed";
import { PluginUiHostCallRefusedError } from "#server/domain/plugin/contract/errors.ts";

const NUL = "\0";
const KEY = "key";
const VALUE = "value";
const WITH_NUL = (text: string): string => `${text}${NUL}tail`;

const OPS = {
  set: "async (h, room, a) => { await h.storage.set(a.key, a.value); return null; }",
  create: "async (h, room, a) => (await h.storage.compareAndSet(a.key, null, a.value)).applied",
  replace: "async (h, room, a) => (await h.storage.compareAndSet(a.key, a.expected, a.value)).applied",
  storedKeys: "async (h) => (await h.storage.list()).length",
  setVariable: "async (h, room, a) => { await h.variables.set(a.key, a.value); return null; }",
} as const satisfies GuestOps;

const STORAGE_REFUSAL = PluginUiHostCallRefusedError.name;

const STORAGE_CASES = [
  { name: "storage.set with a NUL in the key", op: "set", refused: { key: WITH_NUL(KEY), value: VALUE }, stored: { key: KEY, value: VALUE } },
  { name: "storage.set with a NUL in the value", op: "set", refused: { key: KEY, value: WITH_NUL(VALUE) }, stored: { key: KEY, value: VALUE } },
  { name: "an atomic create with a NUL in the key", op: "create", refused: { key: WITH_NUL(KEY), value: VALUE }, stored: { key: KEY, value: VALUE } },
  { name: "an atomic create with a NUL in the value", op: "create", refused: { key: KEY, value: WITH_NUL(VALUE) }, stored: { key: KEY, value: VALUE } },
] as const;

test.for(STORAGE_CASES)("a guest's $name is refused and writes nothing; without the NUL it is stored", { tags: ["slow"] }, async ({ op, refused, stored }) => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  const pluginId = await installGuest(root, owner, { slug: "nul-storer", capabilities: ["storage.kv"] }, OPS);
  const run = guestRunner({ root, caller: owner, pluginId, chatId: null });

  expect(await run(op, refused)).toEqual({ ok: false, name: STORAGE_REFUSAL });
  expect(await run("storedKeys")).toEqual({ ok: true, value: 0 });
  expect(await run(op, stored)).toMatchObject({ ok: true });
  expect(await run("storedKeys")).toEqual({ ok: true, value: 1 });
});

test("a guest's compare-and-set whose expected value holds a NUL is refused, since no stored value can match it", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  const pluginId = await installGuest(root, owner, { slug: "nul-storer", capabilities: ["storage.kv"] }, OPS);
  const run = guestRunner({ root, caller: owner, pluginId, chatId: null });
  await run("set", { key: KEY, value: VALUE });

  expect(await run("replace", { key: KEY, expected: WITH_NUL(VALUE), value: "next" })).toEqual({ ok: false, name: STORAGE_REFUSAL });
  expect(await run("replace", { key: KEY, expected: VALUE, value: "next" })).toEqual({ ok: true, value: true });
});

test.for([
  { name: "key", refused: { key: WITH_NUL(KEY), value: VALUE } },
  { name: "value", refused: { key: KEY, value: WITH_NUL(VALUE) } },
] as const)(
  "a guest's variables.set with a NUL in the $name is refused and writes nothing; without the NUL it is stored",
  { tags: ["slow"] },
  async ({ refused }) => {
    await using root = await createServerHarness({ pluginSpawn: spawn });
    const owner = await root.principalFor(root.ownerId);
    const pluginId = await installGuest(root, owner, { slug: "nul-variables", capabilities: ["global_vars"] }, OPS);
    const run = guestRunner({ root, caller: owner, pluginId, chatId: null });
    // The guest must meet the set verb's own refusal, so the verb names it.
    const verbRefusal = await root.services.automation.setGlobalVariable({ principal: owner, ...refused }).then(
      () => null,
      (error: unknown) => (error instanceof Error ? error.name : null),
    );
    expect(verbRefusal).toEqual(expect.any(String));

    expect(await run("setVariable", refused)).toEqual({ ok: false, name: verbRefusal });
    expect(await root.services.automation.getGlobalVariable({ principal: owner, key: refused.key })).toBeNull();
    expect(await run("setVariable", { key: KEY, value: VALUE })).toEqual({ ok: true, value: null });
    expect(await root.services.automation.getGlobalVariable({ principal: owner, key: KEY })).toBe(VALUE);
  },
);
