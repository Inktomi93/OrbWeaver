// A real guest's own storage write meets the same key and value caps the UI relay's schema applies, measured the same
// way, and is refused with the relay's own coded refusal; nothing past a cap is written. Each case has an at-the-cap
// control whose value reads back under its exact key. A guest string crosses whole, so a plain long key reaches the
// measure as written; a NUL is refused before the measure (`tests/server/domain/plugin/substrate/stored-text-nul.int.test.ts`).
//
// A key wrapped in an array once crossed whole while a plain string was cut at its NUL, and main stored a NUL-bearing
// key that way far past the cap; the membrane now refuses a non-string key at the door, so those rows expect its refusal.
// @subject packages/server/src/domain/plugin/substrate/storage.ts
// @subject packages/server/src/infra/plugin-host/membrane.ts
import { spawn } from "node:child_process";
import { PLUGIN_KV_KEY_MAX_CHARS, PLUGIN_KV_VALUE_MAX_BYTES } from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node";
import type { GuestOps } from "@orb/testkit/node/composed";
import { createServerHarness, guestRunner, installGuest } from "@orb/testkit/node/composed";
import { PluginUiHostCallRefusedError } from "#server/domain/plugin/contract/errors.ts";

/** A string the guest builds from its parts, so a long key or value never rides the command's own arguments. A type
 *  alias, not an interface: the guest runner takes JSON records, and only an alias is assignable to an index signature. */
type Recipe = Readonly<{ head: string; fill: string; count: number; tail: string }>;

// `a.wrap` passes the key as a one-element array, which the membrane refuses at the door.
const KEY = "const b = (r) => r.head + r.fill.repeat(r.count) + r.tail; const k = a.wrap ? [b(a.key)] : b(a.key);";
const STORAGE_OPS = {
  set: `async (h, room, a) => { ${KEY} await h.storage.set(k, b(a.value)); return null; }`,
  create: `async (h, room, a) => { ${KEY} return (await h.storage.compareAndSet(k, null, b(a.value))).applied; }`,
  holds: `async (h, room, a) => { ${KEY} return (await h.storage.get(k)) === b(a.value); }`,
  count: "async (h) => (await h.storage.list()).length",
} as const satisfies GuestOps;

const plain = (text: string): Recipe => ({ head: "", fill: text, count: 1, tail: "" });
const repeated = (fill: string, count: number, head = "", tail = ""): Recipe => ({ head, fill, count, tail });

const NUL = "\0";
const MID_KEY_HEAD = `head${NUL}`;
const THREE_BYTE_CHAR = "中";
const THREE_BYTE_WIDTH = Buffer.byteLength(THREE_BYTE_CHAR, "utf8");
const WHOLE_CHARS = Math.floor(PLUGIN_KV_VALUE_MAX_BYTES / THREE_BYTE_WIDTH);
const ONE_BYTE_REMAINDER = PLUGIN_KV_VALUE_MAX_BYTES - WHOLE_CHARS * THREE_BYTE_WIDTH;
const FAR_PAST_KEY_CHARS = PLUGIN_KV_KEY_MAX_CHARS * 8;
const KEY_AT_CAP = repeated("k", PLUGIN_KV_KEY_MAX_CHARS);

/** A key that opens with `head` and is exactly `extra` UTF-16 units past the cap (0 = at the cap). */
const headedKey = (head: string, extra: number): Recipe => repeated("k", PLUGIN_KV_KEY_MAX_CHARS - head.length + extra, head);

type Write = Readonly<{ key: Recipe; value: Recipe; wrap: boolean }>;

interface SizeCase {
  readonly name: string;
  readonly op: "set" | "create";
  /** The refusal's name: the size check's, or the membrane's plain string refusal for a wrapped key. */
  readonly refusal: string;
  readonly past: Write;
  readonly atCap: Write;
}

const v = plain("v");
const SIZE_REFUSAL = PluginUiHostCallRefusedError.name;
const MEMBRANE_REFUSAL = Error.name;

const CASES: readonly SizeCase[] = [
  {
    name: "key one character past the key cap",
    op: "set",
    refusal: SIZE_REFUSAL,
    past: { key: repeated("k", PLUGIN_KV_KEY_MAX_CHARS + 1), value: v, wrap: false },
    atCap: { key: KEY_AT_CAP, value: v, wrap: false },
  },
  {
    name: "multi-byte value one byte past the byte cap",
    op: "set",
    refusal: SIZE_REFUSAL,
    past: { key: plain("value"), value: repeated(THREE_BYTE_CHAR, WHOLE_CHARS, "", "a".repeat(ONE_BYTE_REMAINDER + 1)), wrap: false },
    atCap: { key: plain("value"), value: repeated(THREE_BYTE_CHAR, WHOLE_CHARS, "", "a".repeat(ONE_BYTE_REMAINDER)), wrap: false },
  },
  ...(["set", "create"] as const).flatMap((op) => [
    {
      name: `${op} of an array-wrapped NUL-led key far past the key cap`,
      op,
      refusal: MEMBRANE_REFUSAL,
      past: { key: headedKey(NUL, FAR_PAST_KEY_CHARS), value: v, wrap: true },
      atCap: { key: KEY_AT_CAP, value: v, wrap: false },
    },
    {
      name: `${op} of an array-wrapped key with a NUL mid-key far past the key cap`,
      op,
      refusal: MEMBRANE_REFUSAL,
      past: { key: headedKey(MID_KEY_HEAD, FAR_PAST_KEY_CHARS), value: v, wrap: true },
      atCap: { key: KEY_AT_CAP, value: v, wrap: false },
    },
  ]),
];

test.for(CASES)("a guest's $name is refused and writes nothing; at the cap it is stored", { tags: ["slow"] }, async ({ op, refusal, past, atCap }) => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  const pluginId = await installGuest(root, owner, { slug: "kv-sizer", capabilities: ["storage.kv"] }, STORAGE_OPS);
  const run = guestRunner({ root, caller: owner, pluginId, chatId: null });

  expect(await run(op, past)).toEqual({ ok: false, name: refusal });
  expect(await run("count")).toEqual({ ok: true, value: 0 });

  expect(await run(op, atCap)).toMatchObject({ ok: true });
  expect(await run("holds", atCap)).toEqual({ ok: true, value: true });
  expect(await run("count")).toEqual({ ok: true, value: 1 });
});
