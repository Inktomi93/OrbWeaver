// A real guest's own storage write meets the same key and value caps the UI relay's schema applies, measured the same
// way, and is refused with the relay's own coded refusal; nothing past a cap is written. Each case has an at-the-cap
// control that is stored.
//
// A NUL-led key: the host reads a guest's string argument only up to its first NUL, so this key reaches the storage
// write as the empty key, which the table's CHECK stored. The host now refuses it. No guest door delivers a key with a
// NUL in it, so that row's control is the plain key at the cap; the relay's refusal suite counts a NUL in full.
// @subject packages/server/src/domain/plugin/substrate/storage.ts
import { spawn } from "node:child_process";
import { PLUGIN_KV_KEY_MAX_CHARS, PLUGIN_KV_VALUE_MAX_BYTES } from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node";
import type { GuestOps } from "@orb/testkit/node/composed";
import { createServerHarness, guestRunner, installGuest } from "@orb/testkit/node/composed";
import { PluginUiHostCallRefusedError } from "#server/domain/plugin/contract/errors.ts";

/** A string the guest builds from its parts, so a long key or value never rides the command's own arguments. A type
 *  alias, not an interface: the guest runner takes JSON records, and only an alias is assignable to an index signature. */
type Recipe = Readonly<{ head: string; fill: string; count: number; tail: string }>;

const textOf = (recipe: Recipe): string => recipe.head + recipe.fill.repeat(recipe.count) + recipe.tail;

const BUILD = "const b = (r) => r.head + r.fill.repeat(r.count) + r.tail;";
const STORAGE_OPS = {
  set: `async (h, room, a) => { ${BUILD} await h.storage.set(b(a.key), b(a.value)); return null; }`,
  create: `(h, room, a) => { ${BUILD} return h.storage.compareAndSet(b(a.key), null, b(a.value)); }`,
  keys: "(h) => h.storage.list()",
} as const satisfies GuestOps;

const plain = (text: string): Recipe => ({ head: "", fill: text, count: 1, tail: "" });
const repeated = (fill: string, count: number, head = "", tail = ""): Recipe => ({ head, fill, count, tail });

const NUL = "\0";
const THREE_BYTE_CHAR = "中";
const THREE_BYTE_WIDTH = Buffer.byteLength(THREE_BYTE_CHAR, "utf8");
const WHOLE_CHARS = Math.floor(PLUGIN_KV_VALUE_MAX_BYTES / THREE_BYTE_WIDTH);
const ONE_BYTE_REMAINDER = PLUGIN_KV_VALUE_MAX_BYTES - WHOLE_CHARS * THREE_BYTE_WIDTH;
const FAR_PAST_KEY_CHARS = PLUGIN_KV_KEY_MAX_CHARS * 8;
const KEY_AT_CAP = repeated("k", PLUGIN_KV_KEY_MAX_CHARS);

interface SizeCase {
  readonly name: string;
  readonly op: keyof typeof STORAGE_OPS;
  readonly past: { readonly key: Recipe; readonly value: Recipe };
  readonly atCap: { readonly key: Recipe; readonly value: Recipe };
}

const CASES: readonly SizeCase[] = [
  {
    name: "key one character past the key cap",
    op: "set",
    past: { key: repeated("k", PLUGIN_KV_KEY_MAX_CHARS + 1), value: plain("v") },
    atCap: { key: KEY_AT_CAP, value: plain("v") },
  },
  {
    name: "NUL-led key far past the key cap",
    op: "set",
    past: { key: repeated("k", FAR_PAST_KEY_CHARS, NUL), value: plain("v") },
    atCap: { key: KEY_AT_CAP, value: plain("v") },
  },
  {
    name: "multi-byte value one byte past the byte cap",
    op: "set",
    past: { key: plain("value"), value: repeated(THREE_BYTE_CHAR, WHOLE_CHARS, "", "a".repeat(ONE_BYTE_REMAINDER + 1)) },
    atCap: { key: plain("value"), value: repeated(THREE_BYTE_CHAR, WHOLE_CHARS, "", "a".repeat(ONE_BYTE_REMAINDER)) },
  },
  {
    name: "atomic create of a NUL-led key far past the key cap",
    op: "create",
    past: { key: repeated("k", FAR_PAST_KEY_CHARS, NUL), value: plain("v") },
    atCap: { key: KEY_AT_CAP, value: plain("v") },
  },
];

test.for(CASES)(
  "a guest's $name is refused with the relay's coded refusal and writes nothing; at the cap it is stored",
  { tags: ["slow"] },
  async ({ op, past, atCap }) => {
    await using root = await createServerHarness({ pluginSpawn: spawn });
    const owner = await root.principalFor(root.ownerId);
    const pluginId = await installGuest(root, owner, { slug: "kv-sizer", capabilities: ["storage.kv"] }, STORAGE_OPS);
    const run = guestRunner({ root, caller: owner, pluginId, chatId: null });

    expect(await run(op, past)).toEqual({ ok: false, name: PluginUiHostCallRefusedError.name });
    expect(await run("keys")).toEqual({ ok: true, value: [] });

    expect(await run(op, atCap)).toMatchObject({ ok: true });
    expect(await run("keys")).toEqual({ ok: true, value: [textOf(atCap.key)] });
  },
);
