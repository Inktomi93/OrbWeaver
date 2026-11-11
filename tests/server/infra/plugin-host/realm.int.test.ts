// What a plugin guest can reach from its global object is one reviewed list, and its only time and entropy sources are
// the host's injected seams. A name a runtime upgrade adds turns this file red until a reviewer adds it here.
// @subject packages/server/src/infra/plugin-host/realm.ts
import { spawn } from "node:child_process";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { z } from "zod";

// The reviewed guest surface, one row per level of the global object's prototype chain: the global's own names, then
// `Object.prototype`'s. `Date` and `performance` are the realm's throwing stubs; `orb` is the one name the realm installs.
const GUEST_SURFACE = [
  [
    "AggregateError",
    "Array",
    "ArrayBuffer",
    "BigInt",
    "BigInt64Array",
    "BigUint64Array",
    "Boolean",
    "DOMException",
    "DataView",
    "Date",
    "Error",
    "EvalError",
    "FinalizationRegistry",
    "Float16Array",
    "Float32Array",
    "Float64Array",
    "Function",
    "Infinity",
    "Int16Array",
    "Int32Array",
    "Int8Array",
    "InternalError",
    "Iterator",
    "JSON",
    "Map",
    "Math",
    "NaN",
    "Number",
    "Object",
    "Promise",
    "Proxy",
    "RangeError",
    "ReferenceError",
    "Reflect",
    "RegExp",
    "Set",
    "SharedArrayBuffer",
    "String",
    "Symbol",
    "Symbol(Symbol.toStringTag)",
    "SyntaxError",
    "TypeError",
    "URIError",
    "Uint16Array",
    "Uint32Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "WeakMap",
    "WeakRef",
    "WeakSet",
    "decodeURI",
    "decodeURIComponent",
    "encodeURI",
    "encodeURIComponent",
    "escape",
    "eval",
    "globalThis",
    "isFinite",
    "isNaN",
    "orb",
    "parseFloat",
    "parseInt",
    "performance",
    "queueMicrotask",
    "undefined",
    "unescape",
  ],
  [
    "__defineGetter__",
    "__defineSetter__",
    "__lookupGetter__",
    "__lookupSetter__",
    "__proto__",
    "constructor",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString",
    "toString",
    "valueOf",
  ],
];

// Timers, I/O and ambient authority the realm header says a guest never holds. Checked apart from the list, so a
// reviewer who widens the list to admit one of these still meets a red.
const NEVER_REACHABLE = ["setTimeout", "setInterval", "fetch", "process", "require", "console", "Atomics", "crypto", "Temporal"];

const ENUMERATE = `
const names = (o) => [...Object.getOwnPropertyNames(o), ...Object.getOwnPropertySymbols(o).map(String)].sort();
const chain = [];
for (let o = globalThis; o !== null; o = Object.getPrototypeOf(o)) { chain.push(names(o)); }
orb.host(1).log.info(JSON.stringify(chain));`;

// Each ambient source is tried, then each injected seam is read twice.
const READ_TIME_AND_ENTROPY = `
const h = orb.host(1);
const attempt = (read) => { try { read(); return "live"; } catch { return "denied"; } };
h.log.info(JSON.stringify({
  ambient: [attempt(() => Date.now()), attempt(() => new Date()), attempt(() => Math.random()), attempt(() => performance.now())],
  clock: [h.clock.nowEpochMs(), h.clock.nowEpochMs()],
  random: [h.random.next(), h.random.next()],
}));`;

const INJECTED_RANDOM = 0.25;
const CLOCK_STEP_MS = 60_000;

const readingSchema = z.strictObject({ ambient: z.array(z.string()), clock: z.array(z.number()), random: z.array(z.number()) });

const LOG_LEVEL_PREFIX = /^\[info\] /;

/** Run a snippet in a fresh room as the owner and answer the one line it logged. */
async function snippetRunner(root: ServerTestHarness): Promise<(code: string) => Promise<string>> {
  const caller = await root.internalCallerFor(root.ownerId);
  const room = (await caller.chat.startChat({ characterIds: [] })).chat;
  return async (code): Promise<string> => {
    const result = await caller.plugin.runSnippet({ chatId: room.id, code });
    expect(result.error).toBeUndefined();
    const [line] = result.logLines;
    return z.string().parse(line?.replace(LOG_LEVEL_PREFIX, ""));
  };
}

test("a guest enumerates exactly the reviewed global surface, and no timer, I/O or ambient authority", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const run = await snippetRunner(root);
  const surface = z.array(z.array(z.string())).parse(JSON.parse(await run(ENUMERATE)));

  expect(surface).toEqual(GUEST_SURFACE);
  expect(surface.flat().filter((name) => NEVER_REACHABLE.includes(name))).toEqual([]);
});

test("a guest's only clock and entropy are the injected seams; the ambient ones refuse", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn, random: () => INJECTED_RANDOM });
  const run = await snippetRunner(root);

  const first = readingSchema.parse(JSON.parse(await run(READ_TIME_AND_ENTROPY)));
  root.clock.advance(CLOCK_STEP_MS);
  const second = readingSchema.parse(JSON.parse(await run(READ_TIME_AND_ENTROPY)));

  expect(first.ambient).toEqual(["denied", "denied", "denied", "denied"]);
  expect(first.clock).toEqual([root.clock.now() - CLOCK_STEP_MS, root.clock.now() - CLOCK_STEP_MS]);
  expect(second.clock).toEqual([root.clock.now(), root.clock.now()]);
  expect([...first.random, ...second.random]).toEqual([INJECTED_RANDOM, INJECTED_RANDOM, INJECTED_RANDOM, INJECTED_RANDOM]);
});
